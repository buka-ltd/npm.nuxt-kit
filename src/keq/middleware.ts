import { createExceptionByStatusCode } from '@keq-request/exception'
import type { KeqMiddleware } from 'keq'
import { BukaRequestException, type BukaRequestExceptionOptions } from './buka-request-exception.js'

interface ExceptionResponse {
  error: {
    code: string
    message: string
    details: Array<{ type: string; [key: string]: unknown }>
  }
}

/**
 * Buka 异常子类构造器签名。
 * 所有 BukaRequestException 子类均遵循此构造器参数约定：
 * (statusCode, message, options) → 子类实例。
 */
export interface BukaExceptionConstructor {
  new (
    statusCode: number,
    message: string,
    options: BukaRequestExceptionOptions
  ): BukaRequestException
}

/**
 * `throwOneResponseError` 的配置选项。
 */
export interface ThrowOneResponseErrorOptions {
  /**
   * 错误码到异常子类构造器的映射。
   * 匹配到的错误码使用对应子类实例化，未匹配的降级为 BukaRequestException。
   */
  errorDispatchers?: Record<string, BukaExceptionConstructor>
}

/**
 * 创建可配置错误码分发的 Keq 错误处理中间件。
 *
 * 对 >= 400 的响应解析 JSON body 中的 `error` 对象，
 * 抛出结构化的 BukaRequestException。
 * 通过 `errorDispatchers` 可将特定错误码映射到异常子类。
 */
export function throwOneResponseError(options?: ThrowOneResponseErrorOptions): KeqMiddleware {
  const { errorDispatchers } = options ?? {}

  return async (ctx, next) => {
    await next()

    if (!ctx.response) return
    if (ctx.response.status >= 200 && ctx.response.status < 400) return

    const response = ctx.response

    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw createExceptionByStatusCode(response)
    }

    const body = await response.json()

    if (body !== null && typeof body === 'object' && 'error' in body) {
      const { error } = body as ExceptionResponse

      const exceptionOptions: BukaRequestExceptionOptions = {
        code: error.code,
        details: error.details,
        response,
        fatal: [401, 403, 404].includes(response.status),
      }

      if (errorDispatchers && error.code in errorDispatchers) {
        const ExceptionClass = errorDispatchers[error.code]
        throw new ExceptionClass(response.status, error.message, exceptionOptions)
      }

      throw new BukaRequestException(response.status, error.message, exceptionOptions)
    }

    throw createExceptionByStatusCode(response)
  }
}

