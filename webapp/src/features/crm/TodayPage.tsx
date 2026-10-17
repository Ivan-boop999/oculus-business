import { Link } from '@tanstack/react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { useMarkActivityProcessedMutation, useTodayQuery, useUpdateSalesTaskMutation } from './sales-queries'

const ACTION_LABELS: Record<string, string> = {
  call_attempt: 'Попытка звонка',
  conversation: 'Разговор',
  meeting_scheduled: 'Встреча назначена',
  meeting_held: 'Встреча проведена',
  message_sent: 'Сообщение отправлено',
  message_received: 'Ответ клиента',
  other: 'Другое',
}

const CHANNEL_LABELS: Record<string, string> = {
  call: 'звонок',
  email: 'письмо',
  telegram: 'telegram',
  meeting: 'встреча',
  other: 'канал',
}

/// Экран «Сегодня» (экран 2 ТЗ): просроченное, задачи на сегодня, ближайшие встречи,
/// новые ответы, требующие разбора, и активные сделки без следующего шага.
/// У каждого пункта видны цель, адресат и ответственное лицо.
export function TodayPage() {
  const today = useTodayQuery()
  const completeTask = useUpdateSalesTaskMutation()
  const markProcessed = useMarkActivityProcessedMutation()

  if (today.isPending) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Собираем день…</p>
  }
  if (today.isError) {
    return (
      <div className="grid gap-3 py-12 text-center">
        <p className="text-sm text-destructive">Не удалось загрузить экран «Сегодня»</p>
        <Button onClick={() => void today.refetch()} variant="outline">
          Повторить
        </Button>
      </div>
    )
  }

  const data = today.data
  const hasAnything =
    data.overdueTasks.length > 0 ||
    data.todayTasks.length > 0 ||
    data.upcomingMeetings.length > 0 ||
    data.repliesToProcess.length > 0 ||
    data.dealsWithoutNextStep.length > 0

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold tracking-tight text-white lg:text-2xl">Сегодня</h1>

      {!hasAnything && (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-muted-foreground">
          Просрочки и новые ответы не найдены. Хороший день, чтобы искать новые предприятия.
        </p>
      )}

      <Section
        emptyText="Просроченных задач нет"
        title="Просрочено"
        tone="danger"
        count={data.overdueTasks.length}
      >
        {data.overdueTasks.map((task) => (
          <TaskRow
            key={task.id}
            onComplete={() => completeTask.mutate({ id: task.id, input: { status: 'done' } })}
            goal={task.goal}
            action={task.action}
            dueLabel={task.dueAt !== null ? `было до ${new Date(task.dueAt).toLocaleDateString('ru-RU')}` : 'срок не указан'}
            assignee={task.assigneeName}
            company={task.companyName}
            deal={task.dealTitle}
            needsReview={task.needsReview}
          />
        ))}
      </Section>

      <Section title="Задачи на сегодня" count={data.todayTasks.length} emptyText="На сегодня задач нет">
        {data.todayTasks.map((task) => (
          <TaskRow
            key={task.id}
            onComplete={() => completeTask.mutate({ id: task.id, input: { status: 'done' } })}
            goal={task.goal}
            action={task.action}
            dueLabel={task.dueAt !== null ? `сегодня, ${new Date(task.dueAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'сегодня, срок не указан'}
            assignee={task.assigneeName}
            company={task.companyName}
            deal={task.dealTitle}
            needsReview={task.needsReview}
          />
        ))}
      </Section>

      <Section title="Ближайшие встречи" count={data.upcomingMeetings.length} emptyText="Встреч не запланировано">
        {data.upcomingMeetings.map((meeting) => (
          <div className="rounded-xl border border-white/8 bg-[#101724] p-3 text-sm" key={meeting.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-white">
                {ACTION_LABELS[meeting.actionType] ?? meeting.actionType}
                {meeting.companyName !== null ? ` · ${meeting.companyName}` : ''}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {new Date(meeting.occurredAt).toLocaleString('ru-RU', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {CHANNEL_LABELS[meeting.channel] ?? meeting.channel} · {meeting.contactName ?? 'контакт не указан'} ·
              записал: {meeting.authorName ?? '—'}
            </p>
          </div>
        ))}
      </Section>

      <Section
        title="Новые ответы — разобрать"
        tone="accent"
        count={data.repliesToProcess.length}
        emptyText="Новых ответов нет"
      >
        {data.repliesToProcess.map((reply) => (
          <div className="rounded-xl border border-[#6366F1]/25 bg-[#6366F1]/8 p-3 text-sm" key={reply.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-white">
                {ACTION_LABELS[reply.actionType] ?? reply.actionType}
                {reply.companyName !== null ? ` · ${reply.companyName}` : ''}
              </span>
              <Button
                disabled={markProcessed.isPending}
                onClick={() => markProcessed.mutate(reply.id)}
                size="sm"
                variant="outline"
              >
                Разобрано
              </Button>
            </div>
            {reply.note !== null && <p className="mt-1 text-xs text-muted-foreground">{reply.note}</p>}
          </div>
        ))}
      </Section>

      <Section
        title="Активные сделки без следующего шага"
        count={data.dealsWithoutNextStep.length}
        emptyText="У всех активных сделок есть следующий шаг"
      >
        {data.dealsWithoutNextStep.map((deal) => (
          <Link
            className="flex items-center gap-2 rounded-xl border border-white/8 bg-[#101724] px-3 py-2 text-sm hover:border-[#6366F1]/40"
            key={deal.dealId}
            to="/app/crm"
          >
            <span className="min-w-0 flex-1 truncate text-white">{deal.title}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{deal.stageTitle}</span>
            <span className="shrink-0 text-[11px] text-[#A5B4FC]">{deal.ownerName ?? 'ответственный не назначен'}</span>
          </Link>
        ))}
      </Section>
    </div>
  )
}

function Section({
  children,
  count,
  emptyText,
  title,
  tone,
}: {
  children: React.ReactNode
  count: number
  emptyText: string
  title: string
  tone?: 'danger' | 'accent'
}) {
  return (
    <section className="grid gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{title}</h2>
        <Badge
          className={
            tone === 'danger'
              ? 'border-[#F43F5E]/25 bg-[#F43F5E]/10 text-[#FB7185]'
              : tone === 'accent'
                ? 'border-[#6366F1]/25 bg-[#6366F1]/10 text-[#A5B4FC]'
                : 'border-white/10 bg-white/5 text-[#C9D0E2]'
          }
        >
          {count}
        </Badge>
      </div>
      {count === 0 ? <p className="text-xs text-muted-foreground/70">{emptyText}</p> : children}
    </section>
  )
}

function TaskRow({
  action,
  assignee,
  company,
  deal,
  dueLabel,
  goal,
  needsReview,
  onComplete,
}: {
  action: string | null
  assignee: string | null
  company: string | null
  deal: string | null
  dueLabel: string
  goal: string
  needsReview: boolean
  onComplete: () => void
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#101724] p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-white">{action ?? goal}</span>
        <span className="shrink-0 text-[11px] text-[#FB7185] tabular-nums">{dueLabel}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {goal}
        {company !== null ? ` · ${company}` : ''}
        {deal !== null ? ` · ${deal}` : ''} · отвечает: {assignee ?? '—'}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button onClick={onComplete} size="sm" variant="secondary">
          Выполнено
        </Button>
        {needsReview && (
          <Badge className="border-[#F59E0B]/25 bg-[#F59E0B]/10 text-[#FBBF24]">пересмотреть после ответа</Badge>
        )}
      </div>
    </div>
  )
}
