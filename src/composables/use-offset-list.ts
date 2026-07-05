import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { useAsyncFn } from './use-async-fn.js'
import { useOffsetPagination } from './use-offset-pagination.js'
import { useOffsetPage } from './use-offset-page.js'
import { isAbortError } from '../utils/is-abort-error.js'

/**
 * 基于 Offset 的异步表格列表 composable
 *
 * 封装 Offset 分页的数据加载、items 管理、loading 状态和错误处理，
 * 适用于表格翻页场景。
 *
 * 与 {@link useCursorList} 的区别：
 * - useCursorList 用于无限滚动，items 累积追加
 * - useOffsetList 用于表格翻页，items 按页替换
 *
 * @param fetchFn — 数据加载函数，接收 `{ limit, offset }` 参数，
 *   返回 `{ items, total }`
 * @param options — 可选配置
 * @param options.pageSize — 每页加载数量，默认 20
 *
 * @example
 * ```typescript
 * const { items, loading, error, page, pageSize, totalPages, refresh, goToPage } = useOffsetList(
 *   async ({ limit, offset }) => {
 *     const result = await api.listData({ page: { limit, offset } })
 *     return {
 *       items: result.data ?? [],
 *       total: result.meta?.pagination?.total ?? 0,
 *     }
 *   },
 *   { pageSize: 20 },
 * )
 * ```
 */
export function useOffsetList<T>(
  fetchFn: (params: { limit: number; offset: number }) => Promise<{
    items: T[]
    total: number
  }>,
  options?: {
    /** 每页加载数量，默认 20 */
    pageSize?: number
  },
): {
  items: Ref<T[]>
  loading: Ref<boolean>
  error: Ref<Error | null>
  page: Ref<number>
  pageSize: Ref<number>
  totalPages: Ref<number>
  total: Ref<number>
  refresh: () => Promise<void>
  goToPage: (page: number) => Promise<void>
} {
  const pagination = useOffsetPagination(options?.pageSize)
  const { page, pageSize, totalPages } = useOffsetPage({
    limit: pagination.limit,
    offset: pagination.offset,
    total: pagination.total,
  })

  /** 当前页数据 */
  const items = ref<T[]>([]) as Ref<T[]>

  const { pending: loading, error: rawError, execute } = useAsyncFn(
    async (params: { limit: number; offset: number }) => {
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

  /**
   * 使用当前分页参数重新加载，替换 items
   *
   * 不改变当前 offset/limit，适用于刷新当前页
   */
  async function refresh(): Promise<void> {
    if (loading.value) return
    const result = await execute({
      limit: pagination.limit.value,
      offset: pagination.offset.value,
    })
    if (!result.success) return

    items.value = result.data.items
    pagination.apply({
      total: result.data.total,
      limit: pagination.limit.value,
      offset: pagination.offset.value,
    })
  }

  /**
   * 跳转到指定页并加载数据，替换 items
   *
   * page 为 1-based 页码。page < 1 时静默跳过。
   * 加载中时重复调用会静默跳过。
   */
  async function goToPage(targetPage: number): Promise<void> {
    if (loading.value) return
    if (targetPage < 1) return

    page.value = targetPage

    const result = await execute({
      limit: pagination.limit.value,
      offset: pagination.offset.value,
    })
    if (!result.success) return

    items.value = result.data.items
    pagination.apply({
      total: result.data.total,
      limit: pagination.limit.value,
      offset: pagination.offset.value,
    })
  }

  return {
    items,
    loading,
    error,
    page: page,
    pageSize: pageSize,
    totalPages: totalPages, total:
    pagination.total,
    refresh,
    goToPage,
  }
}
