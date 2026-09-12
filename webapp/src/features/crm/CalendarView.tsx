import { useState } from 'react'

import type { Deal } from '@oculus-business/contracts'

import { dateLabel, formatMoneyShort, todayDateOnly } from '@/platform/format'

import type { StageWithDeals } from './CrmBoardPage'

/// Календарь действий: месяц сеткой, точки по дням со «следующими действиями»,
/// клик по дню — список сделок. Данные — текущая доска CRM.
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export function CalendarView({
  onOpenDeal,
  stages,
}: {
  onOpenDeal: (deal: Deal) => void
  stages: StageWithDeals[]
}) {
  const today = todayDateOnly()
  const [monthOffset, setMonthOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const base = new Date()
  const viewDate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthOffset, 1))
  const year = viewDate.getUTCFullYear()
  const month = viewDate.getUTCMonth()
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7 // Пн=0

  const actionsByDay = new Map<string, Array<{ deal: Deal; stage: StageWithDeals }>>()
  for (const stage of stages) {
    if (stage.isLost) continue
    for (const deal of stage.deals) {
      if (!deal.nextActionAt) continue
      const list = actionsByDay.get(deal.nextActionAt) ?? []
      list.push({ deal, stage })
      actionsByDay.set(deal.nextActionAt, list)
    }
  }

  const days: Array<{ key: string; day: number } | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => ({
      key: `${monthKey}-${String(index + 1).padStart(2, '0')}`,
      day: index + 1,
    })),
  ]

  const monthActions = [...actionsByDay.entries()]
    .filter(([day]) => day.startsWith(monthKey))
    .flatMap(([, list]) => list)

  const selectedActions = selectedDay ? (actionsByDay.get(selectedDay) ?? []) : []

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <button
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-sm text-muted-foreground hover:text-white"
          onClick={() => setMonthOffset((value) => value - 1)}
        >
          ←
        </button>
        <h2 className="text-sm font-semibold text-white capitalize">
          {new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(viewDate)}
        </h2>
        <button
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-sm text-muted-foreground hover:text-white"
          onClick={() => setMonthOffset((value) => value + 1)}
        >
          →
        </button>
        {monthOffset !== 0 && (
          <button
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground hover:text-white"
            onClick={() => setMonthOffset(0)}
          >
            сегодня
          </button>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          действий в месяце: {monthActions.length}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((weekday) => (
          <p className="pb-1 text-center text-[10px] font-semibold tracking-wide text-muted-foreground uppercase" key={weekday}>
            {weekday}
          </p>
        ))}
        {days.map((day, index) => {
          if (day === null) return <div key={`empty-${index}`} />
          const actions = actionsByDay.get(day.key) ?? []
          const isToday = day.key === today
          const isPast = day.key < today
          const isSelected = day.key === selectedDay
          return (
            <button
              className={`flex min-h-16 flex-col items-center gap-1 rounded-xl border p-1.5 transition-colors ${
                isSelected
                  ? 'border-[#818CF8] bg-[rgba(99,102,241,0.12)]'
                  : actions.length > 0
                    ? 'border-white/10 bg-white/[0.04] hover:border-[#6366F1]/40'
                    : 'border-white/6 hover:border-white/15'
              }`}
              key={day.key}
              onClick={() => setSelectedDay(isSelected ? null : day.key)}
            >
              <span
                className={`text-xs tabular-nums ${
                  isToday
                    ? 'grid size-5 place-items-center rounded-full bg-gradient-to-br from-[#7B5CFA] to-[#4338CA] font-bold text-white'
                    : isPast
                      ? 'text-muted-foreground/50'
                      : 'text-white'
                }`}
              >
                {day.day}
              </span>
              {actions.length > 0 && (
                <span className="flex flex-wrap justify-center gap-0.5">
                  {actions.slice(0, 4).map(({ deal }) => (
                    <span
                      className={`size-1.5 rounded-full ${
                        day.key < today ? 'bg-[#F43F5E]' : 'bg-[#6366F1] shadow-[0_0_6px_rgba(99,102,241,0.8)]'
                      }`}
                      key={deal.id}
                    />
                  ))}
                  {actions.length > 4 && (
                    <span className="text-[9px] leading-none text-muted-foreground">+{actions.length - 4}</span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selectedDay !== null && (
        <div className="grid gap-2">
          <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            {dateLabel(selectedDay)} — действий: {selectedActions.length}
          </p>
          {selectedActions.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-muted-foreground">
              На этот день действий нет
            </p>
          )}
          {selectedActions.map(({ deal, stage }) => (
            <button
              className="flex items-center gap-3 rounded-xl border border-white/6 bg-[#101724] px-3 py-2.5 text-left transition-all hover:border-[#6366F1]/35"
              key={deal.id}
              onClick={() => onOpenDeal(deal)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{deal.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {stage.title}
                  {deal.nextAction ? ` · ${deal.nextAction}` : ''}
                  {deal.monthlyAmount > 0 ? ` · ${formatMoneyShort(deal.monthlyAmount)}/мес` : ''}
                </span>
              </span>
              <span className="shrink-0 text-xs text-[#A5B4FC]">открыть →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
