import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { crmReportResponseSchema } from '@oculus-business/contracts'
import { useAuth } from '@/features/auth'
import { formatMoneyShort } from '@/platform/format'

/// Отчёт по воронке: конверсии этапов, время в этапе, цикл сделки, причины отказов.
export function CrmReportPage() {
  const { transport } = useAuth()
  const report = useQuery({
    queryKey: ['crm', 'report'],
    queryFn: ({ signal }) => transport.request('/api/crm/report', crmReportResponseSchema, { signal }),
  })

  if (report.isPending) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Считаем воронку…</p>
  }
  if (report.isError || !report.data) {
    return (
      <div className="grid gap-3 py-12 text-center">
        <p className="text-sm text-[#FB7185]">Не удалось построить отчёт</p>
        <Button onClick={() => void report.refetch()} variant="outline">
          Повторить
        </Button>
      </div>
    )
  }

  const data = report.data
  const maxEntered = Math.max(...data.stages.map((stage) => stage.entered), 1)

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight text-white lg:text-2xl">
          Отчёт по воронке
        </h1>
        <Button asChild size="sm" variant="outline">
          <Link to="/app/crm">← Доска</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Средний цикл сделки"
          value={data.avgCycleDays === null ? '—' : `${data.avgCycleDays} дн`}
          sub="от создания до победы"
        />
        <Tile
          label="Средний чек (разовый)"
          value={formatMoneyShort(data.avgOneTimeAmount)}
          sub="по выигранным"
        />
        <Tile
          label="Средняя подписка"
          value={`${formatMoneyShort(data.avgMonthlyAmount)}/мес`}
          sub="по выигранным"
        />
        <Tile
          label="Причины отказов"
          value={String(data.lostReasons.reduce((sum, item) => sum + item.count, 0))}
          sub="сделок в отказе"
        />
      </div>

      <section className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
        <h2 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          Этапы: входы, конверсия, время
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="text-left text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              <tr>
                <th className="px-2 py-2 font-semibold">Этап</th>
                <th className="px-2 py-2 font-semibold">Входов</th>
                <th className="px-2 py-2 font-semibold">Дошли дальше</th>
                <th className="px-2 py-2 font-semibold">Сейчас</th>
                <th className="px-2 py-2 text-right font-semibold">Ср. время</th>
                <th className="w-48 px-2 py-2 font-semibold">Поток</th>
              </tr>
            </thead>
            <tbody>
              {data.stages.map((stage) => (
                <tr className="border-t border-white/5" key={stage.title}>
                  <td className="px-2 py-2 font-medium text-white">{stage.title}</td>
                  <td className="px-2 py-2 tabular-nums text-muted-foreground">{stage.entered}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {stage.conversionPct === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={
                          stage.conversionPct >= 50
                            ? 'text-[#34D399]'
                            : stage.conversionPct >= 20
                              ? 'text-[#FBBF24]'
                              : 'text-[#FB7185]'
                        }
                      >
                        {stage.conversionPct}%
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-muted-foreground">{stage.dealsNow}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                    {stage.avgDaysInStage === null ? '—' : `${stage.avgDaysInStage} дн`}
                  </td>
                  <td className="px-2 py-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/6">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#7B5CFA] to-[#4338CA]"
                        style={{ width: `${Math.max(2, (stage.entered / maxEntered) * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          «Входов» и «дошли дальше» считаются по истории перемещений (записывается с запуска системы);
          чем дольше вы работаете, тем точнее цифры. «Ср. время» — сколько дней сделка в среднем
          находится в этапе.
        </p>
      </section>

      {data.lostReasons.length > 0 && (
        <section className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
          <h2 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Почему теряем
          </h2>
          <div className="grid gap-2">
            {data.lostReasons.map((item) => (
              <div
                className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.025] px-3 py-2"
                key={item.reason}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-white">{item.reason}</span>
                <span className="rounded-md border border-[#F43F5E]/25 bg-[#F43F5E]/10 px-2 py-0.5 text-[11px] font-semibold text-[#FB7185] tabular-nums">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Tile({ label, sub, value }: { label: string; sub?: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-4">
      <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-bold tracking-tight text-white tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}
