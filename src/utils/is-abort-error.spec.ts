import { describe, expect, it } from 'vitest'
import { AbortException } from 'keq'
import { isAbortError } from './is-abort-error.js'

describe('isAbortError', () => {
  // --- 正向用例 ---

  it('应返回 true 对于原生 DOMException (name=AbortError)', () => {
    const err = new DOMException('The operation was aborted.', 'AbortError')
    expect(isAbortError(err)).toBe(true)
  })

  it('应返回 true 对于 keq 的 AbortException', () => {
    const err = new AbortException('Previous request was aborted by AbortFlowControl')
    expect(isAbortError(err)).toBe(true)
  })

  it('应返回 true 对于手动设置 name 的普通 Error（polyfill 场景）', () => {
    const err = new Error('The operation was aborted.')
    err.name = 'AbortError'
    expect(isAbortError(err)).toBe(true)
  })

  it('应返回 true 对于继承自 Error 且 name=AbortError 的子类', () => {
    class CustomAbortError extends Error {
      constructor(msg: string) {
        super(msg)
        this.name = 'AbortError'
      }
    }
    expect(isAbortError(new CustomAbortError('cancelled'))).toBe(true)
  })

  // --- 反向用例 ---

  it('应返回 false 对于普通 Error', () => {
    expect(isAbortError(new Error('网络错误'))).toBe(false)
  })

  it('应返回 false 对于 message 中包含 "abort" 但 name 不同的 Error', () => {
    const err = new Error('Failed to abort transaction')
    // name 保持为 'Error'，不应被匹配
    expect(err.name).toBe('Error')
    expect(isAbortError(err)).toBe(false)
  })

  it('应返回 false 对于 null', () => {
    expect(isAbortError(null)).toBe(false)
  })

  it('应返回 false 对于 undefined', () => {
    expect(isAbortError(undefined)).toBe(false)
  })

  it('应返回 false 对于字符串', () => {
    expect(isAbortError('something went wrong')).toBe(false)
  })

  it('应返回 false 对于数字', () => {
    expect(isAbortError(42)).toBe(false)
  })

  it('应返回 false 对于普通对象', () => {
    expect(isAbortError({ name: 'AbortError', message: 'test' })).toBe(false)
  })

  it('应返回 false 对于 DOMException 但 name 不是 AbortError', () => {
    const err = new DOMException('Timeout', 'TimeoutError')
    expect(isAbortError(err)).toBe(false)
  })

  it('应返回 false 对于 throw 的非 Error 值被包装后的 Error', () => {
    // 某些库会将非 Error 异常包装为 new Error('未知错误')
    const wrapped = new Error('未知错误')
    expect(isAbortError(wrapped)).toBe(false)
  })

  // --- 集成场景 ---

  it('AbortError 被过滤后 computed error 应为 null（模拟 useCursorList 行为）', () => {
    const rawError = new DOMException('aborted', 'AbortError')
    const result = isAbortError(rawError) ? null : rawError
    expect(result).toBeNull()
  })
})
