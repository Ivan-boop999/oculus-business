import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { dashboardResponseSchema } from '@oculus-business/contracts'
import { useAuth } from '@/features/auth'
import { dateLabel, formatMoney, RUNWAY_MODE_LABELS } from '@/platform/format'

/// Главный экран: здоровье бизнеса одним взглядом — деньги, воронка, действия, задачи.
export function DashboardPage() {
  const { transport } = useAuth()
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => transport.request('/api/dashboard', dashboardResponseSchema, { signal }),
  })

  if (dashboard.isPending) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Загружаем…</p>
  }
  if (dashboard.isError || !dashboard.data) {
    return (
      <div className="grid gap-3 py-12 text-center">
        <p className="text-sm text-destructive">Не удалось загрузить сводку</p>
        <button
          className="text-sm text-primary underline"
          onClick={() => void dashboard.refetch()}
        >
          Повторить
        </button>
      </div>
    )
  }

  const data = dashboard.data

  return (
    <div className="grid gap-4">
      <h1 className="text-lg font-semibold tracking-tight">Обзор</h1>

      <div className="grid grid-cols-2 gap-2">
        <MetricTile
          label="Баланс"
          value={formatMoney(data.finance.balance)}
        />
        <MetricTile
          label="MRR (подписки)"
          tone="text-emerald-600 dark:text-emerald-400"
          value={`${formatMoney(data.crm.mrr)}/мес`}
        />
        <MetricTile
          label="За месяц: доход / расход"
          value={`${formatMoney(data.finance.monthIncome)} / ${formatMoney(
            data.finance.monthExpense,
          )}`}
        />
        <MetricTile
          label="Runway"
          sub={RUNWAY_MODE_LABELS[data.finance.mode] ?? data.finance.mode}
          tone={
            ['positive', 'comfortable', 'stable'].includes(data.finance.mode)
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-amber-600 dark:text-amber-400'
          }
          value={data.finance.runwayMonths === null ? '∞' : `${data.finance.runwayMonths} мес`}
        />
      </div>

      <div className="rounded-xl border p-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Воронка</h2>
          <Link className="text-xs text-primary" to="/app/crm">
            открыть доску →
          </Link>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <p className="text-base font-semibold">{data.crm.activeDeals}</p>
            <p className="text-[11px] text-muted-foreground">в работе</p>
          </div>
          <div>
            <p className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
              {data.crm.wonDeals}
            </p>
            <p className="text-[11px] text-muted-foreground">клиентов</p>
          </div>
          <div>
            <p className="text-base font-semibold">{formatMoney(data.crm.pipelineMonthly)}</p>
            <p className="text-[11px] text-muted-foreground">пайплайн/мес</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border p-3">
        <h2 className="text-sm font-semibold">Следующие действия</h2>
        <div className="mt-2 grid gap-2">
          {data.nextActions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Нет запланированных действий — откройте сделку и задайте «следующее действие».
            </p>
          )}
          {data.nextActions.map((action) => (
            <Link
              className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm transition-colors hover:bg-muted"
              key={action.dealId}
              to="/app/crm"
            >
              <span className="grid shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {action.nextActionAt ? dateLabel(action.nextActionAt) : '—'}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{action.dealTitle}</span>
                {action.nextAction ? ` — ${action.nextAction}` : ''}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{action.stageTitle}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-xl border p-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Продукт</h2>
          <Link className="text-xs text-primary" to="/app/tasks">
            доска доработок →
          </Link>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <p className="text-base font-semibold">{data.dev.openTasks}</p>
            <p className="text-[11px] text-muted-foreground">открыто</p>
          </div>
          <div>
            <p className="text-base font-semibold">{data.dev.inProgressTasks}</p>
            <p className="text-[11px] text-muted-foreground">в работе</p>
          </div>
          <div>
            <p className="text-base font-semibold text-red-600 dark:text-red-400">
              {data.dev.urgentBugs}
            </p>
            <p className="text-[11px] text-muted-foreground">срочных багов</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricTile({
  label,
  sub,
  tone,
  value,
}: {
  label: string
  sub?: string
  tone?: string
  value: string
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-base font-semibold ${tone ?? ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}
