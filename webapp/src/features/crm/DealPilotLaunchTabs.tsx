import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { DealDetail } from '@oculus-business/contracts'

import {
  useAddPilotCriterionMutation,
  useAddPilotMilestoneMutation,
  useBusinessUsersQuery,
  useCreateExtensionDealMutation,
  usePilotActionMutation,
  useUpsertLaunchMutation,
  useUpsertPilotMutation,
} from './sales-queries'

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

/// Пилот (CRM-09): карточка с владельцами/данными/критериями/датой решения,
/// версионированные критерии, вехи сторон и явное решение accepted/revise/stop.
export function PilotTabEdit({ deal, dealId }: { deal: DealDetail; dealId: string }) {
  const upsert = useUpsertPilotMutation()
  const action = usePilotActionMutation()
  const addCriterion = useAddPilotCriterionMutation()
  const addMilestone = useAddPilotMilestoneMutation()
  const users = useBusinessUsersQuery()
  const [error, setError] = useState<string | null>(null)
  const pilot = deal.pilot
  const [form, setForm] = useState({
    goal: pilot?.goal ?? '',
    scopeArea: pilot?.scopeArea ?? '',
    sourceData: pilot?.sourceData ?? '',
    ordixOwnerId: pilot?.ordixOwnerId ?? '',
    clientOwnerName: pilot?.clientOwnerName ?? '',
    decisionDueOn: pilot?.decisionDueOn ?? '',
    paidNextStep: pilot?.paidNextStep ?? '',
    paidNextStepAnchor: pilot !== null && pilot.paidNextStepAnchor !== null ? String(pilot.paidNextStepAnchor) : '',
    hoursSpent: pilot !== null ? String(pilot.hoursSpent) : '0',
    costs: pilot !== null ? String(pilot.costs) : '0',
  })
  const [criterion, setCriterion] = useState('')
  const [milestone, setMilestone] = useState({ side: 'client', commitment: '', dueOn: '' })
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }))
  const onError = (caught: unknown) => setError(caught instanceof Error ? caught.message : 'Ошибка')

  return (
    <div className="grid gap-3">
      <p className="text-[11px] text-muted-foreground/80">
        Проверка применимости — необязательный этап. Перед реальным пилотом обязательны: владельцы,
        исходные данные, критерии и дата решения. Итог — только явное решение, демо само ничего не закрывает.
      </p>

      <div className="grid gap-2 rounded-2xl border border-white/8 bg-[#101724] p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Цель пилота">
            <Input onChange={(event) => set({ goal: event.target.value })} value={form.goal} />
          </Field>
          <Field label="Участок">
            <Input onChange={(event) => set({ scopeArea: event.target.value })} value={form.scopeArea} />
          </Field>
          <Field label="Исходные данные">
            <Input onChange={(event) => set({ sourceData: event.target.value })} placeholder="Какие данные/доступы нужны" value={form.sourceData} />
          </Field>
          <Field label="Владелец от ОРДИКС">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) => set({ ordixOwnerId: event.target.value })}
              value={form.ordixOwnerId}
            >
              <option value="">— выберите —</option>
              {(users.data?.items ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName ?? user.email}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Владелец от клиента">
            <Input onChange={(event) => set({ clientOwnerName: event.target.value })} value={form.clientOwnerName} />
          </Field>
          <Field label="Дата итогового решения">
            <Input onChange={(event) => set({ decisionDueOn: event.target.value })} type="date" value={form.decisionDueOn} />
          </Field>
          <Field label="Платный следующий шаг">
            <Input onChange={(event) => set({ paidNextStep: event.target.value })} placeholder="Что предлагают после пилота" value={form.paidNextStep} />
          </Field>
          <Field label="Ориентир продолжения, ₽">
            <Input inputMode="numeric" onChange={(event) => set({ paidNextStepAnchor: event.target.value })} value={form.paidNextStepAnchor} />
          </Field>
          <Field label="Часы">
            <Input inputMode="numeric" onChange={(event) => set({ hoursSpent: event.target.value })} value={form.hoursSpent} />
          </Field>
          <Field label="Прямые расходы, ₽">
            <Input inputMode="numeric" onChange={(event) => set({ costs: event.target.value })} value={form.costs} />
          </Field>
        </div>
        <Button
          disabled={upsert.isPending}
          onClick={() =>
            upsert.mutate(
              {
                dealId,
                input: {
                  goal: form.goal.trim() || null,
                  scopeArea: form.scopeArea.trim() || null,
                  sourceData: form.sourceData.trim() || null,
                  ordixOwnerId: form.ordixOwnerId || null,
                  clientOwnerName: form.clientOwnerName.trim() || null,
                  decisionDueOn: form.decisionDueOn || null,
                  paidNextStep: form.paidNextStep.trim() || null,
                  paidNextStepAnchor: form.paidNextStepAnchor.trim() === '' ? null : Number(form.paidNextStepAnchor),
                  hoursSpent: Number(form.hoursSpent) || 0,
                  costs: Number(form.costs) || 0,
                },
              },
              { onError },
            )
          }
          size="sm"
        >
          {pilot === null ? 'Создать карточку пилота' : 'Сохранить пилот'}
        </Button>
      </div>

      {pilot !== null && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{pilot.status === 'running' ? 'запущен' : 'черновик'}</Badge>
            {pilot.outcome !== null && <Badge variant="outline">итог: {pilot.outcome}</Badge>}
            {pilot.decisionDueOn !== null && (
              <span className="text-[11px] text-muted-foreground">решение до {pilot.decisionDueOn}</span>
            )}
          </div>

          <div className="grid gap-2 rounded-2xl border border-white/8 bg-[#101724] p-3">
            <h4 className="text-xs font-semibold text-white">Критерии (версионированные)</h4>
            {pilot.criteria.map((row) => (
              <div className="flex flex-wrap items-center gap-2 text-xs" key={row.id}>
                <Badge variant="outline">v{row.version}</Badge>
                <span className={row.active ? 'text-white/90' : 'text-muted-foreground line-through'}>{row.statement}</span>
                {row.method !== null && <span className="text-muted-foreground">· {row.method}</span>}
                {row.agreedAt !== null && (
                  <span className="text-[#34D399]">согласован {new Date(row.agreedAt).toLocaleDateString('ru-RU')}</span>
                )}
              </div>
            ))}
            <div className="flex gap-1.5">
              <Input
                onChange={(event) => setCriterion(event.target.value)}
                placeholder="Новый критерий успеха"
                value={criterion}
              />
              <Button
                disabled={criterion.trim().length < 3 || addCriterion.isPending}
                onClick={() =>
                  addCriterion.mutate(
                    { dealId, input: { statement: criterion.trim() } },
                    { onError, onSuccess: () => setCriterion('') },
                  )
                }
                size="sm"
              >
                Добавить
              </Button>
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl border border-white/8 bg-[#101724] p-3">
            <h4 className="text-xs font-semibold text-white">Вехи — обязательства сторон</h4>
            {pilot.milestones.map((row) => (
              <div className="flex flex-wrap items-center gap-2 text-xs" key={row.id}>
                <Badge variant={row.side === 'client' ? 'secondary' : 'outline'}>
                  {row.side === 'client' ? 'клиент' : 'ОРДИКС'}
                </Badge>
                <span className="text-white/90">{row.commitment}</span>
                {row.dueOn !== null && <span className="text-muted-foreground">до {row.dueOn}</span>}
                {row.doneAt !== null ? (
                  <span className="text-[#34D399]">выполнено</span>
                ) : (
                  <span className="text-muted-foreground/70">открыто</span>
                )}
              </div>
            ))}
            <div className="grid gap-1.5 sm:grid-cols-4">
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                onChange={(event) => setMilestone((prev) => ({ ...prev, side: event.target.value }))}
                value={milestone.side}
              >
                <option value="client">клиент</option>
                <option value="ordix">ОРДИКС</option>
              </select>
              <Input
                onChange={(event) => setMilestone((prev) => ({ ...prev, commitment: event.target.value }))}
                placeholder="Обязательство"
                value={milestone.commitment}
              />
              <Input
                onChange={(event) => setMilestone((prev) => ({ ...prev, dueOn: event.target.value }))}
                type="date"
                value={milestone.dueOn}
              />
              <Button
                disabled={milestone.commitment.trim().length < 3 || addMilestone.isPending}
                onClick={() =>
                  addMilestone.mutate(
                    {
                      dealId,
                      input: {
                        side: milestone.side as 'client' | 'ordix',
                        commitment: milestone.commitment.trim(),
                        dueOn: milestone.dueOn || null,
                      },
                    },
                    { onError, onSuccess: () => setMilestone({ side: 'client', commitment: '', dueOn: '' }) },
                  )
                }
                size="sm"
              >
                Добавить
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {pilot.status === 'draft' && pilot.outcome === null && (
              <Button
                disabled={action.isPending}
                onClick={() => action.mutate({ dealId, action: 'activate', body: {} }, { onError })}
                size="sm"
              >
                Запустить пилот
              </Button>
            )}
            {pilot.status === 'running' && pilot.outcome === null && (
              <>
                <Button
                  disabled={action.isPending}
                  onClick={() => action.mutate({ dealId, action: 'decision', body: { outcome: 'accepted' } }, { onError })}
                  size="sm"
                >
                  Принят
                </Button>
                <Button
                  disabled={action.isPending}
                  onClick={() => action.mutate({ dealId, action: 'decision', body: { outcome: 'revise' } }, { onError })}
                  size="sm"
                  variant="outline"
                >
                  Доработать
                </Button>
                <Button
                  disabled={action.isPending}
                  onClick={() => action.mutate({ dealId, action: 'decision', body: { outcome: 'stop' } }, { onError })}
                  size="sm"
                  variant="destructive"
                >
                  Остановить
                </Button>
              </>
            )}
          </div>
        </>
      )}
      {error !== null && <p className="text-xs text-[#FB7185]">{error}</p>}
    </div>
  )
}

