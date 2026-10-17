import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { crmReportResponseSchema } from '@oculus-business/contracts'
import { useAuth } from '@/features/auth'
import { formatMoneyShort } from '@/platform/format'

import { useBusinessUsersQuery, useFunnelReportQuery } from './sales-queries'

/// Отчёт по воронке: конверсии этапов, время в этапе, цикл сделки, причины отказов
/// + продвижение по когортам/сегментам/источникам с числителем и знаменателем (CRM-07).
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

      <FunnelSection />
    </div>
  )
}

/// Продвижение по уникальным возможностям: входы, любые выходы, успешное продвижение,
/// отказ, пауза, открытые — с n/знаменателем и фильтрами из данных (CRM-07, §8.3).
function FunnelSection() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [cohort, setCohort] = useState('')
  const [segment, setSegment] = useState('')
  const [channel, setChannel] = useState('')
  const [offerVersion, setOfferVersion] = useState('')
  const [source, setSource] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const users = useBusinessUsersQuery()
  const funnel = useFunnelReportQuery({
    ...(from !== '' ? { from } : {}),
    ...(to !== '' ? { to } : {}),
    ...(cohort.trim() !== '' ? { cohort: cohort.trim() } : {}),
    ...(segment.trim() !== '' ? { segment: segment.trim() } : {}),
    ...(channel !== '' ? { channel } : {}),
    ...(offerVersion.trim() !== '' ? { offerVersion: offerVersion.trim() } : {}),
    ...(source.trim() !== '' ? { source: source.trim() } : {}),
    ...(ownerId !== '' ? { ownerId } : {}),
  })

  return (
    <section className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        Продвижение и когорты — уникальные возможности
      </h2>
      <div className="grid gap-2 sm:grid-cols-4">
        <Input onChange={(event) => setFrom(event.target.value)} placeholder="с (ГГГГ-ММ-ДД)" type="date" value={from} />
        <Input onChange={(event) => setTo(event.target.value)} placeholder="по (ГГГГ-ММ-ДД)" type="date" value={to} />
        <Input onChange={(event) => setCohort(event.target.value)} placeholder="когорта (версия исследования)" value={cohort} />
        <Input onChange={(event) => setSegment(event.target.value)} placeholder="сегмент" value={segment} />
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          onChange={(event) => setChannel(event.target.value)}
          value={channel}
        >
          <option value="">Канал: любой</option>
          <option value="call">звонок</option>
          <option value="email">письмо</option>
          <option value="telegram">telegram</option>
          <option value="meeting">встреча</option>
        </select>
        <Input onChange={(event) => setOfferVersion(event.target.value)} placeholder="версия оффера (productClaimsVersion)" value={offerVersion} />
        <Input onChange={(event) => setSource(event.target.value)} placeholder="источник" value={source} />
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          onChange={(event) => setOwnerId(event.target.value)}
          value={ownerId}
        >
          <option value="">Ответственный: любой</option>
          {(users.data?.items ?? []).map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName ?? user.email}
            </option>
          ))}
        </select>
      </div>

      {funnel.isPending && <p className="py-4 text-center text-sm text-muted-foreground">Считаем…</p>}
      {funnel.isError && (
        <div className="grid gap-2 py-4 text-center">
          <p className="text-sm text-[#FB7185]">Не удалось построить отчёт продвижения</p>
          <Button className="mx-auto" onClick={() => void funnel.refetch()} variant="outline">
            Повторить
          </Button>
        </div>
      )}

      {funnel.data !== undefined && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Возможностей вошло"
              value={String(funnel.data.opportunities)}
              sub={`период: ${funnel.data.period.from ?? '—'} … ${funnel.data.period.to ?? '—'}`}
            />
            <Tile
              label="Любые выходы"
              value={`${funnel.data.exits.n}/${funnel.data.exits.total}`}
              sub={funnel.data.exits.pct === null ? 'нет данных' : `${funnel.data.exits.pct}% выходов (не «дошли дальше»)`}
            />
            <Tile
              label="Успешное продвижение"
              value={`${funnel.data.advanced.n}/${funnel.data.advanced.total}`}
              sub={funnel.data.advanced.pct === null ? 'нет данных' : `${funnel.data.advanced.pct}% дошли до milestone`}
            />
            <Tile
              label="Отказы"
              value={`${funnel.data.lost.n}/${funnel.data.lost.total}`}
              sub={funnel.data.lost.pct === null ? 'нет данных' : `${funnel.data.lost.pct}% потеряно`}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="secondary">в паузе: {funnel.data.paused.n}</Badge>
            <Badge variant="secondary">открытых сейчас: {funnel.data.openOpportunities}</Badge>
            <Badge variant="outline">
              доставка подтверждена: {funnel.data.delivery.confirmed} · без подтверждения: {funnel.data.delivery.unconfirmed}
            </Badge>
            {funnel.data.legacyEventsExcluded > 0 && (
              <Badge className="border-[#F59E0B]/25 bg-[#F59E0B]/10 text-[#FBBF24]">
                старых событий без точных этапов исключено: {funnel.data.legacyEventsExcluded}
              </Badge>
            )}
          </div>
          {funnel.data.opportunities > 0 && funnel.data.opportunities < 10 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Малая выборка ({funnel.data.opportunities}): сравнение групп предварительное.
            </p>
          )}
          {funnel.data.opportunities === 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Новые сделки (с записанным начальным входом) в периоде не найдены — старая история до
              доработки не дорисовывается.
            </p>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead className="text-left text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                <tr>
                  <th className="px-2 py-2 font-semibold">Этап</th>
                  <th className="px-2 py-2 font-semibold">Вошло</th>
                  <th className="px-2 py-2 font-semibold">Любые выходы</th>
                  <th className="px-2 py-2 font-semibold">Дошли дальше</th>
                  <th className="px-2 py-2 font-semibold">Ушли в отказ</th>
                </tr>
              </thead>
              <tbody>
                {funnel.data.byStage.map((stage) => (
                  <tr className="border-t border-white/5" key={stage.stageId}>
                    <td className="px-2 py-2 font-medium text-white">
                      {stage.title}
                      <span className="ml-1 text-[10px] text-muted-foreground">{stage.semanticType}</span>
                    </td>
                    <td className="px-2 py-2 tabular-nums text-muted-foreground">{stage.entered}</td>
                    <td className="px-2 py-2 tabular-nums text-muted-foreground">{stage.exitedAny}</td>
                    <td className="px-2 py-2 tabular-nums text-[#34D399]">{stage.advancedToNext}</td>
                    <td className="px-2 py-2 tabular-nums text-[#FB7185]">{stage.lostFrom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
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
