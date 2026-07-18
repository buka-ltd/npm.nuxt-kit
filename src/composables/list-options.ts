/**
 * {@link useOffsetList} 和 {@link useCursorList} 共享的选项接口。
 *
 * @typeParam TData — fetchFn 成功时返回的数据类型
 */
export interface UseListOptions<TData = unknown> {
  /**
   * 每页加载数量。
   *
   * @default 20
   */
  pageSize?: number

  /**
   * 是否在 composable 创建时立即加载第一页数据。
   *
   * - useOffsetList：等价于自动调用 `goToPage(1)`
   * - useCursorList：等价于自动调用 `load()`
   *
   * 设为 `false` 时需要手动触发加载。
   *
   * @default false
   */
  immediate?: boolean

  /**
   * 首次执行的延迟时间（毫秒）。
   *
   * 仅在 `immediate: true` 时生效，用于控制首次请求的延迟。
   *
   * @default 0
   */
  delay?: number

  /**
   * 请求失败时的回调。
   *
   * 注意：由 keq `flowControl('abort')` 或 AbortController 产生的
   * AbortError 会被过滤，不会触发此回调——这与 `error` ref 的行为保持一致。
   */
  onError?: (e: unknown) => void

  /**
   * 请求成功时的回调。
   *
   * 回调在 composable 内部状态（items、pagination 等）更新**之后**触发，
   * 调用时可通过返回的 ref 访问最新状态。
   */
  onSuccess?: (data: TData) => void

  /**
   * 执行 fetch 函数时是否将错误向外抛出。
   *
   * - `false`（默认）：错误被捕获并通过 `error` ref 暴露
   * - `true`：错误从 `goToPage`/`refresh`/`load`/`loadMore` 向外传播
   *
   * @default false
   */
  throwError?: boolean
}
