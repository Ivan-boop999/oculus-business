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
        <h1 className="mr-auto text-xl font-semibold tracking-tight text-white lg:text-2xl">
          Прогноз
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-4">
          <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            Баланс сейчас
          </p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-white tabular-nums">
            {formatMoney(data.balance)}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-[#6366F1]/25 bg-gradient-to-br from-[#6366F1]/[0.12] to-transparent p-4">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-10 -right-8 size-32 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.3),transparent_65%)] blur-xl"
          />
          <p className="text-[11px] font-medium tracking-[0.08em] text-[#A5B4FC] uppercase">
            Runway
          </p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-white tabular-nums">
            {data.runwayMonths === null ? '∞' : `${data.runwayMonths} мес`}
          </p>
          <Badge
            className={
              data.mode === 'positive' || data.mode === 'comfortable' || data.mode === 'stable'
                ? 'border-[#34D399]/25 bg-[#34D399]/10 text-[#34D399]'
                : 'border-[#FBBF24]/25 bg-[#FBBF24]/10 text-[#FBBF24]'
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

      <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <h2 className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase lg:col-span-2 xl:col-span-3">
          План по месяцам
        </h2>
        {data.months.map((month) => (
          <div
            className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4"
            key={month.month}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-white capitalize">
                {monthLabel(month.month)}
              </span>
              <span
                className={`text-sm font-semibold tabular-nums ${
                  month.net >= 0 ? 'text-[#34D399]' : 'text-[#FB7185]'
                }`}
              >
                {month.net >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(month.net))}
              </span>
            </div>
            <div className="mt-2.5 grid gap-1.5">
              <FlowBar
                label="Доходы"
                ratio={month.plannedIncome / maxFlow}
                tone="bg-gradient-to-r from-[#34D399]/60 to-[#34D399] shadow-[0_0_10px_rgba(52,211,153,0.35)]"
                value={formatMoney(month.plannedIncome)}
              />
              <FlowBar
                label="Расходы"
                ratio={month.plannedExpense / maxFlow}
                tone="bg-gradient-to-r from-[#F43F5E]/50 to-[#F43F5E]/80"
                value={formatMoney(month.plannedExpense)}
              />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>регулярные +{formatMoney(month.recurringIncome)}</span>
              <span>MRR +{formatMoney(month.mrrIncome)}</span>
              <span>разовые +{formatMoney(month.oneTimeIncome)}</span>
              <span>расходы регулярные −{formatMoney(month.recurringExpense)}</span>
              <span>разовые −{formatMoney(month.oneTimeExpense)}</span>
            </div>
            <p className="mt-2.5 border-t border-white/6 pt-2.5 text-xs text-muted-foreground">
              Баланс на конец:{' '}
              <span className="font-semibold text-white tabular-nums">
                {formatMoney(month.closingBalance)}
              </span>
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
