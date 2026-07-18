import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { useAsyncState } from '@vueuse/core'
import { useCursorPagination } from './use-cursor-pagination.js'
import { isAbortError } from '../utils/is-abort-error.js'
import type { UseListOptions } from './list-options.js'

/**
 * {@link useCursorList} 的返回类型。
 *
 * @typeParam T — 列表项类型
 */
export interface UseCursorListReturn<T> {
  /** 已加载的全部列表项 */
  items: Ref<T[]>
  /** 是否正在加载 */
  isLoading: Ref<boolean>
  /** 请求错误（AbortError 已被过滤） */
  error: Ref<unknown>
  /** 是否还有更多页 */
  hasMore: Ref<boolean>
  /** 首次加载/重新加载，清空已有数据 */
  load: () => Promise<void>
  /** 加载下一页，追加到已有列表末尾 */
  loadMore: () => Promise<void>
}

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
 * @param options.immediate — 是否在创建时立即加载第一页，默认 false
 * @param options.delay — immediate 时的延迟毫秒数，仅在 immediate 为 true 时生效，默认 0
 * @param options.onError — 请求失败回调（AbortError 已被过滤）
 * @param options.onSuccess — 请求成功回调，在内部状态更新后触发
 * @param options.throwError — 执行 fetch 时是否抛出错误，默认 false
 *
 * @example
 * ```typescript
 * const { items, isLoading, error, hasMore, load, loadMore } = useCursorList(
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
  options?: UseListOptions<{ items: T[]; endCursor: string | null; hasNextPage: boolean }>,
): UseCursorListReturn<T> {
  const {
    pageSize,
    immediate = false,
    delay = 0,
    onError: userOnError,
    onSuccess,
    throwError = false,
  } = options ?? {}

  const pagination = useCursorPagination(pageSize)

  /** 已加载的全部列表项 */
  const items = ref<T[]>([]) as Ref<T[]>

  const initialState = {
    items: [] as T[],
    endCursor: null as string | null,
    hasNextPage: false,
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
    async (params: { first: number; after?: string }) => {
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

  const hasMore = computed(() => pagination.hasNextPage.value)

  /**
   * 首次加载 / 重新加载
   *
   * 清空已有数据并从头加载第一页
   */
  async function load(): Promise<void> {
    pagination.reset()
    const data = await executeImmediate(undefined, { first: pagination.pageSize.value })
    if (data === undefined) return

    items.value = data.items
    pagination.apply({
      total: data.items.length,
      limit: pagination.pageSize.value,
      startCursor: null,
      endCursor: data.endCursor,
      hasNextPage: data.hasNextPage,
      hasPrevPage: false,
    })
    onSuccess?.(data)
  }

  /**
   * 加载下一页
   *
   * 将新数据追加到已有列表末尾。
   * 自动跳过重复调用（正在加载中或已无更多数据时直接返回）。
   */
  async function loadMore(): Promise<void> {
    if (!pagination.hasNextPage.value || isLoading.value) return
    const data = await executeImmediate(undefined, pagination.nextPageParams.value)
    if (data === undefined) return

    items.value.push(...data.items)
    pagination.apply({
      total: items.value.length,
      limit: pagination.pageSize.value,
      startCursor: pagination.endCursor.value,
      endCursor: data.endCursor,
      hasNextPage: data.hasNextPage,
      hasPrevPage: true,
    })
    onSuccess?.(data)
  }

  // immediate: 创建时自动加载第一页
  if (immediate) {
    const doLoad = () => {
      void load()
    }
    if (delay > 0) {
      setTimeout(doLoad, delay)
    } else {
      doLoad()
    }
  }

  return { items, isLoading, error, hasMore, load, loadMore }
}
