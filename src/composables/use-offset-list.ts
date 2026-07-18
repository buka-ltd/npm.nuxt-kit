import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { useAsyncState } from '@vueuse/core'
import { useOffsetPagination } from './use-offset-pagination.js'
import { useOffsetPage } from './use-offset-page.js'
import { isAbortError } from '../utils/is-abort-error.js'
import type { UseListOptions } from './list-options.js'

/**
 * {@link useOffsetList} 的返回类型。
 *
 * @typeParam T — 列表项类型
 */
export interface UseOffsetListReturn<T> {
  /** 当前页数据 */
  items: Ref<T[]>
  /** 是否正在加载 */
  isLoading: Ref<boolean>
  /** 请求错误（AbortError 已被过滤） */
  error: Ref<unknown>
  /** 当前页码（1-based） */
  page: Ref<number>
  /** 每页数量 */
  pageSize: Ref<number>
  /** 总页数（writable computed） */
  totalPages: Ref<number>
  /** 数据总数 */
  total: Ref<number>
  /** 重新加载当前页 */
  refresh: () => Promise<void>
  /** 跳转到指定页 */
  goToPage: (page: number) => Promise<void>
}

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
 * @param options.immediate — 是否在创建时立即加载第一页，默认 false
 * @param options.delay — immediate 时的延迟毫秒数，仅在 immediate 为 true 时生效，默认 0
 * @param options.onError — 请求失败回调（AbortError 已被过滤）
 * @param options.onSuccess — 请求成功回调，在内部状态更新后触发
 * @param options.throwError — 执行 fetch 时是否抛出错误，默认 false
 *
 * @example
 * ```typescript
 * const { items, isLoading, error, page, pageSize, totalPages, refresh, goToPage } = useOffsetList(
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
  options?: UseListOptions<{ items: T[]; total: number }>,
): UseOffsetListReturn<T> {
  const {
    pageSize: pageSizeOption,
    immediate = false,
    delay = 0,
    onError: userOnError,
    onSuccess,
    throwError = false,
  } = options ?? {}

  const pagination = useOffsetPagination(pageSizeOption)
  const { page, pageSize, totalPages } = useOffsetPage({
    limit: pagination.limit,
    offset: pagination.offset,
    total: pagination.total,
  })

  /** 当前页数据 */
  const items = ref<T[]>([]) as Ref<T[]>

  const initialState = {
    items: [] as T[],
    total: 0,
  }

  /**
   * 包裹用户提供的 onError 回调，过滤掉 AbortError。
   *
   * 与 {@link error} 的行为一致：由 keq `flowControl('abort')` 或
   * AbortController 产生的 AbortError 不应暴露给调用方。
   */
  const wrappedOnError = userOnError
    ? (e: unknown) => {
      if (!isAbortError(e)) {
        userOnError(e)
      }
    }
    : undefined

  const { isLoading, error: rawError, execute: executeImmediate } = useAsyncState(
    async (params: { limit: number; offset: number }) => {
      const result = await fetchFn(params)
      return result
    },
    initialState,
    {
      immediate: false,
      throwError,
      onError: wrappedOnError,
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
    if (isLoading.value) return
    const data = await executeImmediate(undefined, {
      limit: pagination.limit.value,
      offset: pagination.offset.value,
    })
    if (data === undefined) return

    items.value = data.items
    pagination.apply({
      total: data.total,
      limit: pagination.limit.value,
      offset: pagination.offset.value,
    })
    onSuccess?.(data)
  }

  /**
   * 跳转到指定页并加载数据，替换 items
   *
   * page 为 1-based 页码。page < 1 时静默跳过。
   * 加载中时重复调用会静默跳过。
   */
  async function goToPage(targetPage: number): Promise<void> {
    if (isLoading.value) return
    if (targetPage < 1) return

    page.value = targetPage

    const data = await executeImmediate(undefined, {
      limit: pagination.limit.value,
      offset: pagination.offset.value,
    })
    if (data === undefined) return

    items.value = data.items
    pagination.apply({
      total: data.total,
      limit: pagination.limit.value,
      offset: pagination.offset.value,
    })
    onSuccess?.(data)
  }

  // immediate: 创建时自动加载第一页
  if (immediate) {
    const doLoad = () => {
      void goToPage(1)
    }
    if (delay > 0) {
      setTimeout(doLoad, delay)
    } else {
      doLoad()
    }
  }

  return {
    items,
    isLoading,
    error,
    page: page,
    pageSize: pageSize,
    totalPages: totalPages,
    total: pagination.total,
    refresh,
    goToPage,
  }
}
