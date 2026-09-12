/// Ошибки предметной области бизнеса: сделка/этап/задача/платёж не найден,
/// этап с сделками нельзя удалить и т.п. Транспорт переводит их в HTTP-коды.
export class BusinessFailure extends Error {
  readonly kind: 'not_found' | 'conflict' | 'validation'

  constructor(kind: 'not_found' | 'conflict' | 'validation', message: string) {
    super(message)
    this.kind = kind
  }
}
