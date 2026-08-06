import { computed, toValue } from 'vue'
import type { ComputedRef, MaybeRef } from 'vue'

/**
 * 将错误对象（响应式或静态）转换为可读消息字符串。
 *
 * 支持 Error 实例、含 message 属性的对象等常见错误形态，
 * 无法识别时返回 fallback 兜底文案。
 * 适用于将 useCursorList / useAsyncState 等返回的 error ref
 * 或 try-catch 捕获的 error 值转换为模板可直接使用的 ComputedRef。
 *
 * @param error - 错误对象（支持 Ref、ComputedRef 或静态值）
 * @param fallback - 无法识别错误时的兜底文案，默认 "操作失败，请重试"
 * @returns 可读的错误消息，无错误时返回 undefined
 *
 * @example
 * ```ts
 * // 响应式用法
 * const { error } = useCursorList(fetchFn)
 * const errorMessage = useErrorMessage(error, '加载列表失败')
 *
 * // 静态用法
 * const err = useErrorMessage(new Error('出错了'))
 * ```
 */
export function useErrorMessage(
  error: MaybeRef<unknown>,
  fallback = '操作失败，请重试',
): ComputedRef<string | undefined> {
  return computed(() => {
    const err = toValue(error)
    if (!err) return undefined

    // 提取可读错误消息
    if (err instanceof Error) return err.message
    if (typeof err === 'object' && 'message' in err) {
      return String((err as Record<string, unknown>).message)
    }
    return fallback
  })
}