/// Запуск (CRM-12): ручной цикл — владелец, план/факт, проблемы использования,
/// контроль ценности/продления, часы/расходы, риск и расширение отдельной сделкой.
export function LaunchTabEdit({ deal, dealId }: { deal: DealDetail; dealId: string }) {
  const upsert = useUpsertLaunchMutation()
  const extension = useCreateExtensionDealMutation()
  const users = useBusinessUsersQuery()
  const [error, setError] = useState<string | null>(null)
  const launch = deal.launch
  const [form, setForm] = useState({
    launchOwnerId: launch?.launchOwnerId ?? '',
    plannedStartOn: launch?.plannedStartOn ?? '',
    actualStartOn: launch?.actualStartOn ?? '',
    firstScenarioAcceptedOn: launch?.firstScenarioAcceptedOn ?? '',
    valueCheckDueOn: launch?.valueCheckDueOn ?? '',
    usageIssues: launch?.usageIssues ?? '',
    supportHours: launch !== null ? String(launch.supportHours) : '0',
    directCosts: launch !== null ? String(launch.directCosts) : '0',
    riskLevel: launch?.riskLevel ?? 'none',
    riskNotes: launch?.riskNotes ?? '',
    nextArea: launch?.nextArea ?? '',
  })
  const [ext, setExt] = useState({ title: '', monthlyAmount: '', oneTimeAmount: '', basis: '' })
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }))
  const onError = (caught: unknown) => setError(caught instanceof Error ? caught.message : 'Ошибка')

  return (
    <div className="grid gap-3">
      <p className="text-[11px] text-muted-foreground/80">
        Ручной цикл запуска: владелец, план/факт, проблемы использования, контроль ценности и продления.
        Клиент с оплаченной, но не принятой системой — риск; расширение — отдельная сделка.
      </p>

      <div className="grid gap-2 rounded-2xl border border-white/8 bg-[#101724] p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Владелец внедрения">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) => set({ launchOwnerId: event.target.value })}
              value={form.launchOwnerId}
            >
              <option value="">— выберите —</option>
              {(users.data?.items ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName ?? user.email}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Контроль ценности/продления">
            <Input onChange={(event) => set({ valueCheckDueOn: event.target.value })} type="date" value={form.valueCheckDueOn} />
          </Field>
          <Field label="План старта">
            <Input onChange={(event) => set({ plannedStartOn: event.target.value })} type="date" value={form.plannedStartOn} />
          </Field>
          <Field label="Факт старта">
            <Input onChange={(event) => set({ actualStartOn: event.target.value })} type="date" value={form.actualStartOn} />
          </Field>
          <Field label="Первый принятый сценарий">
            <Input onChange={(event) => set({ firstScenarioAcceptedOn: event.target.value })} type="date" value={form.firstScenarioAcceptedOn} />
          </Field>
          <Field label="Уровень риска">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) => set({ riskLevel: event.target.value as 'none' | 'low' | 'medium' | 'high' })}
              value={form.riskLevel}
            >
              <option value="none">нет</option>
              <option value="low">низкий</option>
              <option value="medium">средний</option>
              <option value="high">высокий</option>
            </select>
          </Field>
          <Field label="Часы поддержки">
            <Input inputMode="numeric" onChange={(event) => set({ supportHours: event.target.value })} value={form.supportHours} />
          </Field>
          <Field label="Прямые расходы, ₽">
            <Input inputMode="numeric" onChange={(event) => set({ directCosts: event.target.value })} value={form.directCosts} />
          </Field>
        </div>
        <Field label="Проблемы использования">
          <Textarea onChange={(event) => set({ usageIssues: event.target.value })} rows={2} value={form.usageIssues} />
        </Field>
        <Field label="Заметка о риске">
          <Input onChange={(event) => set({ riskNotes: event.target.value })} value={form.riskNotes} />
        </Field>
        <Field label="Следующий участок расширения">
          <Input onChange={(event) => set({ nextArea: event.target.value })} value={form.nextArea} />
        </Field>
        <Button
          disabled={upsert.isPending}
          onClick={() =>
            upsert.mutate(
              {
                dealId,
                input: {
                  launchOwnerId: form.launchOwnerId || null,
                  plannedStartOn: form.plannedStartOn || null,
                  actualStartOn: form.actualStartOn || null,
                  firstScenarioAcceptedOn: form.firstScenarioAcceptedOn || null,
                  valueCheckDueOn: form.valueCheckDueOn || null,
                  usageIssues: form.usageIssues.trim() || null,
                  supportHours: Number(form.supportHours) || 0,
                  directCosts: Number(form.directCosts) || 0,
                  riskLevel: form.riskLevel as 'none' | 'low' | 'medium' | 'high',
                  riskNotes: form.riskNotes.trim() || null,
                  nextArea: form.nextArea.trim() || null,
                },
              },
              { onError },
            )
          }
          size="sm"
        >
          {launch === null ? 'Создать запуск' : 'Сохранить запуск'}
        </Button>
      </div>

      <div className="grid gap-2 rounded-2xl border border-white/8 bg-[#101724] p-3">
        <h4 className="text-xs font-semibold text-white">Расширение — отдельная сделка</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            onChange={(event) => setExt((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Название новой задачи"
            value={ext.title}
          />
          <Input
            inputMode="numeric"
            onChange={(event) => setExt((prev) => ({ ...prev, monthlyAmount: event.target.value }))}
            placeholder="Подписка ₽/мес"
            value={ext.monthlyAmount}
          />
          <Input
            inputMode="numeric"
            onChange={(event) => setExt((prev) => ({ ...prev, oneTimeAmount: event.target.value }))}
            placeholder="Разовая сумма ₽"
            value={ext.oneTimeAmount}
          />
          <Input
            onChange={(event) => setExt((prev) => ({ ...prev, basis: event.target.value }))}
            placeholder="Подтверждённая задача (основание)"
            value={ext.basis}
          />
        </div>
        <Button
          disabled={ext.title.trim() === '' || ext.basis.trim().length < 3 || extension.isPending}
          onClick={() =>
            extension.mutate(
              {
                dealId,
                input: {
                  title: ext.title.trim(),
                  monthlyAmount: Number(ext.monthlyAmount) || 0,
                  oneTimeAmount: Number(ext.oneTimeAmount) || 0,
                  basis: ext.basis.trim(),
                },
              },
              {
                onError,
                onSuccess: () => setExt({ title: '', monthlyAmount: '', oneTimeAmount: '', basis: '' }),
              },
            )
          }
          size="sm"
        >
          Создать сделку-расширение
        </Button>
      </div>
      {error !== null && <p className="text-xs text-[#FB7185]">{error}</p>}
    </div>
  )
}
