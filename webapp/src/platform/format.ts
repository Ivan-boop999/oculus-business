/// Форматирование денег и дат для русского интерфейса. Деньги — целые рубли.

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
})

export function formatMoney(amount: number): string {
  return `${moneyFormatter.format(amount)} ₽`
}

export function formatMoneyShort(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)} млн ₽`
  }
  if (Math.abs(amount) >= 10_000) {
    return `${Math.round(amount / 1000)} тыс ₽`
  }
  return formatMoney(amount)
}

const MONTH_NAMES = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

/// '2026-09' -> 'сентябрь 2026'
export function monthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  return `${MONTH_NAMES[(mon ?? 1) - 1]} ${year}`
}

/// '2026-09-12' -> '12 сен'
export function dateLabel(dateOnly: string): string {
  const [, mon, day] = dateOnly.split('-').map(Number)
  const short = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return `${day} ${short[(mon ?? 1) - 1]}`
}

export function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10)
}

export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7)
}

export const RUNWAY_MODE_LABELS: Record<string, string> = {
  positive: 'Проект самоокупается',
  comfortable: 'Комфортно (>18 мес)',
  stable: 'Стабильно (12–18 мес)',
  watchful: 'Внимание (6–12 мес)',
  defensive: 'Оборона (3–6 мес)',
  critical: 'Критично (<3 мес)',
}

export const TASK_TYPE_LABELS: Record<string, string> = {
  bug: 'Баг',
  feature: 'Доработка',
  idea: 'Идея',
}

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  urgent: 'Срочно',
}
