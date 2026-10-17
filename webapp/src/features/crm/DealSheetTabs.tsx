import { useState, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { DealDetail } from '@oculus-business/contracts'
import { formatMoneyShort } from '@/platform/format'

import { useAuth } from '@/features/auth'
import {
  useBusinessUsersQuery,
  useConfirmReceiptMutation,
  useCreateActivityMutation,
  useCreateDraftMutation,
  useCreateSalesTaskMutation,
  useActivitiesQuery,
  useDealDetailQuery,
  useDraftActionMutation,
  useContactsQuery,
  useDeleteDealContactRoleMutation,
  useSalesTasksQuery,
  useSaveDealClaimMutation,
  useSaveDealContactRoleMutation,
  useSetSubscriptionMutation,
  useUpdateDraftMutation,
  useUpdateSalesTaskMutation,
} from './sales-queries'
import { updateDeal } from './api'
import { LaunchTabEdit, PilotTabEdit } from './DealPilotLaunchTabs'
import { useQueryClient } from '@tanstack/react-query'

const CLAIM_FIELD_LABELS: Record<string, string> = {
  problem: 'Пример задачи',
  consequences: 'Последствия/ценность',
  baseline: 'Baseline',
  economic_buyer: 'Экономический покупатель',
  process_owner: 'Владелец процесса',
  budget: 'Бюджет',
  solution: 'Решение',
}

const CLAIM_STATUS_LABELS: Record<string, string> = {
  hypothesis: 'гипотеза',
  customer_confirmed: 'подтверждено клиентом',
  tested: 'проверено',
  unknown: 'неизвестно',
}

const ROLE_LABELS: Record<string, string> = {
  economic_buyer: 'экономический покупатель',
  process_owner: 'владелец процесса',
  technical: 'технический участник',
  procurement: 'закупки',
  champion: 'внутренний сторонник',
  other: 'другое',
}

const TABS = [
  'Основное',
  'Квалификация',
  'Контакты',
  'Активность',
  'Черновики',
  'Пилот',
  'Запуск',
  'Деньги',
] as const

/// Табы карточки существующей сделки (экран 3 ТЗ): квалификация по этапам, участники,
/// взаимодействия/задачи, черновики, пилот, запуск и деньги — без перегрузки ввода.
export function DealSheetTabs({ dealId, stages }: { dealId: string; stages: Array<{ id: string; title: string }> }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Основное')
  const detail = useDealDetailQuery(dealId)
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  const users = useBusinessUsersQuery()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['sales'] })
    void queryClient.invalidateQueries({ queryKey: ['crm'] })
    void queryClient.invalidateQueries({ queryKey: ['finance'] })
  }
  const patchDeal = async (input: Record<string, unknown>) => {
    await updateDeal(transport, dealId, input)
    invalidate()
  }

  if (detail.isPending) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Загружаем карточку…</p>
  }
  if (detail.isError || detail.data === undefined) {
    return <p className="py-6 text-center text-sm text-destructive">Не удалось загрузить карточку сделки</p>
  }

  const deal = detail.data.deal

  return (
    <div className="grid gap-3 border-t pt-3">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((item) => (
          <button
            className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              tab === item
                ? 'border-[#6366F1]/40 bg-[#6366F1]/15 text-[#A5B4FC]'
                : 'border-white/10 bg-white/5 text-muted-foreground hover:text-white'
            }`}
            key={item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === 'Основное' && <MainTab deal={deal} onPatch={patchDeal} stages={stages} users={users.data?.items ?? []} />}
      {tab === 'Квалификация' && <QualificationTab deal={deal} dealId={dealId} onPatch={patchDeal} />}
      {tab === 'Контакты' && <ContactsTab deal={deal} dealId={dealId} />}
      {tab === 'Активность' && <ActivityTab deal={deal} dealId={dealId} />}
      {tab === 'Черновики' && <DraftsTab deal={deal} dealId={dealId} />}
      {tab === 'Пилот' && <PilotTabEdit deal={deal} dealId={dealId} />}
      {tab === 'Запуск' && <LaunchTabEdit deal={deal} dealId={dealId} />}
      {tab === 'Деньги' && <MoneyTab deal={deal} dealId={dealId} />}
    </div>
  )
}

function MainTab({
  deal,
  onPatch,
  stages,
  users,
}: {
  deal: DealDetail
  onPatch: (input: Record<string, unknown>) => Promise<void>
  stages: Array<{ id: string; title: string }>
  users: Array<{ id: string; displayName: string | null; email: string }>
}) {
  const [form, setForm] = useState({
    ownerId: deal.ownerId ?? '',
    direction: deal.direction ?? '',
    scenario: deal.scenario ?? '',
    wonBasis: deal.wonBasis ?? '',
    nextAgreedStep: deal.nextAgreedStep ?? '',
    note: deal.note ?? '',
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }))
  const stage = stages.find((item) => item.id === deal.stageId)
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Ответственный (owner)">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            onChange={(event) => set({ ownerId: event.target.value })}
            value={form.ownerId}
          >
            <option value="">— не назначен —</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName ?? user.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Направление">
          <Input onChange={(event) => set({ direction: event.target.value })} placeholder="Оптимизация производства…" value={form.direction} />
        </Field>
      </div>
      <Field label="Сценарий использования">
        <Textarea onChange={(event) => set({ scenario: event.target.value })} rows={2} value={form.scenario} />
      </Field>
      <Field label="Следующий согласованный шаг">
        <Input onChange={(event) => set({ nextAgreedStep: event.target.value })} placeholder="Что именно согласовали делать дальше" value={form.nextAgreedStep} />
      </Field>
      <Field label="Основание выигрыша (для won)">
        <Textarea onChange={(event) => set({ wonBasis: event.target.value })} placeholder="Подписанный договор / письмо-обязательство…" rows={2} value={form.wonBasis} />
      </Field>
      <Field label="Заметка">
        <Textarea onChange={(event) => set({ note: event.target.value })} rows={3} value={form.note} />
      </Field>
      {error !== null && <p className="text-xs text-[#FB7185]">{error}</p>}
      <div className="flex items-center gap-2">
        <Button
          onClick={() => {
            setSaved(false)
            onPatch({
              ownerId: form.ownerId || null,
              direction: form.direction.trim() || null,
              scenario: form.scenario.trim() || null,
              wonBasis: form.wonBasis.trim() || null,
              nextAgreedStep: form.nextAgreedStep.trim() || null,
              note: form.note.trim() || null,
            })
              .then(() => setSaved(true))
              .catch((caught) => setError(caught instanceof Error ? caught.message : 'Ошибка'))
          }
          }
          size="sm"
        >
          Сохранить
        </Button>
        {saved && <span className="text-xs text-[#34D399]">сохранено</span>}
        {stage !== undefined && <Badge variant="outline" className="ml-auto">{stage.title}</Badge>}
      </div>
    </div>
  )
}

function QualificationTab({
  deal,
  dealId,
  onPatch,
}: {
  deal: DealDetail
  dealId: string
  onPatch: (input: Record<string, unknown>) => Promise<void>
}) {
  const saveClaim = useSaveDealClaimMutation()
  const [form, setForm] = useState({
    currentProcess: deal.currentProcess ?? '',
    problemStatement: deal.problemStatement ?? '',
    consequences: deal.consequences ?? '',
    baseline: deal.baseline ?? '',
    measurementMethod: deal.measurementMethod ?? '',
    desiredOutcome: deal.desiredOutcome ?? '',
    economicBuyerStatus: deal.economicBuyerStatus ?? '',
    selectionCriteria: deal.selectionCriteria ?? '',
    decisionProcess: deal.decisionProcess ?? '',
    techConstraints: deal.techConstraints ?? '',
    priceAnchor: deal.priceAnchor !== null ? String(deal.priceAnchor) : '',
    priceReaction: deal.priceReaction ?? '',
  })
  const [saved, setSaved] = useState(false)
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }))
  const claimsByField = new Map(deal.claims.map((claim) => [claim.fieldKey, claim]))

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Текущий процесс / альтернатива">
          <Textarea onChange={(event) => set({ currentProcess: event.target.value })} rows={2} value={form.currentProcess} />
        </Field>
        <Field label="Проблема словами клиента">
          <Textarea onChange={(event) => set({ problemStatement: event.target.value })} rows={2} value={form.problemStatement} />
        </Field>
        <Field label="Последствия / ценность изменения">
          <Textarea onChange={(event) => set({ consequences: event.target.value })} rows={2} value={form.consequences} />
        </Field>
        <Field label="Baseline и метод измерения">
          <Textarea onChange={(event) => set({ baseline: event.target.value })} rows={2} value={form.baseline} />
        </Field>
        <Field label="Метод оценки">
          <Input onChange={(event) => set({ measurementMethod: event.target.value })} value={form.measurementMethod} />
        </Field>
        <Field label="Желаемый результат">
          <Input onChange={(event) => set({ desiredOutcome: event.target.value })} value={form.desiredOutcome} />
        </Field>
        <Field label="Статус доступа к эконом. покупателю">
          <Input onChange={(event) => set({ economicBuyerStatus: event.target.value })} placeholder="unknown / identified / in_dialogue / confirmed" value={form.economicBuyerStatus} />
        </Field>
        <Field label="Критерии выбора">
          <Textarea onChange={(event) => set({ selectionCriteria: event.target.value })} rows={2} value={form.selectionCriteria} />
        </Field>
        <Field label="Процесс решения и договора">
          <Textarea onChange={(event) => set({ decisionProcess: event.target.value })} rows={2} value={form.decisionProcess} />
        </Field>
        <Field label="Технические ограничения">
          <Textarea onChange={(event) => set({ techConstraints: event.target.value })} rows={2} value={form.techConstraints} />
        </Field>
        <Field label="Ориентир цены, ₽">
          <Input inputMode="numeric" onChange={(event) => set({ priceAnchor: event.target.value })} value={form.priceAnchor} />
        </Field>
        <Field label="Реакция на ориентир">
          <Input onChange={(event) => set({ priceReaction: event.target.value })} value={form.priceReaction} />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={() => {
            setSaved(false)
            onPatch({
              currentProcess: form.currentProcess.trim() || null,
              problemStatement: form.problemStatement.trim() || null,
              consequences: form.consequences.trim() || null,
              baseline: form.baseline.trim() || null,
              measurementMethod: form.measurementMethod.trim() || null,
              desiredOutcome: form.desiredOutcome.trim() || null,
              economicBuyerStatus: form.economicBuyerStatus.trim() || null,
              selectionCriteria: form.selectionCriteria.trim() || null,
              decisionProcess: form.decisionProcess.trim() || null,
              techConstraints: form.techConstraints.trim() || null,
              priceAnchor: form.priceAnchor.trim() === '' ? null : Number(form.priceAnchor),
              priceReaction: form.priceReaction.trim() || null,
            })
              .then(() => setSaved(true))
              .catch(() => setSaved(false))
          }
          }
          size="sm"
        >
          Сохранить квалификацию
        </Button>
        {saved && <span className="text-xs text-[#34D399]">сохранено</span>}
      </div>

      <div className="grid gap-2 border-t pt-3">
        <h4 className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          Статусы критических утверждений
        </h4>
        <p className="text-[11px] text-muted-foreground/80">
          Гипотеза с сайта не считается подтверждённой болью: статус меняет только человек или проверка.
        </p>
        {Object.entries(CLAIM_FIELD_LABELS).map(([fieldKey, label]) => {
          const claim = claimsByField.get(fieldKey as DealDetail['claims'][number]['fieldKey'])
          return (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-[#101724] px-3 py-2 text-sm" key={fieldKey}>
              <span className="min-w-32 text-white/90">{label}</span>
              <Badge
                className={
                  claim?.status === 'customer_confirmed' || claim?.status === 'tested'
                    ? 'border-[#34D399]/25 bg-[#34D399]/10 text-[#34D399]'
                    : 'border-white/10 bg-white/5 text-[#C9D0E2]'
                }
              >
                {claim ? CLAIM_STATUS_LABELS[claim.status] : 'не задан'}
              </Badge>
              <select
                className="ml-auto h-8 rounded-md border border-input bg-background px-2 text-xs"
                onChange={(event) =>
                  saveClaim.mutate({
                    dealId,
                    input: { fieldKey: fieldKey as never, status: event.target.value as never, source: 'ручная фиксация' },
                  })
                }
                value={claim?.status ?? ''}
              >
                <option value="">— статус —</option>
                <option value="hypothesis">гипотеза</option>
                <option value="customer_confirmed">подтверждено клиентом</option>
                <option value="tested">проверено</option>
                <option value="unknown">неизвестно</option>
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ContactsTab({ deal, dealId }: { deal: DealDetail; dealId: string }) {
  const contacts = useContactsQuery(deal.companyId)
  const saveRole = useSaveDealContactRoleMutation()
  const removeRole = useDeleteDealContactRoleMutation()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ contactId: '', role: 'process_owner', confirmed: false })

  if (deal.companyId === null) {
    return (
      <p className="text-xs text-muted-foreground">
        Привяжите контрагента на вкладке «Основное» (поле «Контрагент» основной формы), чтобы назначать
        роли контактов.
      </p>
    )
  }

  const onError = (caught: unknown) => setError(caught instanceof Error ? caught.message : 'Ошибка')

  return (
    <div className="grid gap-3">
      <p className="text-[11px] text-muted-foreground/80">
        Роль назначается на конкретную сделку: один человек может участвовать в разных задачах компании.
        Владелец процесса обязателен для квалификации; сторонник подтверждается действиями, не должностью.
      </p>

      <div className="grid gap-2 rounded-2xl border border-white/8 bg-[#101724] p-3">
        <h4 className="text-xs font-semibold text-white">Назначить роль</h4>
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            onChange={(event) => setForm((prev) => ({ ...prev, contactId: event.target.value }))}
            value={form.contactId}
          >
            <option value="">— контакт —</option>
            {(contacts.data?.items ?? []).map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name ?? 'Без имени'} {contact.position !== null ? '(' + contact.position + ')' : ''}
              </option>
            ))}
          </select>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
            value={form.role}
          >
            <option value="economic_buyer">экономический покупатель</option>
            <option value="process_owner">владелец процесса</option>
            <option value="technical">технический участник</option>
            <option value="procurement">закупки</option>
            <option value="champion">внутренний сторонник</option>
            <option value="other">другое</option>
          </select>
          <Button
            disabled={form.contactId === '' || saveRole.isPending}
            onClick={() =>
              saveRole.mutate(
                {
                  dealId,
                  input: {
                    contactId: form.contactId,
                    role: form.role as 'process_owner',
                    confirmed: form.confirmed,
                  },
                },
                { onError, onSuccess: () => setForm((prev) => ({ ...prev, contactId: '' })) },
              )
            }
            size="sm"
          >
            Назначить
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            checked={form.confirmed}
            onChange={(event) => setForm((prev) => ({ ...prev, confirmed: event.target.checked }))}
            type="checkbox"
          />
          Подтверждено действиями (разговор/встреча), не должностью
        </label>
        {(contacts.data?.items.length ?? 0) === 0 && (
          <p className="text-xs text-muted-foreground/70">
            У компании ещё нет контактов — добавьте их в карточке контрагента.
          </p>
        )}
        {error !== null && <p className="text-xs text-[#FB7185]">{error}</p>}
      </div>

      <div className="grid gap-1.5">
        {deal.contactRoles.map((role) => (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-[#101724] px-3 py-2 text-sm" key={role.id}>
            <span className="text-white">{role.contactName ?? 'Контакт'}</span>
            <Badge variant="secondary">{ROLE_LABELS[role.role] ?? role.role}</Badge>
            {role.confirmed ? (
              <Badge className="border-[#34D399]/25 bg-[#34D399]/10 text-[#34D399]">подтверждено действиями</Badge>
            ) : (
              <Badge variant="outline">не подтверждено</Badge>
            )}
            <button
              className="ml-auto text-xs text-muted-foreground hover:text-[#FB7185]"
              onClick={() => removeRole.mutate({ dealId, roleId: role.id }, { onError })}
            >
              убрать
            </button>
          </div>
        ))}
        {deal.contactRoles.length === 0 && (
          <p className="text-xs text-muted-foreground/70">Роли пока не назначены</p>
        )}
      </div>
    </div>
  )
}


const CHANNEL_LABELS: Record<string, string> = {
  call: 'звонок',
  email: 'письмо',
  telegram: 'telegram',
  meeting: 'встреча',
  other: 'другое',
}

const ACTION_LABELS: Record<string, string> = {
  call_attempt: 'попытка звонка',
  conversation: 'разговор',
  meeting_scheduled: 'встреча назначена',
  meeting_held: 'встреча проведена',
  message_sent: 'сообщение отправлено',
  message_received: 'ответ клиента',
  other: 'другое',
}

function ActivityTab({ deal, dealId }: { deal: DealDetail; dealId: string }) {
  const createActivity = useCreateActivityMutation()
  const createTask = useCreateSalesTaskMutation()
  const completeTask = useUpdateSalesTaskMutation()
  const { user } = useAuth()
  const { data: activities } = useActivitiesQuery({ dealId, limit: 30 })
  const { data: tasks } = useSalesTasksQuery({ dealId, status: 'open', limit: 20 })
  const [form, setForm] = useState({
    channel: 'call',
    actionType: 'call_attempt',
    occurredAt: new Date().toISOString().slice(0, 16),
    direction: 'outbound',
    result: '',
    note: '',
  })
  const [taskForm, setTaskForm] = useState({ goal: '', action: '', dueAt: new Date().toISOString().slice(0, 16) })

  if (deal.companyId === null) {
    return (
      <p className="text-xs text-muted-foreground">
        Привяжите контрагента на вкладке «Основное» (поле «Контрагент» основной формы), чтобы фиксировать
        взаимодействия и черновики.
      </p>
    )
  }
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }))
  const setTask = (patch: Partial<typeof taskForm>) => setTaskForm((prev) => ({ ...prev, ...patch }))

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 rounded-2xl border border-white/8 bg-[#101724] p-3">
        <h4 className="text-xs font-semibold text-white">Зафиксировать взаимодействие</h4>
        <p className="text-[11px] text-muted-foreground/80">
          «Не дозвонились» и состоявшийся разговор — разные события; время хранится с часовым поясом.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            onChange={(event) => set({ channel: event.target.value })}
            value={form.channel}
          >
            {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            onChange={(event) => {
              const actionType = event.target.value
              set({ actionType, direction: actionType === 'message_received' ? 'inbound' : 'outbound' })
            }}
            value={form.actionType}
          >
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Input onChange={(event) => set({ occurredAt: event.target.value })} type="datetime-local" value={form.occurredAt} />
          <Input onChange={(event) => set({ result: event.target.value })} placeholder="Результат (кратко)" value={form.result} />
        </div>
        <Textarea onChange={(event) => set({ note: event.target.value })} placeholder="Заметка; дословные цитаты — в поле ниже" rows={2} value={form.note} />
        <Button
          disabled={createActivity.isPending}
          onClick={() =>
            createActivity.mutate({
              companyId: deal.companyId ?? '',
              dealId,
              occurredAt: `${form.occurredAt}:00+03:00`,
              timezone: 'Europe/Moscow',
              channel: form.channel as 'call',
              actionType: form.actionType as 'call_attempt',
              direction: form.direction as 'outbound',
              result: form.result.trim() || null,
              note: form.note.trim() || null,
            })
          }
          size="sm"
        >
          Записать
        </Button>
        {createActivity.isError && (
          <p className="text-xs text-[#FB7185]">{createActivity.error instanceof Error ? createActivity.error.message : 'Ошибка'}</p>
        )}
      </div>

      <div className="grid gap-2 rounded-2xl border border-white/8 bg-[#101724] p-3">
        <h4 className="text-xs font-semibold text-white">Поставить задачу</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input onChange={(event) => setTask({ goal: event.target.value })} placeholder="Цель *" value={taskForm.goal} />
          <Input onChange={(event) => setTask({ action: event.target.value })} placeholder="Конкретное действие" value={taskForm.action} />
          <Input onChange={(event) => setTask({ dueAt: event.target.value })} type="datetime-local" value={taskForm.dueAt} />
        </div>
        <Button
          disabled={taskForm.goal.trim() === '' || createTask.isPending}
          onClick={() =>
            createTask.mutate({
              companyId: deal.companyId ?? null,
              dealId,
              assigneeId: user?.id ?? '',
              goal: taskForm.goal.trim(),
              action: taskForm.action.trim() || null,
              dueAt: `${taskForm.dueAt}:00+03:00`,
              dueTimezone: 'Europe/Moscow',
            })
          }
          size="sm"
        >
          Поставить задачу
        </Button>
      </div>

      <div className="grid gap-1.5">
        {(tasks?.items ?? [])
          .filter((task) => task.status === 'open')
          .map((task) => (
            <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-[#101724] px-3 py-2 text-sm" key={task.id}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-white">{task.action ?? task.goal}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {task.goal} · до {task.dueAt !== null ? new Date(task.dueAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '— (срок не указан)'} · {task.assigneeName ?? '—'}
                  {task.needsReview ? ' · ⚠ пересмотреть' : ''}
                </span>
              </span>
              <Button onClick={() => completeTask.mutate({ id: task.id, input: { status: 'done' } })} size="sm" variant="secondary">
                Готово
              </Button>
            </div>
          ))}
      </div>

      <div className="grid gap-1.5">
        {(activities?.items ?? []).map((activity) => (
          <div className="rounded-xl border border-white/8 bg-[#101724] px-3 py-2 text-sm" key={activity.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-white">
                {ACTION_LABELS[activity.actionType] ?? activity.actionType}
                {activity.contactName !== null ? ` · ${activity.contactName}` : ''}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {new Date(activity.occurredAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {activity.result !== null && <p className="mt-0.5 text-xs text-muted-foreground">Результат: {activity.result}</p>}
            {activity.note !== null && <p className="mt-0.5 text-xs text-muted-foreground/80">{activity.note}</p>}
          </div>
        ))}
        {(activities?.items.length ?? 0) === 0 && <p className="text-xs text-muted-foreground/70">Взаимодействий пока нет</p>}
      </div>
    </div>
  )
}

function DraftsTab({ deal, dealId }: { deal: DealDetail; dealId: string }) {
  const createDraft = useCreateDraftMutation()
  const updateDraft = useUpdateDraftMutation()
  const action = useDraftActionMutation()
  const [form, setForm] = useState({ channel: 'email', recipient: '', subject: '', body: '' })
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }))

  if (deal.companyId === null) {
    return (
      <p className="text-xs text-muted-foreground">
        Привяжите контрагента на вкладке «Основное» (поле «Контрагент» основной формы), чтобы создавать черновики.
      </p>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 rounded-2xl border border-white/8 bg-[#101724] p-3">
        <h4 className="text-xs font-semibold text-white">Новый черновик обращения</h4>
        <p className="text-[11px] text-muted-foreground/80">
          Сохранение черновика — не отправка. Отправка фиксируется вручную только по одобренной версии.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            onChange={(event) => set({ channel: event.target.value })}
            value={form.channel}
          >
            <option value="email">email</option>
            <option value="telegram">telegram</option>
            <option value="phone">телефон</option>
          </select>
          <Input onChange={(event) => set({ recipient: event.target.value })} placeholder="Точный получатель (адрес/юзернейм)" value={form.recipient} />
        </div>
        <Input onChange={(event) => set({ subject: event.target.value })} placeholder="Тема" value={form.subject} />
        <Textarea onChange={(event) => set({ body: event.target.value })} placeholder="Текст обращения" rows={4} value={form.body} />
        {error !== null && <p className="text-xs text-[#FB7185]">{error}</p>}
        <Button
          disabled={form.recipient.trim() === '' || form.body.trim() === '' || createDraft.isPending}
          onClick={() =>
            createDraft.mutate(
              {
                companyId: deal.companyId ?? '',
                dealId,
                channel: form.channel as 'email',
                recipient: form.recipient.trim(),
                subject: form.subject.trim() || null,
                body: form.body.trim(),
              },
              {
                onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка'),
                onSuccess: () => {
                  set({ subject: '', body: '' })
                  setError(null)
                },
              },
            )
          }
          size="sm"
        >
          Сохранить черновик
        </Button>
      </div>

      <div className="grid gap-1.5">
        {deal.drafts.map((draft) => (
          <div className="rounded-xl border border-white/8 bg-[#101724] p-3 text-sm" key={draft.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">v{draft.version}</Badge>
              <Badge
                className={
                  draft.status === 'sent'
                    ? 'border-[#34D399]/25 bg-[#34D399]/10 text-[#34D399]'
                    : draft.status === 'approved'
                      ? 'border-[#6366F1]/25 bg-[#6366F1]/10 text-[#A5B4FC]'
                      : 'border-white/10 bg-white/5 text-[#C9D0E2]'
                }
              >
                {draft.status}
              </Badge>
              <span className="text-white/90">{draft.recipient}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{draft.subject ?? 'без темы'}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{draft.body.slice(0, 160)}</p>
            {draft.approvedAt !== null && (
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                одобрено: {new Date(draft.approvedAt).toLocaleString('ru-RU')} ({draft.approvedByName ?? '—'})
                {draft.sentAt !== null ? ` · отправлено: ${new Date(draft.sentAt).toLocaleString('ru-RU')}` : ''}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {draft.status === 'draft' && (
                <Button
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate(
                      { id: draft.id, action: 'review' },
                      { onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка') },
                    )
                  }
                  size="sm"
                  variant="outline"
                >
                  Проверено
                </Button>
              )}
              {(draft.status === 'draft' || draft.status === 'reviewed') && (
                <Button
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate(
                      { id: draft.id, action: 'approve' },
                      { onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка') },
                    )
                  }
                  size="sm"
                >
                  Одобрить
                </Button>
              )}
              {draft.status === 'approved' && (
                <Button
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate(
                      { id: draft.id, action: 'send' },
                      { onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка') },
                    )
                  }
                  size="sm"
                >
                  Зафиксировать отправку
                </Button>
              )}
              {draft.status !== 'sent' && draft.status !== 'cancelled' && (
                <>
                  <Button
                    disabled={updateDraft.isPending}
                    onClick={() => {
                      const body = window.prompt('Изменить текст (создаст новую версию — потребует нового review)', draft.body)
                      if (body !== null && body !== draft.body) {
                        updateDraft.mutate(
                          { id: draft.id, input: { body } },
                          { onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка') },
                        )
                      }
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Править
                  </Button>
                  <Button
                    disabled={action.isPending}
                    onClick={() => {
                      const reason = window.prompt('Причина отмены черновика')
                      if (reason !== null && reason.trim() !== '') {
                        action.mutate(
                          { id: draft.id, action: 'cancel', body: { reason: reason.trim() } },
                          { onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка') },
                        )
                      }
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Отменить
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
        {deal.drafts.length === 0 && <p className="text-xs text-muted-foreground/70">Черновиков по сделке нет</p>}
      </div>
      {error !== null && <p className="text-xs text-[#FB7185]">{error}</p>}
    </div>
  )
}

function MoneyTab({ deal, dealId }: { deal: DealDetail; dealId: string }) {
  const setSubscription = useSetSubscriptionMutation()
  const confirmReceipt = useConfirmReceiptMutation()
  const [error, setError] = useState<string | null>(null)
  const [startsOn, setStartsOn] = useState(deal.subStartsOn ?? new Date().toISOString().slice(0, 10))
  const [receiptAmount, setReceiptAmount] = useState('')

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5 rounded-2xl border border-white/8 bg-[#101724] p-3 text-sm">
        <KV label="Договорная стоимость: разовая" value={`${formatMoneyShort(deal.oneTimeAmount)} ₽`} />
        <KV label="Договорная стоимость: подписка" value={`${formatMoneyShort(deal.monthlyAmount)} ₽/мес`} />
        <KV label="Подтверждённые поступления" value={`${formatMoneyShort(deal.receivedTotal)} ₽`} />
        <KV label="Вклад после расходов и часов" value={deal.contribution !== null ? `${formatMoneyShort(deal.contribution)} ₽` : '—'} />
        <KV
          label="Состояние подписки"
          value={
            deal.subStatus === 'active'
              ? `активна (${deal.subStartsOn ?? ''} — ${deal.subEndsOn ?? '…'})`
              : deal.subStatus === 'unconfirmed'
                ? 'требует подтверждения периодов'
                : deal.subStatus === 'ended'
                  ? 'завершена'
                  : deal.subStatus === 'paused'
                    ? 'пауза'
                    : 'не активирована'
          }
        />
      </div>

      <div className="grid gap-2 rounded-2xl border border-white/8 bg-[#101724] p-3">
        <h4 className="text-xs font-semibold text-white">Подписка (активная — только по явной активации)</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input onChange={(event) => setStartsOn(event.target.value)} type="date" value={startsOn} />
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              disabled={setSubscription.isPending}
              onClick={() =>
                setSubscription.mutate(
                  { dealId, input: { status: 'active', startsOn } },
                  { onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка') },
                )
              }
              size="sm"
            >
              Активировать
            </Button>
            <Button
              disabled={setSubscription.isPending}
              onClick={() =>
                setSubscription.mutate(
                  { dealId, input: { status: 'paused', startsOn } },
                  { onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка') },
                )
              }
              size="sm"
              variant="outline"
            >
              Пауза
            </Button>
            <Button
              disabled={setSubscription.isPending}
              onClick={() =>
                setSubscription.mutate(
                  { dealId, input: { status: 'ended', startsOn } },
                  { onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка') },
                )
              }
              size="sm"
              variant="outline"
            >
              Завершить
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-2 rounded-2xl border border-white/8 bg-[#101724] p-3">
        <h4 className="text-xs font-semibold text-white">Ожидаемые поступления по сделке</h4>
        {(deal.expectedPayments ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground/70">Обязательства по сделке не найдены — создайте их в разделе «Финансы».</p>
        )}
        {(deal.expectedPayments ?? []).map((payment) => (
          <div className="grid gap-1.5 rounded-xl border border-white/8 p-2" key={payment.id}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-white">{payment.title}</span>
              <Badge variant="outline">{payment.status}</Badge>
              <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                {formatMoneyShort(payment.remainingAmount)} из {formatMoneyShort(payment.amount)} ₽ · срок {payment.dueDate}
              </span>
            </div>
            {payment.remainingAmount > 0 && payment.status !== 'cancelled' && (
              <div className="flex gap-1.5">
                <Input
                  inputMode="numeric"
                  onChange={(event) => setReceiptAmount(event.target.value)}
                  placeholder={`сумма поступления (до ${payment.remainingAmount})`}
                  value={receiptAmount}
                />
                <Button
                  disabled={receiptAmount.trim() === '' || confirmReceipt.isPending}
                  onClick={() =>
                    confirmReceipt.mutate(
                      {
                        paymentId: payment.id,
                        input: {
                          amount: Number(receiptAmount),
                          actualReceivedOn: new Date().toISOString().slice(0, 10),
                        },
                      },
                      {
                        onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка'),
                        onSuccess: () => setReceiptAmount(''),
                      },
                    )
                  }
                  size="sm"
                >
                  Подтвердить поступление
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {error !== null && <p className="text-xs text-[#FB7185]">{error}</p>}
    </div>
  )
}

function KV({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-white/90">{value ?? '—'}</span>
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
