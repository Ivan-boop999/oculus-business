import type {
  ForecastMonth,
  RecurringItem,
  Txn,
} from '@oculus-business/contracts'

/// Чистая математика прогноза и runway. Без внешних зависимостей: вход — DTO-строки
/// 'YYYY-MM-DD', выход — числа. Календарные границы считаются по UTC.

export type MonthKey = string // YYYY-MM

export function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function monthOf(dateKey: string): MonthKey {
  return dateKey.slice(0, 7)
}

export function currentMonth(now: Date): MonthKey {
  return now.toISOString().slice(0, 7)
}

export function addMonths(month: MonthKey, count: number): MonthKey {
  const [year, mon] = month.split('-').map(Number)
  const total = year * 12 + (mon - 1) + count
  const nextYear = Math.floor(total / 12)
  const nextMon = (total % 12) + 1
  return `${nextYear}-${String(nextMon).padStart(2, '0')}`
}

export function monthStart(month: MonthKey): string {
  return `${month}-01`
}

export function monthEnd(month: MonthKey): string {
  const next = addMonths(month, 1)
  const [nextYear, nextMon] = next.split('-').map(Number)
  const lastDay = new Date(Date.UTC(nextYear, nextMon - 1, 0)).getUTCDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}

export function daysInMonth(month: MonthKey): number {
  return Number(monthEnd(month).slice(8, 10))
}

function net(txns: Txn[]): number {
  return txns.reduce((sum, txn) => sum + (txn.kind === 'income' ? txn.amount : -txn.amount), 0)
}

/// Баланс «сейчас»: стартовый остаток + чистый итог всех операций с даты стартового
/// остатка по сегодня. Кассовый метод: только фактические поступления/списания.
export function balanceTo(
  settings: { openingBalanceDate: string; openingBalance: number },
  txns: Txn[],
  throughDate: string,
): number {
  const counted = txns.filter(
    (txn) => txn.occurredOn >= settings.openingBalanceDate && txn.occurredOn <= throughDate,
  )
  return settings.openingBalance + net(counted)
}

export function isRecurringActiveInMonth(item: RecurringItem, month: MonthKey): boolean {
  const start = monthStart(month)
  const end = monthEnd(month)
  if (item.activeFrom > end) return false
  if (item.activeUntil !== null && item.activeUntil < start) return false
  return true
}

export function sumRecurring(items: RecurringItem[], month: MonthKey) {
  let income = 0
  let expense = 0
  for (const item of items) {
    if (!isRecurringActiveInMonth(item, month)) continue
    if (item.kind === 'income') income += item.amount
    else expense += item.amount
  }
  return { recurringIncome: income, recurringExpense: expense }
}

export function sumTxnsInMonth(txns: Txn[], month: MonthKey, afterDate?: string) {
  let income = 0
  let expense = 0
  for (const txn of txns) {
    if (monthOf(txn.occurredOn) !== month) continue
    if (afterDate !== undefined && txn.occurredOn <= afterDate) continue
    if (txn.kind === 'income') income += txn.amount
    else expense += txn.amount
  }
  return { oneTimeIncome: income, oneTimeExpense: expense }
}

export type ForecastComputation = {
  balance: number
  mrr: number
  avgNetBurn3m: number | null
  runwayMonths: number | null
  mode: 'positive' | 'comfortable' | 'stable' | 'watchful' | 'defensive' | 'critical'
  months: ForecastMonth[]
}

export type ForecastInput = {
  now: Date
  horizon: number
  settings: { openingBalanceDate: string; openingBalance: number }
  txns: Txn[]
  recurring: RecurringItem[]
  /// Сумма monthly_amount сделок на этапах-победах: стабильный ежемесячный доход (MRR).
  mrr: number
}

/// Прогноз: начиная с текущего месяца, на `horizon` месяцев вперёд.
/// Доход месяца = регулярные доходы + MRR + уже записанные будущие разовые поступления.
/// Расход месяца = регулярные расходы + уже записанные будущие разовые расходы.
export function computeForecast(input: ForecastInput): ForecastComputation {
  const today = todayKey(input.now)
  const current = currentMonth(input.now)
  const balance = balanceTo(input.settings, input.txns, today)

  const months: ForecastMonth[] = []
  let runningBalance = balance
  for (let offset = 0; offset < input.horizon; offset += 1) {
    const month = addMonths(current, offset)
    const { recurringIncome, recurringExpense } = sumRecurring(input.recurring, month)
    // Разовые будущие операции: для текущего месяца — только после сегодня, для будущих — весь месяц.
    const { oneTimeIncome, oneTimeExpense } = sumTxnsInMonth(input.txns, month, offset === 0 ? today : undefined)
    const mrrIncome = input.mrr
    const plannedIncome = recurringIncome + mrrIncome + oneTimeIncome
    const plannedExpense = recurringExpense + oneTimeExpense
    const monthNet = plannedIncome - plannedExpense
    runningBalance += monthNet
    months.push({
      month,
      recurringIncome,
      mrrIncome,
      oneTimeIncome,
      recurringExpense,
      oneTimeExpense,
      plannedIncome,
      plannedExpense,
      net: monthNet,
      closingBalance: runningBalance,
    })
  }

  const avgNetBurn3m = averageNetBurn(input.txns, current, 3)
  const runwayMonths =
    avgNetBurn3m !== null && avgNetBurn3m > 0
      ? Math.round((balance / avgNetBurn3m) * 10) / 10
      : null

  return {
    balance,
    mrr: input.mrr,
    avgNetBurn3m,
    runwayMonths,
    mode: runwayMode(runwayMonths),
    months,
  }
}

/// Средний чистый расход за последние `count` ПОЛНЫХ месяца (не включая текущий).
/// Возвращает null, если данных нет ни за один месяц.
export function averageNetBurn(txns: Txn[], current: MonthKey, count: number): number | null {
  const burns: number[] = []
  for (let offset = 1; offset <= count; offset += 1) {
    const month = addMonths(current, -offset)
    const totals = sumTxnsInMonth(txns, month)
    const burn = totals.oneTimeExpense - totals.oneTimeIncome
    burns.push(burn)
  }
  // Среднее по месяцам, где была хотя бы одна операция.
  const activeMonths = burns.length
  if (activeMonths === 0) return null
  const hasAnyTxn = txns.some((txn) =>
    burns.some((_, index) => monthOf(txn.occurredOn) === addMonths(current, -(index + 1))),
  )
  if (!hasAnyTxn) return null
  return Math.round(burns.reduce((sum, value) => sum + value, 0) / activeMonths)
}

/// Стратегические режимы из cash-flow методики владельца:
/// >18 comfortable · 12–18 stable · 6–12 watchful · 3–6 defensive · <3 critical · null positive.
export function runwayMode(
  runwayMonths: number | null,
): ForecastComputation['mode'] {
  if (runwayMonths === null) return 'positive'
  if (runwayMonths > 18) return 'comfortable'
  if (runwayMonths >= 12) return 'stable'
  if (runwayMonths >= 6) return 'watchful'
  if (runwayMonths >= 3) return 'defensive'
  return 'critical'
}

export function monthLabel(month: MonthKey): string {
  const [year, mon] = month.split('-').map(Number)
  const names = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
  ]
  return `${names[mon - 1]} ${year}`
}
