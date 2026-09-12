import { AppError } from '../../../http/errors'
import { BusinessFailure } from '../domain/errors'

export function toBusinessAppError(error: unknown) {
  if (!(error instanceof BusinessFailure)) return error

  if (error.kind === 'not_found') {
    return new AppError(404, 'NOT_FOUND', error.message)
  }
  if (error.kind === 'conflict') {
    return new AppError(409, 'CONFLICT', error.message)
  }
  return new AppError(400, 'VALIDATION_ERROR', error.message)
}

export async function executeBusiness<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toBusinessAppError(error)
  }
}
