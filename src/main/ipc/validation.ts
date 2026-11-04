import { z } from 'zod'
export function validate<T extends z.ZodType>(schema: T, args: unknown): z.infer<T> {
  const result = schema.safeParse(args)
  if (!result.success) throw new Error(JSON.stringify({ code: 'INVALID_ARGUMENT', message: '请求参数无效', details: result.error.issues }))
  return result.data
}
export const noArgs = z.tuple([])
