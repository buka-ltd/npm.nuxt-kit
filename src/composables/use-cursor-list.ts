import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { useAsyncFn } from './use-async-fn.js'
import { useCursorPagination } from './use-cursor-pagination.js'
import { isAbortError } from '../utils/is-abort-error.js'

/**
 * 基于 Cursor 的异步列表加载 composable
 *
 * 封装 Cursor 分页的数据加载、items 累积、loading 状态和错误处理，
 * 适用于无限滚动列表场景。
 *
 * @param fetchFn — 数据加载函数，接收 `{ first, after }` 参数，
 *   返回 `{ items, endCursor, hasNextPage }`
 * @param options — 可选配置
 * @param options.pageSize — 每页加载数量，默认 20
 *
 * @example
 * ```typescript
 * const { items, loading, error, hasMore, load, loadMore } = useCursorList(
 *   async ({ first, after }) => {
 *     const result = await api.listData({ page: { first, after } })
 *     return {
 *       items: result.data ?? [],
 *       endCursor: result.meta?.pagination?.endCursor ?? null,
 *       hasNextPage: result.meta?.pagination?.hasNextPage ?? false,
 *     }
 *   },
 *   { pageSize: 20 },
 * )
 * ```
 */
export function useCursorList<T>(
  fetchFn: (params: { first: number; after?: string }) => Promise<{
    items: T[]
    endCursor: string | null
    hasNextPage: boolean
  }>,
  options?: {
    /** 每页加载数量，默认 20 */
    pageSize?: number
  },
): {
  items: Ref<T[]>
  loading: Ref<boolean>
  error: Ref<Error | null>
  hasMore: Ref<boolean>
  load: () => Promise<void>
  loadMore: () => Promise<void>
} {
  const pagination = useCursorPagination(options?.pageSize)

  /** 已加载的全部列表项 */
  const items = ref<T[]>([]) as Ref<T[]>

  const { pending: loading, error: rawError, execute } = useAsyncFn(
    async (params: { first: number; after?: string }) => {
      const result = await fetchFn(params)
      return result
    },
  )

  /**
   * 已过滤掉 AbortError 的请求错误。
   *
   * 竟态保护由 keq 的 `flowControl('abort')` 在 HTTP 层完成，
   * 被 abort 的请求产生的 AbortError 不应暴露给 UI。
   *
   * @see isAbortError
   */
  const error = computed(() => {
    const e = rawError.value
    if (e && isAbortError(e)) return null
    return e
  })

  const hasMore = computed(() => pagination.hasNextPage.value)

  /**
   * 首次加载 / 重新加载
   *
   * 清空已有数据并从头加载第一页
   */
  async function load(): Promise<void> {
    pagination.reset()
    const result = await execute({ first: pagination.pageSize.value })
    if (!result.success) return

    items.value = result.data.items
    pagination.apply({
      total: result.data.items.length,
      limit: pagination.pageSize.value,
      startCursor: null,
      endCursor: result.data.endCursor,
      hasNextPage: result.data.hasNextPage,
      hasPrevPage: false,
    })
  }

  /**
   * 加载下一页
   *
   * 将新数据追加到已有列表末尾。
   * 自动跳过重复调用（正在加载中或已无更多数据时直接返回）。
   */
  async function loadMore(): Promise<void> {
    if (!pagination.hasNextPage.value || loading.value) return
    const result = await execute(pagination.nextPageParams.value)
    if (!result.success) return

    items.value.push(...result.data.items)
    pagination.apply({
      total: items.value.length,
      limit: pagination.pageSize.value,
      startCursor: pagination.endCursor.value,
      endCursor: result.data.endCursor,
      hasNextPage: result.data.hasNextPage,
      hasPrevPage: true,
    })
  }

  return { items, loading, error, hasMore, load, loadMore }
}
