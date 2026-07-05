import { describe, expect, it, vi } from 'vitest'
import { useCursorList } from './use-cursor-list.js'

/**
 * 创建模拟的 fetch 函数，返回可控的分页数据。
 */
function createMockFetch<T>(pages: Array<{ items: T[]; endCursor: string | null; hasNextPage: boolean }>) {
  let callCount = 0

  return {
    fetchFn: vi.fn().mockImplementation(() => {
      const page = pages[callCount]
      callCount += 1
      if (!page) {
        return Promise.resolve({ items: [] as T[], endCursor: null, hasNextPage: false })
      }
      return Promise.resolve(page)
    }),
    get callCount() {
      return callCount
    },
  }
}

describe('useCursorList', () => {
  it('首次 load 应加载第一页数据', async () => {
    const { fetchFn } = createMockFetch([
      { items: [1, 2, 3], endCursor: 'cursor-1', hasNextPage: true },
    ])

    const { items, loading, hasMore, load } = useCursorList(fetchFn)

    await load()

    expect(items.value).toEqual([1, 2, 3])
    expect(hasMore.value).toBe(true)
    expect(loading.value).toBe(false)
  })

  it('loadMore 应将后续数据追加到列表末尾', async () => {
    const { fetchFn } = createMockFetch([
      { items: [1, 2], endCursor: 'cursor-1', hasNextPage: true },
      { items: [3, 4], endCursor: 'cursor-2', hasNextPage: false },
    ])

    const { items, load, loadMore, hasMore } = useCursorList(fetchFn)

    await load()
    expect(items.value).toEqual([1, 2])
    expect(hasMore.value).toBe(true)

    await loadMore()
    expect(items.value).toEqual([1, 2, 3, 4])
    expect(hasMore.value).toBe(false)
  })

  it('hasMore 为 false 时 loadMore 不应发起请求', async () => {
    const { fetchFn } = createMockFetch([
      { items: [1], endCursor: 'cursor-1', hasNextPage: false },
    ])

    const { load, loadMore } = useCursorList(fetchFn)

    await load()
    expect(fetchFn).toHaveBeenCalledTimes(1)

    await loadMore()
    // 不应再次调用 fetchFn
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('loading 为 true 时 loadMore 不应发起重复请求', async () => {
    const { fetchFn } = createMockFetch([
      { items: [1, 2], endCursor: 'cursor-1', hasNextPage: true },
      { items: [3, 4], endCursor: 'cursor-2', hasNextPage: false },
    ])

    const { load, loadMore } = useCursorList(fetchFn)

    await load()

    // 同时发起两次 loadMore，第二次应被跳过
    await Promise.all([loadMore(), loadMore()])

    // 只应调用了 2 次（load + 1 次 loadMore）
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('load 应清空旧数据并重新加载', async () => {
    const { fetchFn } = createMockFetch([
      { items: [1, 2], endCursor: 'cursor-1', hasNextPage: true },
      { items: [3, 4], endCursor: 'cursor-2', hasNextPage: false },
      { items: [5, 6], endCursor: 'cursor-3', hasNextPage: false },
    ])

    const { items, load, loadMore } = useCursorList(fetchFn)

    await load()
    await loadMore()
    expect(items.value).toEqual([1, 2, 3, 4])

    // 重新加载，应清空旧数据
    await load()
    expect(items.value).toEqual([5, 6])
  })

  it('fetchFn 抛错时 error 应被设置', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('网络错误'))

    const { error, load } = useCursorList(fetchFn)

    await load()

    expect(error.value).toBeInstanceOf(Error)
    expect(error.value?.message).toBe('网络错误')
  })

  it('AbortError 应被过滤，不暴露给 UI', async () => {
    // 模拟 keq flowControl('abort') 产生的 AbortError，
    // 浏览器环境抛出 DOMException，Node/jsdom 中可能为普通 Error
    const abortError = new Error('The operation was aborted.')
    abortError.name = 'AbortError'
    const fetchFn = vi.fn().mockRejectedValue(abortError)

    const { error, load } = useCursorList(fetchFn)

    await load()

    // AbortError 不应暴露给 UI
    expect(error.value).toBeNull()
  })

  it('load 失败后 items 应保持原值', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ items: [1, 2], endCursor: 'c1', hasNextPage: true })
      .mockRejectedValueOnce(new Error('加载失败'))

    const { items, load, loadMore } = useCursorList(fetchFn)

    await load()
    expect(items.value).toEqual([1, 2])

    await loadMore()
    // loadMore 失败，items 应保持原值
    expect(items.value).toEqual([1, 2])
  })

  it('应使用 options.pageSize 配置每页数量', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1],
      endCursor: null,
      hasNextPage: false,
    })

    const { load } = useCursorList(fetchFn, { pageSize: 10 })

    await load()

    expect(fetchFn).toHaveBeenCalledWith({ first: 10 })
  })

  it('默认 pageSize 应为 20', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [],
      endCursor: null,
      hasNextPage: false,
    })

    const { load } = useCursorList(fetchFn)

    await load()

    expect(fetchFn).toHaveBeenCalledWith({ first: 20 })
  })

  it('loadMore 应传递 after 参数', async () => {
    const { fetchFn } = createMockFetch([
      { items: [1, 2], endCursor: 'cursor-aaa', hasNextPage: true },
      { items: [3, 4], endCursor: null, hasNextPage: false },
    ])

    const { load, loadMore } = useCursorList(fetchFn)

    await load()
    await loadMore()

    expect(fetchFn).toHaveBeenNthCalledWith(2, {
      first: 20,
      after: 'cursor-aaa',
    })
  })
})
