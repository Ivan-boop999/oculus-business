import { useEffect, useState, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import type { Activity, Company, SalesTask } from '@oculus-business/contracts'
import { formatMoneyShort } from '@/platform/format'
import { useIsDesktop } from '@/platform/use-is-desktop'

import {
  useActivitiesQuery,
  useCompanyDncMutation,
  useCompanyEventsQuery,
  useContactsQuery,
  useCreateContactMutation,
  useSalesTasksQuery,
  useUpdateCompanyMutation,
} from './sales-queries'
import { useCrmBoardQuery } from './queries'

const RESEARCH_STATUS_LABELS: Record<string, string> = {
  selected: 'отобрана',
  reaching: 'выходим на контакт',
  dialogue: 'диалог',
  nurture: 'бережное ведение',
  disqualified: 'дисквалифицирована',
}

const RELATION_LABELS: Record<string, string> = {
  prospect: 'перспективная',
  customer: 'клиент',
  partner: 'партнёр',
  excluded: 'исключена',
}

const CHANNEL_KIND_LABELS: Record<string, string> = {
  email: 'email',
  phone: 'телефон',
  telegram: 'telegram',
  other: 'другое',
}

const STATUS_BADGES: Record<string, string> = {
  published: 'border-white/10 bg-white/5 text-[#C9D0E2]',
  confirmed: 'border-[#34D399]/25 bg-[#34D399]/10 text-[#34D399]',
  guess: 'border-[#F59E0B]/25 bg-[#F59E0B]/10 text-[#FBBF24]',
  invalid: 'border-[#F43F5E]/25 bg-[#F43F5E]/10 text-[#FB7185]',
}

/// Карточка компании (экран 1 ТЗ): профиль исследования, контакты с каналами,
/// взаимодействия, задачи, сделки и журнал решений (включая запреты контакта).
export function CompanySheet({
  company,
  onClose,
  open,
}: {
  company: Company | null
  onClose: () => void
  open: boolean
}) {
  const isDesktop = useIsDesktop()
  const contacts = useContactsQuery(open ? company?.id ?? null : null)
  const activities = useActivitiesQuery({ companyId: company?.id, limit: 30 }, open && company !== null)
  const tasks = useSalesTasksQuery({ companyId: company?.id, status: 'open', limit: 20 }, open && company !== null)
  const events = useCompanyEventsQuery(open ? company?.id ?? null : null)
  const board = useCrmBoardQuery()
  const update = useUpdateCompanyMutation()
  const dnc = useCompanyDncMutation()
  const createContact = useCreateContactMutation()
  const [editOpen, setEditOpen] = useState(false)
  const [dncOpen, setDncOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setEditOpen(false)
      setDncOpen(false)
      setContactOpen(false)
      setError(null)
    }
  }, [open, company])

  if (company === null) return null
  const deals = (board.data?.stages ?? []).flatMap((stage) =>
    stage.deals.filter((deal) => deal.companyId === company.id).map((deal) => ({ deal, stage })),
  )

  return (
    <Sheet onOpenChange={(next) => (!next ? onClose() : undefined)} open={open}>
      <SheetContent
        className={isDesktop ? 'inset-y-0 right-0 h-full w-full gap-0 overflow-y-auto sm:max-w-2xl' : 'mx-auto max-h-[92svh] max-w-3xl overflow-y-auto rounded-t-2xl'}
        side={isDesktop ? 'right' : 'bottom'}
      >
        <SheetHeader className="pb-0">
          <SheetTitle>{company.name}</SheetTitle>
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary">{RESEARCH_STATUS_LABELS[company.researchStatus] ?? company.researchStatus}</Badge>
            <Badge variant="outline">{RELATION_LABELS[company.relationStatus] ?? company.relationStatus}</Badge>
            {company.doNotContact && (
              <Badge className="border-[#F43F5E]/25 bg-[#F43F5E]/10 text-[#FB7185]">
                запрет контакта ({company.dncScope === 'all' ? 'все касания' : 'коммерческие'})
              </Badge>
            )}
            {company.activeMrr > 0 && (
              <Badge className="border-[#34D399]/25 bg-[#34D399]/10 text-[#34D399]">
                MRR {formatMoneyShort(company.activeMrr)}/мес
              </Badge>
            )}
          </div>
        </SheetHeader>

        <div className="grid gap-4 px-4 pb-6">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setEditOpen((value) => !value)} size="sm" variant="outline">
              {editOpen ? 'Закрыть правку' : 'Править профиль'}
            </Button>
            <Button onClick={() => setDncOpen((value) => !value)} size="sm" variant="outline">
              {company.doNotContact ? 'Снять запрет' : 'Запретить контакт'}
            </Button>
            <Button onClick={() => setContactOpen((value) => !value)} size="sm" variant="outline">
              + Контакт
            </Button>
          </div>

          {editOpen && (
            <CompanyEditForm
              company={company}
              error={error}
              onCancel={() => setEditOpen(false)}
              onSaved={() => setEditOpen(false)}
              onSave={(input) =>
                update.mutate({ id: company.id, input }, { onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка') })
              }
              pending={update.isPending}
            />
          )}

          {dncOpen && (
            <DncForm
              active={company.doNotContact}
              pending={dnc.isPending}
              onCancel={() => setDncOpen(false)}
              onSubmit={({ reason, scope }) =>
                dnc.mutate(
                  { id: company.id, input: { reason, scope }, lift: company.doNotContact },
                  {
                    onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка'),
                    onSuccess: () => setDncOpen(false),
                  },
                )
              }
            />
          )}

          {contactOpen && (
            <ContactCreateForm
              companyId={company.id}
              pending={createContact.isPending}
              onCancel={() => setContactOpen(false)}
              onSubmit={(input) =>
                createContact.mutate(input, {
                  onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка'),
                  onSuccess: () => setContactOpen(false),
                })
              }
            />
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <InfoGrid company={company} />

          <Block title={`Контакты (${contacts.data?.items.length ?? 0})`}>
            {(contacts.data?.items ?? []).map((contact) => (
              <div className="rounded-xl border border-white/8 bg-[#101724] p-3 text-sm" key={contact.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{contact.name ?? 'Имя неизвестно'}</span>
                  {contact.position !== null && (
                    <span className="text-xs text-muted-foreground">{contact.position}</span>
                  )}
                  <Badge className={STATUS_BADGES[contact.status] ?? STATUS_BADGES.published}>{contact.status}</Badge>
                  {contact.isLegacy && <Badge variant="outline">legacy</Badge>}
                  {contact.doNotContact && (
                    <Badge className="border-[#F43F5E]/25 bg-[#F43F5E]/10 text-[#FB7185]">запрет</Badge>
                  )}
                  {contact.directRoleConfirmed && (
                    <Badge className="border-[#34D399]/25 bg-[#34D399]/10 text-[#34D399]">роль подтверждена</Badge>
                  )}
                </div>
                <div className="mt-2 grid gap-1">
                  {contact.channels.map((channel) => (
                    <div className="flex flex-wrap items-center gap-2 text-xs" key={channel.id}>
                      <span className="text-muted-foreground">{CHANNEL_KIND_LABELS[channel.kind]}:</span>
                      <span className="text-white">{channel.value}</span>
                      <Badge className={STATUS_BADGES[channel.status] ?? STATUS_BADGES.published}>
                        {channel.status}
                      </Badge>
                      <span className={channel.isDirect ? 'text-[#A5B4FC]' : 'text-muted-foreground'}>
                        {channel.isDirect ? 'прямой канал' : 'общий канал'}
                      </span>
                    </div>
                  ))}
                  {contact.channels.length === 0 && (
                    <p className="text-xs text-muted-foreground/70">Каналы не добавлены</p>
                  )}
                </div>
              </div>
            ))}
            {(contacts.data?.items.length ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground/70">Контактов пока нет</p>
            )}
          </Block>

          <Block title={`Открытые задачи (${tasks.data?.items.length ?? 0})`}>
            {(tasks.data?.items ?? []).map((task) => (
              <TaskLine key={task.id} task={task} />
            ))}
            {(tasks.data?.items.length ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground/70">Открытых задач нет</p>
            )}
          </Block>

          <Block title={`Взаимодействия (${activities.data?.items.length ?? 0})`}>
            {(activities.data?.items ?? []).map((activity) => (
              <ActivityLine activity={activity} key={activity.id} />
            ))}
            {(activities.data?.items.length ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground/70">Взаимодействий пока нет</p>
            )}
          </Block>

          <Block title={`Сделки (${deals.length})`}>
            {deals.map(({ deal, stage }) => (
              <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-[#101724] px-3 py-2 text-sm" key={deal.id}>
                <span className="min-w-0 flex-1 truncate text-white">{deal.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{stage.title}</span>
                {deal.monthlyAmount > 0 && (
                  <span className="shrink-0 text-[11px] text-[#34D399] tabular-nums">
                    {formatMoneyShort(deal.monthlyAmount)}/мес
                  </span>
                )}
              </div>
            ))}
            {deals.length === 0 && <p className="text-xs text-muted-foreground/70">Сделок нет — компания до сделки</p>}
          </Block>

          <Block title="Журнал решений">
            {(events.data?.items ?? []).map((event) => (
              <p className="text-[11px] text-muted-foreground" key={event.id}>
                <span className="tabular-nums">
                  {new Date(event.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>{' '}
                — {event.kind === 'dnc_set' ? 'запрет контакта' : event.kind === 'dnc_lifted' ? 'запрет снят' : event.kind}:{' '}
                {event.reason ?? '—'} ({event.authorName ?? '—'})
              </p>
            ))}
            {(events.data?.items.length ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground/70">Решений по компании не зафиксировано</p>
            )}
          </Block>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function InfoGrid({ company }: { company: Company }) {
  const rows: Array<[string, ReactNode]> = [
    ['Сайт', company.website ?? '—'],
    ['Домен', company.domain ?? '—'],
    ['ИНН', company.inn ?? 'не проверен'],
    ['Регион', company.region ?? '—'],
    ['Сегмент', company.segment ?? '—'],
    ['Процесс', company.processDescription ?? '—'],
    ['Источник поиска', company.researchSource ?? '—'],
    ['Источник контакта', company.contactSource ?? '—'],
    [
      'Дата исследования',
      company.researchedAt !== null
        ? new Date(company.researchedAt).toLocaleDateString('ru-RU')
        : '—',
    ],
    ['Причина выбора', company.selectionReason ?? '—'],
    ['Ответственный', company.ownerName ?? 'не назначен'],
    ['Когорта', company.cohortVersion ?? '—'],
  ]
  return (
    <div className="grid gap-x-4 gap-y-1.5 rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-3 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div className="grid gap-0.5" key={label}>
          <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</span>
          <span className="text-white/90">{value}</span>
        </div>
      ))}
    </div>
  )
}

function CompanyEditForm({
  company,
  error,
  onCancel,
  onSave,
  onSaved,
  pending,
}: {
  company: Company
  error: string | null
  onCancel: () => void
  onSave: (input: Record<string, unknown>) => void
  onSaved: () => void
  pending: boolean
}) {
  const [form, setForm] = useState({
    website: company.website ?? '',
    inn: company.inn ?? '',
    region: company.region ?? '',
    segment: company.segment ?? '',
    processDescription: company.processDescription ?? '',
    researchSource: company.researchSource ?? '',
    selectionReason: company.selectionReason ?? '',
    researchStatus: company.researchStatus,
    relationStatus: company.relationStatus,
    note: company.note ?? '',
  })
  void error
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }))
  return (
    <div className="grid gap-2 rounded-2xl border border-[#6366F1]/25 bg-[#6366F1]/8 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Сайт">
          <Input onChange={(event) => set({ website: event.target.value })} placeholder="https://…" value={form.website} />
        </Field>
        <Field label="ИНН (проверенный)">
          <Input onChange={(event) => set({ inn: event.target.value })} placeholder="…" value={form.inn} />
        </Field>
        <Field label="Регион / площадка">
          <Input onChange={(event) => set({ region: event.target.value })} placeholder="…" value={form.region} />
        </Field>
        <Field label="Сегмент">
          <Input onChange={(event) => set({ segment: event.target.value })} placeholder="…" value={form.segment} />
        </Field>
        <Field label="Статус исследования">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            onChange={(event) => set({ researchStatus: event.target.value })}
            value={form.researchStatus}
          >
            {Object.entries(RESEARCH_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Отношение">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            onChange={(event) => set({ relationStatus: event.target.value })}
            value={form.relationStatus}
          >
            {Object.entries(RELATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Описание процесса">
        <Textarea onChange={(event) => set({ processDescription: event.target.value })} rows={2} value={form.processDescription} />
      </Field>
      <Field label="Источник нахождения">
        <Input onChange={(event) => set({ researchSource: event.target.value })} placeholder="Где нашли компанию" value={form.researchSource} />
      </Field>
      <Field label="Причина выбора">
        <Textarea onChange={(event) => set({ selectionReason: event.target.value })} rows={2} value={form.selectionReason} />
      </Field>
      <div className="flex gap-2">
        <Button
          disabled={pending}
          onClick={() => {
            onSave({
              website: form.website.trim() || null,
              inn: form.inn.trim() || null,
              region: form.region.trim() || null,
              segment: form.segment.trim() || null,
              processDescription: form.processDescription.trim() || null,
              researchSource: form.researchSource.trim() || null,
              selectionReason: form.selectionReason.trim() || null,
              researchStatus: form.researchStatus as 'selected' | 'reaching' | 'dialogue' | 'nurture' | 'disqualified',
              relationStatus: form.relationStatus as 'prospect' | 'customer' | 'partner' | 'excluded',
            })
            onSaved()
          }}
          size="sm"
        >
          Сохранить
        </Button>
        <Button onClick={onCancel} size="sm" variant="outline">
          Отмена
        </Button>
      </div>
    </div>
  )
}

function DncForm({
  active,
  onCancel,
  onSubmit,
  pending,
}: {
  active: boolean
  onCancel: () => void
  onSubmit: (input: { reason: string; scope: 'all' | 'commercial' }) => void
  pending: boolean
}) {
  const [reason, setReason] = useState('')
  const [scope, setScope] = useState<'all' | 'commercial'>('all')
  return (
    <div className="grid gap-2 rounded-2xl border border-[#F43F5E]/30 bg-[#F43F5E]/8 p-3">
      <p className="text-xs font-medium text-[#FB7185]">
        {active
          ? 'Снятие запрета требует явного нового основания — оно попадёт в журнал с вашим именем'
          : 'Запрет остановит коммерческие касания по всей компании (обход через другого сотрудника исключён)'}
      </p>
      <Textarea
        onChange={(event) => setReason(event.target.value)}
        placeholder={active ? 'Новое основание возобновления контакта' : 'Основание запрета (отказ, просьба…)'}
        rows={2}
        value={reason}
      />
      {!active && (
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          onChange={(event) => setScope(event.target.value as 'all' | 'commercial')}
          value={scope}
        >
          <option value="all">Все касания</option>
          <option value="commercial">Только коммерческие (техническая переписка по договору не блокируется)</option>
        </select>
      )}
      <div className="flex gap-2">
        <Button
          disabled={reason.trim().length < 3 || pending}
          onClick={() => onSubmit({ reason: reason.trim(), scope })}
          size="sm"
          variant="destructive"
        >
          {active ? 'Снять запрет' : 'Запретить'}
        </Button>
        <Button onClick={onCancel} size="sm" variant="outline">
          Отмена
        </Button>
      </div>
    </div>
  )
}

function ContactCreateForm({
  companyId,
  onCancel,
  onSubmit,
  pending,
}: {
  companyId: string
  onCancel: () => void
  onSubmit: (input: {
    companyId: string
    name: string | null
    position: string | null
    channels: Array<{ kind: 'email' | 'phone' | 'telegram'; value: string; isDirect: boolean }>
  }) => void
  pending: boolean
}) {
  const [form, setForm] = useState({ name: '', position: '', email: '', phone: '', telegram: '', emailDirect: false, phoneDirect: false })
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }))
  const channels = [
    form.email.trim() !== '' && { kind: 'email' as const, value: form.email.trim(), isDirect: form.emailDirect },
    form.phone.trim() !== '' && { kind: 'phone' as const, value: form.phone.trim(), isDirect: form.phoneDirect },
    form.telegram.trim() !== '' && { kind: 'telegram' as const, value: form.telegram.trim(), isDirect: false },
  ].filter((channel): channel is { kind: 'email' | 'phone' | 'telegram'; value: string; isDirect: boolean } => channel !== false)
  return (
    <div className="grid gap-2 rounded-2xl border border-[#6366F1]/25 bg-[#6366F1]/8 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Имя (если известно)">
          <Input onChange={(event) => set({ name: event.target.value })} placeholder="Иван Петров" value={form.name} />
        </Field>
        <Field label="Должность">
          <Input onChange={(event) => set({ position: event.target.value })} placeholder="Начальник производства" value={form.position} />
        </Field>
        <Field label="Email">
          <Input onChange={(event) => set({ email: event.target.value })} placeholder="info@company.ru" value={form.email} />
        </Field>
        <Field label="Телефон">
          <Input onChange={(event) => set({ phone: event.target.value })} placeholder="+7 …" value={form.phone} />
        </Field>
        <Field label="Telegram">
          <Input onChange={(event) => set({ telegram: event.target.value })} placeholder="@username" value={form.telegram} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input checked={form.emailDirect} onChange={(event) => set({ emailDirect: event.target.checked })} type="checkbox" />
        Email — личный прямой канал руководителя (не общий info@)
      </label>
      <div className="flex gap-2">
        <Button
          disabled={pending || (form.name.trim() === '' && channels.length === 0)}
          onClick={() =>
            onSubmit({
              companyId,
              name: form.name.trim() || null,
              position: form.position.trim() || null,
              channels,
            })
          }
          size="sm"
        >
          Добавить контакт
        </Button>
        <Button onClick={onCancel} size="sm" variant="outline">
          Отмена
        </Button>
      </div>
    </div>
  )
}

function Block({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="grid gap-2 border-t pt-3">
      <h3 className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{title}</h3>
      <div className="grid gap-1.5">{children}</div>
    </div>
  )
}

function TaskLine({ task }: { task: SalesTask }) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#101724] px-3 py-2 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-white">{task.action ?? task.goal}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {task.dueAt !== null ? new Date(task.dueAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'срок не указан'}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {task.goal} · отвечает: {task.assigneeName ?? '—'}
        {task.commitmentType === 'client_commitment' ? ' · обязательство клиента' : ''}
        {task.needsReview ? ' · ⚠ пересмотреть' : ''}
      </p>
    </div>
  )
}

function ActivityLine({ activity }: { activity: Activity }) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#101724] px-3 py-2 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-white">
          {activity.actionType === 'call_attempt'
            ? 'Попытка звонка'
            : activity.actionType === 'conversation'
              ? 'Состоявшийся разговор'
              : activity.actionType === 'meeting_scheduled'
                ? 'Встреча назначена'
                : activity.actionType === 'meeting_held'
                  ? 'Встреча проведена'
                  : activity.actionType === 'message_received'
                    ? 'Ответ клиента'
                    : 'Сообщение отправлено'}
          {activity.contactName !== null ? ` · ${activity.contactName}` : ''}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {new Date(activity.occurredAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {activity.result !== null && <p className="mt-0.5 text-xs text-muted-foreground">Результат: {activity.result}</p>}
      {activity.note !== null && <p className="mt-0.5 text-xs text-muted-foreground/80">{activity.note}</p>}
      <p className="mt-0.5 text-[10px] text-muted-foreground/60">
        {activity.direction === 'inbound' ? 'входящее' : 'исходящее'} · автор: {activity.authorName ?? '—'} · {activity.timezone}
      </p>
    </div>
  )
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
