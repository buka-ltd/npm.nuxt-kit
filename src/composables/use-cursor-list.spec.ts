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

    const { items, isLoading, hasMore, load } = useCursorList(fetchFn)

    await load()

    expect(items.value).toEqual([1, 2, 3])
    expect(hasMore.value).toBe(true)
    expect(isLoading.value).toBe(false)
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

  it('isLoading 为 true 时 loadMore 不应发起重复请求', async () => {
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
    expect((error.value as Error).message).toBe('网络错误')
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

  // === immediate 选项 ===

  it('immediate: true 应在创建时自动加载第一页', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1, 2, 3],
      endCursor: 'cursor-1',
      hasNextPage: true,
    })

    const { items, hasMore, isLoading } = useCursorList(fetchFn, { immediate: true })

    await vi.waitFor(() => {
      expect(items.value).toEqual([1, 2, 3])
    })

    expect(hasMore.value).toBe(true)
    expect(isLoading.value).toBe(false)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledWith({ first: 20 })
  })

  it('immediate: true 配合 delay 应延迟加载', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1],
      endCursor: null,
      hasNextPage: false,
    })

    const { items } = useCursorList(fetchFn, { immediate: true, delay: 500 })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(items.value).toEqual([])

    await vi.advanceTimersByTimeAsync(500)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(items.value).toEqual([1])

    vi.useRealTimers()
  })

  it('immediate: false（默认）不应自动加载', () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1],
      endCursor: null,
      hasNextPage: false,
    })

    const { items } = useCursorList(fetchFn)

    expect(fetchFn).not.toHaveBeenCalled()
    expect(items.value).toEqual([])
  })

  // === onSuccess 回调 ===

  it('onSuccess 应在 load 成功后触发', async () => {
    const onSuccess = vi.fn()
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1, 2],
      endCursor: 'c1',
      hasNextPage: true,
    })

    const { load } = useCursorList(fetchFn, { onSuccess })

    await load()

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith({
      items: [1, 2],
      endCursor: 'c1',
      hasNextPage: true,
    })
  })

  it('onSuccess 应在 loadMore 成功后触发', async () => {
    const onSuccess = vi.fn()
    const { fetchFn } = createMockFetch([
      { items: [1, 2], endCursor: 'c1', hasNextPage: true },
      { items: [3, 4], endCursor: 'c2', hasNextPage: false },
    ])

    const { load, loadMore } = useCursorList(fetchFn, { onSuccess })

    await load()
    expect(onSuccess).toHaveBeenCalledTimes(1)

    await loadMore()
    expect(onSuccess).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenLastCalledWith({
      items: [3, 4],
      endCursor: 'c2',
      hasNextPage: false,
    })
  })

  it('onSuccess 应在内部状态更新后触发', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1, 2],
      endCursor: 'c1',
      hasNextPage: true,
    })

    let capturedItems: number[] = []

    const { items, load } = useCursorList(fetchFn, {
      onSuccess: () => {
        capturedItems = items.value
      },
    })

    await load()

    expect(capturedItems).toEqual([1, 2])
  })

  it('onSuccess 在 fetchFn 抛错时不应触发', async () => {
    const onSuccess = vi.fn()
    const fetchFn = vi.fn().mockRejectedValue(new Error('网络错误'))

    const { load } = useCursorList(fetchFn, { onSuccess })

    await load()

    expect(onSuccess).not.toHaveBeenCalled()
  })

  // === onError 回调 ===

  it('onError 应在 fetchFn 抛错时触发', async () => {
    const onError = vi.fn()
    const testError = new Error('网络错误')
    const fetchFn = vi.fn().mockRejectedValue(testError)

    const { load } = useCursorList(fetchFn, { onError })

    await load()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(testError)
  })

  it('onError 不应为 AbortError 触发', async () => {
    const onError = vi.fn()
    const abortError = new Error('The operation was aborted.')
    abortError.name = 'AbortError'
    const fetchFn = vi.fn().mockRejectedValue(abortError)

    const { load } = useCursorList(fetchFn, { onError })

    await load()

    expect(onError).not.toHaveBeenCalled()
  })

  // === throwError 选项 ===

  it('throwError: true 时 load 应向外抛出错误', async () => {
    const testError = new Error('网络错误')
    const fetchFn = vi.fn().mockRejectedValue(testError)

    const { load } = useCursorList(fetchFn, { throwError: true })

    await expect(load()).rejects.toThrow('网络错误')
  })

  it('throwError: false（默认）时 load 不应抛出错误', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('网络错误'))

    const { load } = useCursorList(fetchFn)

    await expect(load()).resolves.toBeUndefined()
  })

  // === 组合场景 ===

  it('immediate: true + onSuccess 应在自动加载成功后触发', async () => {
    const onSuccess = vi.fn()
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1, 2],
      endCursor: 'c1',
      hasNextPage: false,
    })

    const { items } = useCursorList(fetchFn, { immediate: true, onSuccess })

    await vi.waitFor(() => {
      expect(items.value).toEqual([1, 2])
    })

    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('immediate: true + onError 应在自动加载失败时触发', async () => {
    const onError = vi.fn()
    const testError = new Error('加载失败')
    const fetchFn = vi.fn().mockRejectedValue(testError)

    useCursorList(fetchFn, { immediate: true, onError })

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(testError)
    })
  })
})
