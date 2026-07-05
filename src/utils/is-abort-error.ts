/**
 * 检测错误是否为 AbortError（请求被取消）。
 *
 * 支持以下场景：
 * - 浏览器原生 AbortController → DOMException { name: 'AbortError', code: 20 }
 * - Node.js 15+ → 全局 DOMException（同上）
 * - Node.js <15 或 polyfill → Error { name: 'AbortError' }
 * - keq flowControl('abort') → AbortException extends DOMException
 *
 * 注意：仅检测 error.name，不检测 error.message，避免误匹配
 * 那些 message 中包含 "abort" 但 name 不同的合法错误。
 *
 * @param error - 待检测的错误对象
 * @returns 如果 error 是 AbortError 返回 true，否则返回 false
 */
export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  // 优先检测 DOMException 实例（浏览器、Node.js 15+、jsdom）。
  // typeof 守卫避免在 DOMException 不可用的旧环境中抛出 ReferenceError。
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError'
  }

  // 兜底：确保是 Error 实例才检查 name 属性，避免误匹配普通对象。
  // 覆盖以下场景：
  // 1. Node.js <15（DOMException 不存在作为全局变量）
  // 2. 跨 realm 场景（iframe / VM module 的 DOMException 与主 realm 不同）
  // 3. 第三方 AbortController polyfill（抛出普通 Error）
  // 4. 任何显式设置 name='AbortError' 的类 AbortError
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError'
}
