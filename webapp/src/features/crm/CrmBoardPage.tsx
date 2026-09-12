import { useState, type DragEvent } from 'react'
import { Link } from '@tanstack/react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CrmStage, Deal } from '@oculus-business/contracts'

export type StageWithDeals = CrmStage & { deals: Deal[] }
import { dateLabel, formatMoneyShort, todayDateOnly } from '@/platform/format'

import { useAuth } from '@/features/auth'

import {
  useCrmBoardQuery,
  useCreateStageMutation,
  useDeleteStageMutation,
  useMoveDealMutation,
  useUpdateStageMutation,
} from './queries'
import { CalendarView } from './CalendarView'
import { DealSheet } from './DealSheet'

/// Канбан-доска сделок: горизонтальный скролл этапов, карточки-сделки,
/// перетаскивание на десктопе и перемещение через карточку на телефоне.
export function CrmBoardPage() {
  const board = useCrmBoardQuery()
  const moveDeal = useMoveDealMutation()
  const createStage = useCreateStageMutation()
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [createStageId, setCreateStageId] = useState<string | null>(null)
  const [openMenuStageId, setOpenMenuStageId] = useState<string | null>(null)
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null)
  const [mineOnly, setMineOnly] = useState(false)
  const [lostPromptStageId, setLostPromptStageId] = useState<string | null>(null)
  const [calendarMode, setCalendarMode] = useState(false)
  const { user } = useAuth()

  if (board.isPending) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Загружаем доску…</p>
  }
  if (board.isError) {
    return (
      <div className="grid gap-3 py-12 text-center">
        <p className="text-sm text-destructive">Не удалось загрузить доску сделок</p>
        <Button onClick={() => void board.refetch()} variant="outline">
          Повторить
        </Button>
      </div>
    )
  }

  const allStages = board.data.stages
  const stages = mineOnly
    ? allStages.map((stage) => ({
        ...stage,
        deals: stage.deals.filter((deal) => deal.createdById === user?.id),
      }))
    : allStages

  const onDropIntoStage = (stage: StageWithDeals, event: DragEvent) => {
    event.preventDefault()
    setDragOverStageId(null)
    const dealId = event.dataTransfer.getData('text/plain')
    if (!dealId) return
    if (stage.deals.some((deal) => deal.id === dealId)) return
    if (stage.isLost) {
      // Отказ требует причину: открываем карточку с вопросом, без переноса.
      const deal = allStages.flatMap((item) => item.deals).find((item) => item.id === dealId)
      if (deal && !deal.lostReason) {
        setSelectedDeal(deal)
        setLostPromptStageId(stage.id)
        return
      }
    }
    moveDeal.mutate({ id: dealId, stageId: stage.id, position: stage.deals.length })
  }

  return (
    <div className="grid gap-3">
      <BoardHeader
        calendarMode={calendarMode}
        mineOnly={mineOnly}
        onToggleCalendar={() => setCalendarMode((value) => !value)}
        onToggleMine={() => setMineOnly((value) => !value)}
        stages={stages}
      />
      {calendarMode && <CalendarView onOpenDeal={setSelectedDeal} stages={allStages} />}
      {!calendarMode && (
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:gap-4 lg:px-0">
        {stages.map((stage) => (
          <section
            className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-gradient-to-b from-white/[0.04] to-white/[0.01] transition-colors lg:w-80 ${
              dragOverStageId === stage.id
                ? 'border-[#818CF8] shadow-[0_0_32px_-6px_rgba(99,102,241,0.5)]'
                : 'border-white/6'
            }`}
            key={stage.id}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOverStageId(stage.id)
            }}
            onDragLeave={() => setDragOverStageId(null)}
            onDrop={(event) => onDropIntoStage(stage, event)}
          >
            <header className="flex items-center justify-between gap-2 px-3 pt-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    stage.isWon
                      ? 'bg-[#34D399] shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                      : stage.isLost
                        ? 'bg-[#F43F5E]/70'
                        : 'bg-[#6366F1] shadow-[0_0_8px_rgba(99,102,241,0.8)]'
                  }`}
                />
                <h2 className="truncate text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{stage.title}</h2>
                {stage.isWon && <Badge className="border-[#34D399]/25 bg-[#34D399]/10 text-[#34D399]">выиграна</Badge>}
                {stage.isLost && <Badge className="border-[#F43F5E]/25 bg-[#F43F5E]/10 text-[#FB7185]">отказ</Badge>}
              </div>
              <div className="flex items-center gap-1">
                <Badge className="min-w-6 justify-center border-white/10 bg-white/5 text-[11px] text-[#C9D0E2] tabular-nums">{stage.deals.length}</Badge>
                <button
                  aria-label={`Меню этапа ${stage.title}`}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() =>
                    setOpenMenuStageId(openMenuStageId === stage.id ? null : stage.id)
                  }
                >
                  ⋯
                </button>
              </div>
            </header>

            {openMenuStageId === stage.id && (
              <StageMenu stage={stage} onDone={() => setOpenMenuStageId(null)} />
            )}

            <div className="flex flex-1 flex-col gap-2 p-2">
              {stage.deals.map((deal) => (
                <article
                  className="cursor-pointer rounded-xl border border-white/8 bg-[#101724] p-3 transition-all duration-150 hover:-translate-y-0.5 hover:border-[#6366F1]/40 hover:shadow-[0_8px_28px_-12px_rgba(99,102,241,0.45)] active:scale-[0.99]"
                  draggable
                  key={deal.id}
                  onClick={() => setSelectedDeal(deal)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', deal.id)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm leading-snug font-medium">{deal.title}</h3>
                  </div>
                  {(deal.monthlyAmount > 0 || deal.oneTimeAmount > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {deal.monthlyAmount > 0 && (
                        <Badge className="border-[#34D399]/25 bg-[#34D399]/10 text-[#34D399]">
                          {formatMoneyShort(deal.monthlyAmount)}/мес
                        </Badge>
                      )}
                      {deal.oneTimeAmount > 0 && (
                        <Badge className="border-white/10 bg-white/5 text-[#C9D0E2]">
                          {formatMoneyShort(deal.oneTimeAmount)} разово
                        </Badge>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {deal.contactName && <span>{deal.contactName}</span>}
                    {deal.source && <span>· {deal.source}</span>}
                    {deal.commentsCount > 0 && <span>· 💬 {deal.commentsCount}</span>}
                    {deal.lastStageChangeAt && (
                      <span className="tabular-nums">
                        · {daysSince(deal.lastStageChangeAt)} дн. в этапе
                      </span>
                    )}
                  </div>
                  {deal.nextActionAt && (
                    <div
                      className={`mt-2 rounded-lg border px-2 py-1 text-xs ${
                        deal.nextActionAt < todayDateOnly()
                          ? 'border-[#F43F5E]/30 bg-[#F43F5E]/10 text-[#FB7185]'
                          : 'border-[#6366F1]/25 bg-[#6366F1]/10 text-[#A5B4FC]'
                      }`}
                    >
                      ⏭ {dateLabel(deal.nextActionAt)}
                      {deal.nextAction ? ` — ${deal.nextAction}` : ''}
                    </div>
                  )}
                </article>
              ))}
              {stage.deals.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/8 px-3 py-3 text-center text-[11px] text-muted-foreground/70">
                  Пусто — добавьте первую сделку
                </p>
              )}
              <Button
                onClick={() => setCreateStageId(stage.id)}
                size="sm"
                variant="ghost"
              >
                + Сделка
              </Button>
            </div>
          </section>
        ))}

        <div className="w-40 shrink-0 pt-3">
          <Button
            onClick={() => {
              const title = window.prompt('Название нового этапа')
              if (title && title.trim()) {
                createStage.mutate({ title: title.trim(), isWon: false, isLost: false })
              }
            }}
            variant="outline"
          >
            + Этап
          </Button>
        </div>
      </div>
      )}

      <p className="text-xs text-muted-foreground lg:hidden">
        На телефоне откройте карточку и нажмите «Переместить». С компьютера карточку можно
        перетащить мышью.
      </p>

      <DealSheet
        deal={selectedDeal}
        lostPromptStageId={lostPromptStageId}
        onCreateStageId={createStageId}
        onClose={() => {
          setSelectedDeal(null)
          setCreateStageId(null)
          setLostPromptStageId(null)
        }}
        open={selectedDeal !== null || createStageId !== null}
        stages={stages}
      />
    </div>
  )
}

function BoardHeader({
  calendarMode,
  mineOnly,
  onToggleCalendar,
  onToggleMine,
  stages,
}: {
  calendarMode: boolean
  mineOnly: boolean
  onToggleCalendar: () => void
  onToggleMine: () => void
  stages: StageWithDeals[]
}) {
  const active = stages.filter((stage) => !stage.isWon && !stage.isLost)
  const activeCount = active.reduce((sum, stage) => sum + stage.deals.length, 0)
  const pipelineMonthly = active.reduce(
    (sum, stage) => sum + stage.deals.reduce((s, deal) => s + deal.monthlyAmount, 0),
    0,
  )
  const mrr = stages
    .filter((stage) => stage.isWon)
    .reduce((sum, stage) => sum + stage.deals.reduce((s, deal) => s + deal.monthlyAmount, 0), 0)

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <h1 className="mr-auto text-xl font-semibold tracking-tight text-white lg:text-2xl">Сделки</h1>
      <button
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
          mineOnly
            ? 'border-[#6366F1]/40 bg-[#6366F1]/15 text-[#A5B4FC]'
            : 'border-white/10 bg-white/5 text-muted-foreground hover:text-white'
        }`}
        onClick={onToggleMine}
      >
        {mineOnly ? 'Мои сделки' : 'Все / Мои'}
      </button>
      <Link
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-[#6366F1]/35 hover:text-white"
        to="/app/crm/report"
      >
        Отчёт
      </Link>
      <button
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-[#6366F1]/35 hover:text-white"
        onClick={() => {
          const rows = [['Сделка', 'Контрагент', 'Этап', 'Подписка ₽/мес', 'Разовая ₽', 'Следующее действие', 'Когда', 'Причина отказа', 'Ответственный']]
          for (const stage of stages) {
            for (const deal of stage.deals) {
              rows.push([
                deal.title,
                deal.companyName ?? '',
                stage.title,
                String(deal.monthlyAmount),
                String(deal.oneTimeAmount),
                deal.nextAction ?? '',
                deal.nextActionAt ?? '',
                deal.lostReason ?? '',
                deal.createdByName ?? '',
              ])
            }
          }
          const csv = '\uFEFF' + rows.map((row) => row.map((cell) => cell.replace(/;/g, ',')).join(';')).join('\r\n')
          const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
          const link = document.createElement('a')
          link.href = url
          link.download = 'oculus-business-deals.csv'
          link.click()
          URL.revokeObjectURL(url)
        }}
        title="Скачать все сделки в CSV"
      >
        CSV
      </button>
      <button
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
          calendarMode
            ? 'border-[#6366F1]/40 bg-[#6366F1]/15 text-[#A5B4FC]'
            : 'border-white/10 bg-white/5 text-muted-foreground hover:text-white'
        }`}
        onClick={onToggleCalendar}
      >
        Календарь
      </button>
      <Badge variant="secondary" className="border-white/10 bg-white/5 text-[#C9D0E2]">в работе: {activeCount}</Badge>
      <Badge variant="secondary" className="border-white/10 bg-white/5 text-[#C9D0E2]">пайплайн: {formatMoneyShort(pipelineMonthly)}/мес</Badge>
      <Badge
        className={
          mrr > 0
            ? 'border-[#34D399]/25 bg-[#34D399]/10 text-[#34D399]'
            : 'border-white/10 bg-white/5 text-muted-foreground'
        }
      >
        MRR: {formatMoneyShort(mrr)}/мес
      </Badge>
    </div>
  )
}

