import { describe, expect, it, vi } from 'vitest'
import { useOffsetList } from './use-offset-list.js'

/**
 * 创建模拟的 fetch 函数，返回可控的分页数据。
 */
function createMockFetch<T>(pages: Array<{ items: T[]; total: number }>) {
  let callCount = 0

  return {
    fetchFn: vi.fn().mockImplementation(() => {
      const page = pages[callCount]
      callCount += 1
      if (!page) {
        return Promise.resolve({ items: [] as T[], total: 0 })
      }
      return Promise.resolve(page)
    }),
    get callCount() {
      return callCount
    },
  }
}

describe('useOffsetList', () => {
  // === 核心分页行为 ===

  it('goToPage(1) 应加载第一页数据', async () => {
    const { fetchFn } = createMockFetch([
      { items: [1, 2, 3], total: 10 },
    ])

    const { items, isLoading, page, totalPages, total, goToPage } = useOffsetList(fetchFn)

    await goToPage(1)

    expect(items.value).toEqual([1, 2, 3])
    expect(page.value).toBe(1)
    expect(total.value).toBe(10)
    expect(totalPages.value).toBe(1)
    expect(isLoading.value).toBe(false)
  })

  it('goToPage(2) 后应翻到第二页并替换 items', async () => {
    const { fetchFn } = createMockFetch([
      { items: [1, 2], total: 10 },
      { items: [3, 4], total: 10 },
    ])

    const { items, page, goToPage } = useOffsetList(fetchFn)

    await goToPage(1)
    expect(items.value).toEqual([1, 2])
    expect(page.value).toBe(1)

    await goToPage(2)
    expect(items.value).toEqual([3, 4])
    expect(page.value).toBe(2)
  })

  it('goToPage(1) 后 goToPage(3) 再 goToPage(1) 应正确回到第一页', async () => {
    const { fetchFn } = createMockFetch([
      { items: [1, 2], total: 10 },
      { items: [5, 6], total: 10 },
      { items: [1, 2], total: 10 },
    ])

    const { items, page, goToPage } = useOffsetList(fetchFn)

    await goToPage(1)
    expect(items.value).toEqual([1, 2])

    await goToPage(3)
    expect(items.value).toEqual([5, 6])
    expect(page.value).toBe(3)

    await goToPage(1)
    expect(items.value).toEqual([1, 2])
    expect(page.value).toBe(1)
  })

  it('items 应被替换而非累积', async () => {
    const { fetchFn } = createMockFetch([
      { items: [1, 2], total: 10 },
      { items: [3, 4], total: 10 },
      { items: [5, 6], total: 10 },
    ])

    const { items, goToPage } = useOffsetList(fetchFn)

    await goToPage(1)
    expect(items.value).toEqual([1, 2])

    await goToPage(2)
    expect(items.value).toEqual([3, 4])

    await goToPage(3)
    expect(items.value).toEqual([5, 6])
  })

  // === refresh 行为 ===

  it('refresh 在初始状态应加载第一页', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1, 2, 3],
      total: 5,
    })

    const { items, page, refresh } = useOffsetList(fetchFn)

    await refresh()

    expect(items.value).toEqual([1, 2, 3])
    expect(page.value).toBe(1)
    expect(fetchFn).toHaveBeenCalledWith({ limit: 20, offset: 0 })
  })

  it('refresh 应在 goToPage 后重新加载当前页', async () => {
    const { fetchFn } = createMockFetch([
      { items: [1, 2], total: 10 },
      { items: [5, 6], total: 10 },
      { items: [7, 8], total: 20 },
    ])

    const { items, page, refresh, goToPage } = useOffsetList(fetchFn)

    await goToPage(1)
    expect(page.value).toBe(1)

    await goToPage(3)
    expect(page.value).toBe(3)
    expect(items.value).toEqual([5, 6])

    // 刷新当前页（第 3 页），应更新为最新数据
    await refresh()
    expect(items.value).toEqual([7, 8])
    expect(page.value).toBe(3)
  })

  it('refresh 应更新 total', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ items: [1], total: 10 })
      .mockResolvedValueOnce({ items: [1], total: 25 })

    const { total, goToPage, refresh } = useOffsetList(fetchFn)

    await goToPage(1)
    expect(total.value).toBe(10)

    await refresh()
    expect(total.value).toBe(25)
  })

  // === 防重复调用 ===

  it('isLoading 为 true 时 goToPage 不应发起重复请求', async () => {
    const { fetchFn } = createMockFetch([
      { items: [1, 2], total: 10 },
      { items: [3, 4], total: 10 },
    ])

    const { goToPage } = useOffsetList(fetchFn)

    // 同时发起两个 goToPage，第二个应被跳过
    await Promise.all([goToPage(1), goToPage(2)])

    // 只应调用了 1 次
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('isLoading 为 true 时 refresh 不应发起重复请求', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ items: [1], total: 10 })
      .mockResolvedValueOnce({ items: [2], total: 10 })

    const { goToPage, refresh } = useOffsetList(fetchFn)

    // 同时发起 goToPage 和 refresh，refresh 应被跳过
    await Promise.all([goToPage(1), refresh()])

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  // === 错误处理 ===

  it('fetchFn 抛错时 error 应被设置', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('网络错误'))

    const { error, goToPage } = useOffsetList(fetchFn)

    await goToPage(1)

    expect(error.value).toBeInstanceOf(Error)
    expect((error.value as Error).message).toBe('网络错误')
  })

  it('AbortError 应被过滤，不暴露给 UI', async () => {
    const abortError = new Error('The operation was aborted.')
    abortError.name = 'AbortError'
    const fetchFn = vi.fn().mockRejectedValue(abortError)

    const { error, goToPage } = useOffsetList(fetchFn)

    await goToPage(1)

    expect(error.value).toBeNull()
  })

  it('goToPage 失败后 items 应保持原值', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ items: [1, 2], total: 10 })
      .mockRejectedValueOnce(new Error('加载失败'))

    const { items, goToPage } = useOffsetList(fetchFn)

    await goToPage(1)
    expect(items.value).toEqual([1, 2])

    await goToPage(2)
    // goToPage 失败，items 应保持原值
    expect(items.value).toEqual([1, 2])
  })

  // === 配置 ===

  it('应使用 options.pageSize 配置每页数量', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1],
      total: 1,
    })

    const { goToPage } = useOffsetList(fetchFn, { pageSize: 10 })

    await goToPage(1)

    expect(fetchFn).toHaveBeenCalledWith({ limit: 10, offset: 0 })
  })

  it('默认 pageSize 应为 20', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [],
      total: 0,
    })

    const { goToPage } = useOffsetList(fetchFn)

    await goToPage(1)

    expect(fetchFn).toHaveBeenCalledWith({ limit: 20, offset: 0 })
  })

  // === page / pageSize / totalPages 计算 ===

  it('page 应正确计算（1-based）', async () => {
    const { fetchFn } = createMockFetch([
      { items: [1, 2], total: 10 },
      { items: [3, 4], total: 10 },
    ])

    const { page, goToPage } = useOffsetList(fetchFn)

    await goToPage(1)
    expect(page.value).toBe(1)

    await goToPage(2)
    expect(page.value).toBe(2)
  })

  it('totalPages 应根据 total 和 limit 正确计算', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ items: [1, 2], total: 25 })
      .mockResolvedValueOnce({ items: [3, 4], total: 5 })

    const { totalPages, goToPage } = useOffsetList(fetchFn, { pageSize: 10 })

    await goToPage(1)
    expect(totalPages.value).toBe(3)

    // 数据发生变化，total 更新
    await goToPage(2)
    expect(totalPages.value).toBe(1)
  })

  it('pageSize 应可通过 writable computed 修改', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1, 2],
      total: 10,
    })

    const { pageSize, goToPage } = useOffsetList(fetchFn, { pageSize: 20 })

    // 修改 pageSize（通过 useOffsetPage 的 writable computed 委托到 limit）
    pageSize.value = 10

    await goToPage(1)
    expect(fetchFn).toHaveBeenCalledWith({ limit: 10, offset: 0 })
    expect(pageSize.value).toBe(10)
  })

  // === 边界情况 ===

  it('goToPage(0) 应静默跳过', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1],
      total: 1,
    })

    const { goToPage } = useOffsetList(fetchFn)

    await goToPage(0)

    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('goToPage(-1) 应静默跳过', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1],
      total: 1,
    })

    const { goToPage } = useOffsetList(fetchFn)

    await goToPage(-1)

    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('空 items 时应正常更新 total 和 totalPages', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [],
      total: 0,
    })

    const { items, total, totalPages, goToPage } = useOffsetList(fetchFn)

    await goToPage(1)

    expect(items.value).toEqual([])
    expect(total.value).toBe(0)
    expect(totalPages.value).toBe(0)
  })

  it('goToPage 应正确计算 offset', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1, 2],
      total: 10,
    })

    const { goToPage } = useOffsetList(fetchFn, { pageSize: 10 })

    await goToPage(3)

    expect(fetchFn).toHaveBeenCalledWith({ limit: 10, offset: 20 })
  })

  // === immediate 选项 ===

  it('immediate: true 应在创建时自动加载第一页', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1, 2, 3],
      total: 15,
    })

    const { items, page, total, totalPages } = useOffsetList(fetchFn, { immediate: true })

    // 等待异步加载完成
    await vi.waitFor(() => {
      expect(items.value).toEqual([1, 2, 3])
    })

    expect(page.value).toBe(1)
    expect(total.value).toBe(15)
    expect(totalPages.value).toBe(1)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledWith({ limit: 20, offset: 0 })
  })

  it('immediate: true 配合 delay 应延迟加载', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1],
      total: 1,
    })

    const { items } = useOffsetList(fetchFn, { immediate: true, delay: 500 })

    // 延迟期间不应发起请求
    expect(fetchFn).not.toHaveBeenCalled()
    expect(items.value).toEqual([])

    // 推进时间
    await vi.advanceTimersByTimeAsync(500)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(items.value).toEqual([1])

    vi.useRealTimers()
  })

  it('immediate: false（默认）不应自动加载', () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1],
      total: 1,
    })

    const { items } = useOffsetList(fetchFn)

    expect(fetchFn).not.toHaveBeenCalled()
    expect(items.value).toEqual([])
  })

  // === onSuccess 回调 ===

  it('onSuccess 应在 goToPage 成功后触发', async () => {
    const onSuccess = vi.fn()
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1, 2],
      total: 10,
    })

    const { goToPage } = useOffsetList(fetchFn, { onSuccess })

    await goToPage(2)

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith({ items: [1, 2], total: 10 })
  })

  it('onSuccess 应在 refresh 成功后触发', async () => {
    const onSuccess = vi.fn()
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ items: [1, 2], total: 10 })
      .mockResolvedValueOnce({ items: [3, 4], total: 20 })

    const { goToPage, refresh } = useOffsetList(fetchFn, { onSuccess })

    await goToPage(1)
    expect(onSuccess).toHaveBeenCalledTimes(1)

    await refresh()
    expect(onSuccess).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenLastCalledWith({ items: [3, 4], total: 20 })
  })

  it('onSuccess 应在内部状态更新后触发', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1, 2],
      total: 10,
    })

    let capturedItems: number[] = []
    let capturedTotal = 0

    const { items, total, goToPage } = useOffsetList(fetchFn, {
      onSuccess: () => {
        // 回调执行时，ref 应已更新为最新状态
        capturedItems = items.value
        capturedTotal = total.value
      },
    })

    await goToPage(1)

    expect(capturedItems).toEqual([1, 2])
    expect(capturedTotal).toBe(10)
  })

  it('onSuccess 在 fetchFn 抛错时不应触发', async () => {
    const onSuccess = vi.fn()
    const fetchFn = vi.fn().mockRejectedValue(new Error('网络错误'))

    const { goToPage } = useOffsetList(fetchFn, { onSuccess })

    await goToPage(1)

    expect(onSuccess).not.toHaveBeenCalled()
  })

  // === onError 回调 ===

  it('onError 应在 fetchFn 抛错时触发', async () => {
    const onError = vi.fn()
    const testError = new Error('网络错误')
    const fetchFn = vi.fn().mockRejectedValue(testError)

    const { goToPage } = useOffsetList(fetchFn, { onError })

    await goToPage(1)

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(testError)
  })

  it('onError 不应为 AbortError 触发', async () => {
    const onError = vi.fn()
    const abortError = new Error('The operation was aborted.')
    abortError.name = 'AbortError'
    const fetchFn = vi.fn().mockRejectedValue(abortError)

    const { goToPage } = useOffsetList(fetchFn, { onError })

    await goToPage(1)

    expect(onError).not.toHaveBeenCalled()
  })

  // === throwError 选项 ===

  it('throwError: true 时 goToPage 应向外抛出错误', async () => {
    const testError = new Error('网络错误')
    const fetchFn = vi.fn().mockRejectedValue(testError)

    const { goToPage } = useOffsetList(fetchFn, { throwError: true })

    await expect(goToPage(1)).rejects.toThrow('网络错误')
  })

  it('throwError: false（默认）时 goToPage 不应抛出错误', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('网络错误'))

    const { goToPage } = useOffsetList(fetchFn)

    // 默认行为：不抛出，通过 error ref 暴露
    await expect(goToPage(1)).resolves.toBeUndefined()
  })

  it('throwError: true 时 AbortError 仍应被抛出', async () => {
    const abortError = new Error('The operation was aborted.')
    abortError.name = 'AbortError'
    const fetchFn = vi.fn().mockRejectedValue(abortError)

    const { goToPage } = useOffsetList(fetchFn, { throwError: true })

    // abortError 仍然向上传播（composable 只过滤 error ref 和 onError 回调）
    await expect(goToPage(1)).rejects.toThrow('The operation was aborted.')
  })

  // === 组合场景 ===

  it('immediate: true + onSuccess 应在自动加载成功后触发', async () => {
    const onSuccess = vi.fn()
    const fetchFn = vi.fn().mockResolvedValue({
      items: [1, 2],
      total: 10,
    })

    const { items } = useOffsetList(fetchFn, { immediate: true, onSuccess })

    await vi.waitFor(() => {
      expect(items.value).toEqual([1, 2])
    })

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith({ items: [1, 2], total: 10 })
  })

  it('immediate: true + onError 应在自动加载失败时触发', async () => {
    const onError = vi.fn()
    const testError = new Error('加载失败')
    const fetchFn = vi.fn().mockRejectedValue(testError)

    useOffsetList(fetchFn, { immediate: true, onError })

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(testError)
    })
  })
})
