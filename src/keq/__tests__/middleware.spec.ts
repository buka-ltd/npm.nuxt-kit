import { describe, expect, it, vi } from 'vitest'
import { BukaRequestException } from '../buka-request-exception.js'
import { createBukaErrorMiddleware, bukaErrorMiddleware } from '../middleware.js'

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

describe('bukaErrorMiddleware', () => {
  it('2xx 响应不应抛出异常', async () => {
    const ctx = createMockContext({ status: 200, body: {} })
    const next = vi.fn()

    await expect(bukaErrorMiddleware(ctx as never, next)).resolves.toBeUndefined()
  })

  it('3xx 响应不应抛出异常', async () => {
    const ctx = createMockContext({ status: 302 })
    const next = vi.fn()

    await expect(bukaErrorMiddleware(ctx as never, next)).resolves.toBeUndefined()
  })

  it('无 response 属性时不应抛出异常', async () => {
    const ctx = { response: undefined }
    const next = vi.fn()

    await expect(
      bukaErrorMiddleware(ctx as never, next),
    ).resolves.toBeUndefined()
  })

  it('非 JSON 响应应调用 createExceptionByStatusCode 兜底', async () => {
    const ctx = createMockContext({ status: 500, contentType: 'text/plain' })
    const next = vi.fn()

    // bukaErrorMiddleware 内会 throw，用 expect().rejects 捕获
    await expect(
      bukaErrorMiddleware(ctx as never, next),
    ).rejects.toThrow('非 JSON 错误')

    expect(mockCreateException).toHaveBeenCalledWith(ctx.response)
  })
})

describe('createBukaErrorMiddleware', () => {
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
      createBukaErrorMiddleware()(ctx as never, next),
    ).rejects.toThrow(BukaRequestException)

    await expect(
      createBukaErrorMiddleware()(ctx as never, next),
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
        createBukaErrorMiddleware()(ctx as never, next),
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
      createBukaErrorMiddleware()(ctx as never, next),
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
      createBukaErrorMiddleware()(ctx as never, next),
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

    const middleware = createBukaErrorMiddleware({
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

    const middleware = createBukaErrorMiddleware({
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

  it('bukaErrorMiddleware 应与 createBukaErrorMiddleware() 行为一致', async () => {
    const ctx = createMockContext({
      status: 400,
      body: {
        error: {
          code: 'V0-0001-1000-001',
          message: '错误',
          details: [],
        },
      },
    })
    const next = vi.fn()

    // 两者应有相同行为
    const factoryMiddleware = createBukaErrorMiddleware()

    let factoryErr: unknown = null
    let constErr: unknown = null

    try { await factoryMiddleware({ ...ctx } as never, vi.fn()) } catch (e) { factoryErr = e }
    try { await bukaErrorMiddleware({ ...ctx } as never, vi.fn()) } catch (e) { constErr = e }

    expect(factoryErr).toBeInstanceOf(BukaRequestException)
    expect(constErr).toBeInstanceOf(BukaRequestException)
  })
})