function StageMenu({ stage, onDone }: { stage: StageWithDeals; onDone: () => void }) {
  const updateStage = useUpdateStageMutation()
  const deleteStage = useDeleteStageMutation()

  return (
    <div className="mx-3 mt-2 grid gap-1 rounded-lg border bg-background p-2 text-sm">
      <button
        className="rounded-md px-2 py-1.5 text-left hover:bg-muted"
        onClick={() => {
          const title = window.prompt('Новое название этапа', stage.title)
          if (title && title.trim()) {
            updateStage.mutate({ id: stage.id, input: { title: title.trim() } })
          }
          onDone()
        }}
      >
        Переименовать
      </button>
      <button
        className="rounded-md px-2 py-1.5 text-left hover:bg-muted"
        onClick={() => {
          updateStage.mutate({ id: stage.id, input: { isWon: !stage.isWon, isLost: false } })
          onDone()
        }}
      >
        {stage.isWon ? 'Снять «выиграна»' : 'Считать победой (MRR)'}
      </button>
      <button
        className="rounded-md px-2 py-1.5 text-left hover:bg-muted"
        onClick={() => {
          updateStage.mutate({ id: stage.id, input: { isLost: !stage.isLost, isWon: false } })
          onDone()
        }}
      >
        {stage.isLost ? 'Снять «отказ»' : 'Считать отказом'}
      </button>
      <button
        className="rounded-md px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
        onClick={() => {
          if (window.confirm(`Удалить этап «${stage.title}»?`)) {
            deleteStage.mutate(stage.id)
          }
          onDone()
        }}
      >
        Удалить этап
      </button>
    </div>
  )
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}
