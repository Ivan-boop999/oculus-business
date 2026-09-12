import { Link } from '@tanstack/react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatMoney, monthLabel, RUNWAY_MODE_LABELS } from '@/platform/format'

import { useForecastQuery } from './queries'

/// Прогноз денежного потока: помесячный план на основе регулярных платежей,
/// MRR и уже записанных будущих операций + runway по методике владельца.
export function ForecastPage() {
  const forecast = useForecastQuery(6)

  if (forecast.isPending) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Считаем прогноз…</p>
  }
  if (forecast.isError || !forecast.data) {
    return (
      <div className="grid gap-3 py-12 text-center">
        <p className="text-sm text-destructive">Не удалось построить прогноз</p>
        <Button onClick={() => void forecast.refetch()} variant="outline">
          Повторить
        </Button>
      </div>
    )
  }

  const data = forecast.data
  const maxFlow = Math.max(
    ...data.months.map((month) => Math.max(month.plannedIncome, month.plannedExpense)),
    1,
  )

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold tracking-tight">Прогноз</h1>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border p-3">
          <p className="text-xs text-muted-foreground">Баланс сейчас</p>
          <p className="mt-1 text-base font-semibold">{formatMoney(data.balance)}</p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-xs text-muted-foreground">Runway</p>
          <p className="mt-1 text-base font-semibold">
            {data.runwayMonths === null ? '∞' : `${data.runwayMonths} мес`}
          </p>
          <Badge
            className={
              data.mode === 'positive' || data.mode === 'comfortable' || data.mode === 'stable'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            }
          >
            {RUNWAY_MODE_LABELS[data.mode] ?? data.mode}
          </Badge>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Runway = баланс ÷ средний чистый расход за 3 полных месяца
        {data.avgNetBurn3m !== null ? ` (${formatMoney(data.avgNetBurn3m)}/мес)` : ''}. MRR из
        выигранных сделок: {formatMoney(data.mrr)}/мес.
      </p>

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold">План по месяцам</h2>
        {data.months.map((month) => (
          <div className="rounded-xl border p-3" key={month.month}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium capitalize">{monthLabel(month.month)}</span>
              <span
                className={`text-sm font-semibold ${
                  month.net >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {month.net >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(month.net))}
              </span>
            </div>
            <div className="mt-2 grid gap-1">
              <FlowBar
                label="Доходы"
                ratio={month.plannedIncome / maxFlow}
                tone="bg-emerald-500"
                value={formatMoney(month.plannedIncome)}
              />
              <FlowBar
                label="Расходы"
                ratio={month.plannedExpense / maxFlow}
                tone="bg-red-400"
                value={formatMoney(month.plannedExpense)}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>регулярные +{formatMoney(month.recurringIncome)}</span>
              <span>MRR +{formatMoney(month.mrrIncome)}</span>
              <span>разовые +{formatMoney(month.oneTimeIncome)}</span>
              <span>расходы регулярные −{formatMoney(month.recurringExpense)}</span>
              <span>разовые −{formatMoney(month.oneTimeExpense)}</span>
            </div>
            <p className="mt-2 border-t pt-2 text-xs">
              Баланс на конец:{' '}
              <span className="font-semibold">{formatMoney(month.closingBalance)}</span>
            </p>
          </div>
        ))}
      </section>

      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link to="/app/finance">← Операции</Link>
        </Button>
      </div>
    </div>
  )
}

function FlowBar({
  label,
  ratio,
  tone,
  value,
}: {
  label: string
  ratio: number
  tone: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right text-[11px] tabular-nums">{value}</span>
    </div>
  )
}
