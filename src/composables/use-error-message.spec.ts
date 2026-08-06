import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useErrorMessage } from './use-error-message'

describe('useErrorMessage', () => {
  // === 空值处理 ===

  it('error 为 null 时返回 undefined', () => {
    const result = useErrorMessage(null)
    expect(result.value).toBeUndefined()
  })

  it('error 为 undefined 时返回 undefined', () => {
    const result = useErrorMessage(undefined)
    expect(result.value).toBeUndefined()
  })

  it('error ref 为 null 时返回 undefined', () => {
    const error = ref(null)
    const result = useErrorMessage(error)
    expect(result.value).toBeUndefined()
  })

  it('error ref 为 undefined 时返回 undefined', () => {
    const error = ref(undefined)
    const result = useErrorMessage(error)
    expect(result.value).toBeUndefined()
  })

  // === Error 实例 ===

  it('从 Error 实例提取 message', () => {
    const result = useErrorMessage(new Error('网络错误'))
    expect(result.value).toBe('网络错误')
  })

  it('从 Error 子类实例提取 message', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message)
        this.name = 'CustomError'
      }
    }
    const result = useErrorMessage(new CustomError('自定义错误'))
    expect(result.value).toBe('自定义错误')
  })

  // === 包含 message 属性的对象 ===

  it('从含 message 属性的普通对象提取消息', () => {
    const result = useErrorMessage({ message: '请求超时' })
    expect(result.value).toBe('请求超时')
  })

  it('含 message 属性的对象（ref 包裹）提取消息', () => {
    const error = ref({ message: '权限不足' })
    const result = useErrorMessage(error)
    expect(result.value).toBe('权限不足')
  })

  // === 无法识别的错误类型 ===

  it('字符串错误返回默认 fallback', () => {
    const result = useErrorMessage('出了点问题')
    expect(result.value).toBe('操作失败，请重试')
  })

  it('数字错误返回默认 fallback', () => {
    const result = useErrorMessage(404)
    expect(result.value).toBe('操作失败，请重试')
  })

  it('不含 message 属性的普通对象返回 fallback', () => {
    const result = useErrorMessage({ code: 500 })
    expect(result.value).toBe('操作失败，请重试')
  })

  // === 自定义 fallback ===

  it('支持自定义 fallback', () => {
    const result = useErrorMessage('未知错误', '加载失败，请稍后重试')
    expect(result.value).toBe('加载失败，请稍后重试')
  })

  // === 响应式更新 ===

  it('error ref 值变化时 computed 应响应式更新', () => {
    const error = ref<unknown>(null)
    const result = useErrorMessage(error)

    expect(result.value).toBeUndefined()

    error.value = new Error('第一次错误')
    expect(result.value).toBe('第一次错误')

    error.value = new Error('第二次错误')
    expect(result.value).toBe('第二次错误')

    error.value = null
    expect(result.value).toBeUndefined()
  })

  it('error ref 从 null 变为 Error 再变为普通对象', () => {
    const error = ref<unknown>(null)
    const result = useErrorMessage(error, '兜底')

    expect(result.value).toBeUndefined()

    error.value = new Error('错误消息')
    expect(result.value).toBe('错误消息')

    error.value = { message: '对象消息' }
    expect(result.value).toBe('对象消息')

    error.value = null
    expect(result.value).toBeUndefined()
  })
})
