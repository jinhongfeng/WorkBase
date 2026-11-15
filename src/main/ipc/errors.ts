/** 统一的业务错误：message 序列化为 JSON，渲染层可解析 code 与文案。 */
export class AppError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(JSON.stringify({ code, message }))
    this.code = code
  }
}

export function fail(code: string, message: string): never {
  throw new AppError(code, message)
}

export function describeError(error: unknown): string {
  if (error instanceof AppError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}
