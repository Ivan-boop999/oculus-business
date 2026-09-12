import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Coins01Icon,
  HandshakeIcon,
  TimerIcon,
} from '@hugeicons/core-free-icons'

import { cashflowHistoryResponseSchema, dashboardResponseSchema } from '@oculus-business/contracts'
import { KpiCard, MoneyBadge, SectionCard } from '@/components/dashboard-ui'
import { useAuth } from '@/features/auth'
import { dateLabel, formatMoney, formatMoneyShort, RUNWAY_MODE_LABELS } from '@/platform/format'

/// Главный экран — «командный центр» в стиле OCULUS: hero-баланс, KPI-плитки
/// со свечением, воронка с барами и лента ближайших действий.
export function DashboardPage() {
  const { transport } = useAuth()
  const history = useQuery({
    queryKey: ['finance', 'cashflow', 6],
    queryFn: ({ signal }) =>
      transport.request('/api/finance/history?months=6', cashflowHistoryResponseSchema, {
        signal,
      }),
  })
  const sparkline = (history.data?.months ?? []).map((month) => [month.income, month.expense] as [number, number])

  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => transport.request('/api/dashboard', dashboardResponseSchema, { signal }),
  })

  if (dashboard.isPending) {
    return (
      <div className="grid gap-4">
        <div className="h-40 animate-pulse rounded-2xl border border-white/6 bg-white/[0.03]" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div className="h-28 animate-pulse rounded-2xl border border-white/6 bg-white/[0.03]" key={i} />
          ))}
        </div>
      </div>
    )
  }
  if (dashboard.isError || !dashboard.data) {
    return (
      <SectionCard className="py-10 text-center">
        <p className="text-sm text-[#FB7185]">Не удалось загрузить сводку</p>
        <button
          className="mt-2 text-sm text-[#A5B4FC] underline underline-offset-4"
          onClick={() => void dashboard.refetch()}
        >
          Повторить
        </button>
      </SectionCard>
    )
  }

  const data = dashboard.data
  const healthy = ['positive', 'comfortable', 'stable'].includes(data.finance.mode)
  const monthTotal = data.finance.monthIncome + data.finance.monthExpense
  const incomeShare = monthTotal > 0 ? (data.finance.monthIncome / monthTotal) * 100 : 0

  return (
    <div className="grid gap-4">
      {/* ------------------------------------------------ Hero: баланс и здоровье */}
      <section className="relative overflow-hidden rounded-2xl border border-[#6366F1]/20 bg-gradient-to-br from-[#6366F1]/[0.14] via-white/[0.03] to-transparent p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.25),transparent_65%)] blur-2xl"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#A5B4FC] uppercase">
              Деньги на счетах
            </p>
            <p className="mt-1.5 text-4xl font-bold tracking-tight text-white tabular-nums lg:text-5xl">
              {formatMoney(data.finance.balance)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <MoneyBadge kind={healthy ? 'income' : 'warning'}>
                <HugeiconsIcon className="size-3" icon={TimerIcon} strokeWidth={2} />
                runway {data.finance.runwayMonths === null ? '∞' : `${data.finance.runwayMonths} мес`}
              </MoneyBadge>
              <span className="text-[11px] text-muted-foreground">
                {RUNWAY_MODE_LABELS[data.finance.mode] ?? data.finance.mode}
              </span>
            </div>
          </div>
          <div className="min-w-56">
            <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>
                <span className="text-[#34D399]">доход</span> /{' '}
                <span className="text-[#FB7185]">расход</span> месяца
              </span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/6">
              <div
                className="h-full bg-gradient-to-r from-[#34D399]/70 to-[#34D399] shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                style={{ width: `${incomeShare}%` }}
              />
              <div
                className="h-full bg-gradient-to-r from-[#F43F5E]/70 to-[#F43F5E]/50"
                style={{ width: `${100 - incomeShare}%` }}
              />
            </div>
            <div className="mt-2 flex gap-3 text-[12px] tabular-nums">
              <span className="text-[#34D399]">+{formatMoneyShort(data.finance.monthIncome)}</span>
              <span className="text-[#FB7185]">−{formatMoneyShort(data.finance.monthExpense)}</span>
              <span className="ml-auto text-white">
                {formatMoneyShort(data.finance.monthNet)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ KPI-плитки */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={<HugeiconsIcon className="size-4" icon={Coins01Icon} strokeWidth={2} />}
          label="MRR · подписки"
          sparkline={sparkline}
          sub="доход/расход по месяцам (6 мес)"
          tone="positive"
          value={`${formatMoneyShort(data.crm.mrr)}/мес`}
        />
        <KpiCard
          icon={<HugeiconsIcon className="size-4" icon={HandshakeIcon} strokeWidth={2} />}
          label="Сделки в работе"
          sub={`${formatMoneyShort(data.crm.pipelineMonthly)}/мес в пайплайне`}
          tone="accent"
          value={String(data.crm.activeDeals)}
        />
        <KpiCard
          icon={<HugeiconsIcon className="size-4" icon={ArrowUp01Icon} strokeWidth={2} />}
          sparkline={sparkline}
          label="Разовый пайплайн"
          sub="пилоты и внедрения"
          value={formatMoneyShort(data.crm.pipelineOneTime)}
        />
        <KpiCard
          icon={<HugeiconsIcon className="size-4" icon={ArrowDown01Icon} strokeWidth={2} />}
          label="Клиентов действует"
          sub="на этапе «выиграно»"
          tone="positive"
          value={String(data.crm.wonDeals)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5 lg:items-start">
        {/* ------------------------------------------------ Следующие действия */}
        <SectionCard
          action={
            <Link className="text-[11px] text-[#A5B4FC] hover:text-white" to="/app/crm">
              доску →
            </Link>
          }
          className="lg:col-span-3"
          title="Следующие действия"
        >
          {data.nextActions.some((action) => action.overdue) && (
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-[#F43F5E]/30 bg-[#F43F5E]/10 px-2 py-1 text-[11px] font-semibold text-[#FB7185]">
              ⚠ Просрочено: {data.nextActions.filter((action) => action.overdue).length}
            </p>
          )}
          <div className="grid gap-2">
            {data.nextActions.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-muted-foreground">
                Нет запланированных действий — откройте сделку и задайте «следующее действие»
              </p>
            )}
            {data.nextActions.map((action) => (
              <Link
                className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
                  action.overdue
                    ? 'border-[#F43F5E]/35 bg-[#F43F5E]/8 hover:border-[#F43F5E]/55'
                    : 'border-white/6 bg-white/[0.025] hover:border-[#6366F1]/35 hover:bg-[rgba(99,102,241,0.07)]'
                }`}
                key={action.dealId}
                to="/app/crm"
              >
                <span
                  className={`grid shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold tabular-nums ${
                    action.overdue
                      ? 'border-[#F43F5E]/40 bg-[#F43F5E]/15 text-[#FB7185]'
                      : 'border-[#6366F1]/30 bg-[#6366F1]/12 text-[#A5B4FC]'
                  }`}
                >
                  {action.nextActionAt ? dateLabel(action.nextActionAt) : '—'}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-medium text-white">{action.dealTitle}</span>
                  {action.nextAction ? (
                    <span className="text-muted-foreground"> — {action.nextAction}</span>
                  ) : null}
                </span>
                <span className="hidden shrink-0 rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground sm:block">
                  {action.stageTitle}
                </span>
              </Link>
            ))}
          </div>
        </SectionCard>

        {/* ------------------------------------------------ Продукт */}
        <SectionCard
          action={
            <Link className="text-[11px] text-[#A5B4FC] hover:text-white" to="/app/tasks">
              доску →
            </Link>
          }
          className="lg:col-span-2"
          title="Продукт"
        >
          <div className="grid gap-2.5">
            <ProductRow label="открыто задач" value={data.dev.openTasks} />
            <ProductRow label="в работе" value={data.dev.inProgressTasks} />
            <ProductRow label="срочных багов" tone="negative" value={data.dev.urgentBugs} />
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

function ProductRow({
  label,
  tone = 'default',
  value,
}: {
  label: string
  tone?: 'default' | 'negative'
  value: number
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span
        className={`text-lg font-bold tabular-nums ${
          tone === 'negative' && value > 0 ? 'text-[#FB7185]' : 'text-white'
        }`}
      >
        {value}
      </span>
    </div>
  )
}
