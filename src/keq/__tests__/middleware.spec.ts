import { describe, expect, it, vi } from 'vitest'
import { BukaRequestException } from '../buka-request-exception.js'
import { throwOneResponseError } from '../middleware.js'

/**
 * 模拟 @keq-request/exception 模块，
 * 使 createExceptionByStatusCode 返回可控的 Error。
 * 使用 vi.hoisted 确保 mock 工厂在模块 import 前可用。
 */
const { mockCreateException } = vi.hoisted(() => ({
  mockCreateException: vi.fn((_response: unknown) => new Error('非 JSON 错误')),
}))

vi.mock('@keq-request/exception', () => ({
  createExceptionByStatusCode: mockCreateException,
}))

/**
 * 用于测试 errorDispatchers 分发的异常子类。
 */
class TestCustomException extends BukaRequestException {}

/**
 * 创建模拟的 Keq Context 对象。
 */
function createMockContext(options: {
  status: number
  contentType?: string
  body?: unknown
}) {
  const { status, contentType = 'application/json', body } = options

  const response = {
    status,
    headers: new Headers({ 'content-type': contentType }),
    json: vi.fn().mockResolvedValue(body),
  }

  return {
    response: response as unknown as Response,
  }
}

describe('throwOneResponseError', () => {
  it('JSON 错误 body 应抛出 BukaRequestException', async () => {
    const ctx = createMockContext({
      status: 400,
      body: {
        error: {
          code: 'V0-0001-1000-001',
          message: '参数校验失败',
          details: [],
        },
      },
    })
    const next = vi.fn()

    await expect(
      throwOneResponseError()(ctx as never, next),
    ).rejects.toThrow(BukaRequestException)

    await expect(
      throwOneResponseError()(ctx as never, next),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'V0-0001-1000-001',
      message: '参数校验失败',
    })
  })

  it('401/403/404 状态码应正确设置 statusCode', async () => {
    const testCases = [401, 403, 404]

    for (const status of testCases) {
      const ctx = createMockContext({
        status,
        body: {
          error: {
            code: `A0-0001-0000-${status}`,
            message: '错误',
            details: [],
          },
        },
      })
      const next = vi.fn()

      await expect(
        throwOneResponseError()(ctx as never, next),
      ).rejects.toMatchObject({
        statusCode: status,
      })
    }
  })

  it('其它 4xx/5xx 状态码应正确设置 statusCode', async () => {
    const ctx = createMockContext({
      status: 422,
      body: {
        error: {
          code: 'V0-0001-1000-002',
          message: '校验失败',
          details: [],
        },
      },
    })
    const next = vi.fn()

    await expect(
      throwOneResponseError()(ctx as never, next),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: '校验失败',
    })
  })

  it('JSON body 无 error 属性应降级为 createExceptionByStatusCode', async () => {
    const ctx = createMockContext({
      status: 500,
      body: { message: 'not standard' },
    })
    const next = vi.fn()

    await expect(
      throwOneResponseError()(ctx as never, next),
    ).rejects.toThrow('非 JSON 错误')
  })

  it('errorDispatchers 匹配时应抛出注册的子类实例', async () => {
    const errorCode = 'B0-0001-1012-00B'

    const ctx = createMockContext({
      status: 401,
      body: {
        error: {
          code: errorCode,
          message: '会话已过期',
          details: [],
        },
      },
    })
    const next = vi.fn()

    const middleware = throwOneResponseError({
      errorDispatchers: {
        [errorCode]: TestCustomException,
      },
    })

    let caught: unknown = null
    try {
      await middleware(ctx as never, next)
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(TestCustomException)
    expect(caught).toBeInstanceOf(BukaRequestException)
    if (caught instanceof BukaRequestException) {
      expect(caught.code).toBe(errorCode)
      expect(caught.message).toBe('会话已过期')
    }
  })

  it('errorDispatchers 未匹配时应降级为 BukaRequestException', async () => {
    const ctx = createMockContext({
      status: 400,
      body: {
        error: {
          code: 'V0-0001-9999-999',
          message: '未知校验错误',
          details: [],
        },
      },
    })
    const next = vi.fn()

    const middleware = throwOneResponseError({
      errorDispatchers: {
        'B0-0001-1012-00B': TestCustomException,
      },
    })

    await expect(
      middleware(ctx as never, next),
    ).rejects.toThrow(BukaRequestException)

    // 应抛出普通 BukaRequestException，而非 TestCustomException
    let caught: unknown = null
    try {
      await middleware(ctx as never, next)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(BukaRequestException)
    expect(caught).not.toBeInstanceOf(TestCustomException)
  })
})
