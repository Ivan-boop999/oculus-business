import type { z } from 'zod'

import type { HttpRequestOptions } from './http-client'

export type AuthenticatedTransport = {
  request<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options?: HttpRequestOptions,
  ): Promise<z.infer<TSchema>>
  /// Ответ без парсинга тела — для 204-ответов (удаления).
  raw(path: string, options?: HttpRequestOptions): Promise<Response>
}
