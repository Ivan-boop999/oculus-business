import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import {
  companiesResponseSchema,
  companyResponseSchema,
  type Deal,
} from '@oculus-business/contracts'
import { todayDateOnly } from '@/platform/format'
import { useIsDesktop } from '@/platform/use-is-desktop'

import type { StageWithDeals } from './CrmBoardPage'

import {
  useAddDealCommentMutation,
  useCreateDealMutation,
  useDealCommentsQuery,
  useDealHistoryQuery,
  useDeleteDealMutation,
  useMoveDealMutation,
  useUpdateDealMutation,
} from './queries'

const SOURCE_SUGGESTIONS = [
  'Прямой входящий',
  'Холодный аутрич',
  'Рекомендация',
  'VC / Хабр',
  'Telegram',
  'TenChat',
  'Выставка',
]

const LOST_REASONS = [
  'Дорого',
  'Не тот профиль',
  'Нет бюджета',
  'Выбрали другого',
  'Остыл / пропал',
  'Другое',
]

type DealFormState = {
  title: string
  contactName: string
  contactPhone: string
  contactTelegram: string
  source: string
  companyName: string
  monthlyAmount: string
  oneTimeAmount: string
  note: string
  nextAction: string
  nextActionAt: string
}

function formFromDeal(deal: Deal | null): DealFormState {
  return {
    title: deal?.title ?? '',
    contactName: deal?.contactName ?? '',
    contactPhone: deal?.contactPhone ?? '',
    contactTelegram: deal?.contactTelegram ?? '',
    source: deal?.source ?? '',
    companyName: deal?.companyName ?? '',
    monthlyAmount: deal?.monthlyAmount ? String(deal.monthlyAmount) : '',
    oneTimeAmount: deal?.oneTimeAmount ? String(deal.oneTimeAmount) : '',
    note: deal?.note ?? '',
    nextAction: deal?.nextAction ?? '',
    nextActionAt: deal?.nextActionAt ?? '',
  }
}

function payloadFromForm(form: DealFormState) {
  return {
    title: form.title.trim(),
    contactName: form.contactName.trim() || null,
    contactPhone: form.contactPhone.trim() || null,
    contactTelegram: form.contactTelegram.trim() || null,
    source: form.source.trim() || null,
    monthlyAmount: Number(form.monthlyAmount) || 0,
    oneTimeAmount: Number(form.oneTimeAmount) || 0,
    note: form.note.trim() || null,
    nextAction: form.nextAction.trim() || null,
    nextActionAt: form.nextActionAt || null,
  }
}

type DealSheetProps = {
  deal: Deal | null
  /// Этап отказа, в который просили перенести сделку извне (drag&drop) — сразу спрашиваем причину.
  lostPromptStageId?: string | null
  onCreateStageId: string | null
  onClose: () => void
  open: boolean
  stages: StageWithDeals[]
}

/// Карточка сделки: просмотр/редактирование полей, перемещение по этапам,
/// удаление и чат-комментарии в духе YouGile.
export function DealSheet({
  deal,
  lostPromptStageId = null,
  onCreateStageId,
  onClose,
  open,
  stages,
}: DealSheetProps) {
  const isCreate = deal === null
  const [form, setForm] = useState<DealFormState>(() => formFromDeal(deal))
  const [error, setError] = useState<string | null>(null)
  const isDesktop = useIsDesktop()
  const [pendingLostStage, setPendingLostStage] = useState<string | null>(null)
  const [lostReasonChoice, setLostReasonChoice] = useState('')
  const [lostReasonOther, setLostReasonOther] = useState('')
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (open) {
      setForm(formFromDeal(deal))
      setError(null)
      setComment('')
      setPendingLostStage(deal !== null && !deal.lostReason ? lostPromptStageId : null)
      setLostReasonChoice('')
      setLostReasonOther('')
    }
  }, [open, deal, lostPromptStageId])

  const createDeal = useCreateDealMutation()
  const updateDeal = useUpdateDealMutation()
  const moveDeal = useMoveDealMutation()
  const deleteDeal = useDeleteDealMutation()
  const comments = useDealCommentsQuery(open && deal !== null ? deal.id : null)
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  const companies = useQuery({
    queryKey: ['crm', 'companies'],
    queryFn: ({ signal }) =>
      transport.request('/api/crm/companies', companiesResponseSchema, { signal }),
  })
  const history = useDealHistoryQuery(open && deal !== null ? deal.id : null)
  const addComment = useAddDealCommentMutation(deal?.id ?? '')

  const set = (patch: Partial<DealFormState>) => setForm((prev) => ({ ...prev, ...patch }))

  const save = async () => {
    if (!form.title.trim()) {
      setError('Укажите название компании')
      return
    }
    const input = payloadFromForm(form)
    try {
      // Контрагент: существующий по имени или создаём новый на лету.
      let companyId: string | null = null
      if (form.companyName.trim()) {
        const existing = companies.data?.items.find(
          (company) => company.name === form.companyName.trim(),
        )
        if (existing) {
          companyId = existing.id
        } else {
          const created = await transport.request('/api/crm/companies', companyResponseSchema, {
            method: 'POST',
            body: { name: form.companyName.trim() },
          })
          companyId = created.company.id
          await queryClient.invalidateQueries({ queryKey: ['crm', 'companies'] })
        }
      }
      const inputWithCompany = { ...input, companyId }
      if (isCreate) {
        await createDeal.mutateAsync({ ...inputWithCompany, stageId: onCreateStageId ?? undefined })
      } else if (deal !== null) {
        await updateDeal.mutateAsync({ id: deal.id, input: inputWithCompany })
      }
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить')
    }
  }

  const stage = deal ? stages.find((item) => item.id === deal.stageId) : undefined

  return (
    <Sheet onOpenChange={(next) => (!next ? onClose() : undefined)} open={open}>
      <SheetContent
        className={isDesktop ? "inset-y-0 right-0 h-full w-full gap-0 overflow-y-auto sm:max-w-lg lg:max-w-lg" : "mx-auto max-h-[92svh] max-w-3xl overflow-y-auto rounded-t-2xl"}
        side={isDesktop ? "right" : "bottom"}
      >
        <SheetHeader className="pb-0">
          <SheetTitle>{isCreate ? 'Новая сделка' : deal?.title}</SheetTitle>
          {stage && (
            <div className="flex gap-1">
              <Badge variant="secondary">{stage.title}</Badge>
              {stage.isWon && <Badge variant="outline">действующий клиент</Badge>}
            </div>
          )}
        </SheetHeader>

        <div className="grid gap-3 px-4 pb-6">
          <Field label="Компания *">
            <Input
              onChange={(event) => set({ title: event.target.value })}
              placeholder="ООО Ромашка"
              value={form.title}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Подписка, ₽/мес">
              <Input
                inputMode="numeric"
                onChange={(event) => set({ monthlyAmount: event.target.value })}
                placeholder="30000"
                value={form.monthlyAmount}
              />
            </Field>
            <Field label="Разовая сумма, ₽">
              <Input
                inputMode="numeric"
                onChange={(event) => set({ oneTimeAmount: event.target.value })}
                placeholder="495000"
                value={form.oneTimeAmount}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Контакт">
              <Input
                onChange={(event) => set({ contactName: event.target.value })}
                placeholder="Иван Петров"
                value={form.contactName}
              />
            </Field>
            <Field label="Телефон">
              <Input
                onChange={(event) => set({ contactPhone: event.target.value })}
                placeholder="+7 …"
                value={form.contactPhone}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Telegram">
              <Input
                onChange={(event) => set({ contactTelegram: event.target.value })}
                placeholder="@username"
                value={form.contactTelegram}
              />
            </Field>
            <Field label="Источник">
              <Input
                list="deal-sources"
                onChange={(event) => set({ source: event.target.value })}
                placeholder="Откуда пришли"
                value={form.source}
              />
              <datalist id="deal-sources">
                {SOURCE_SUGGESTIONS.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </Field>
          </div>

          <Field label="Контрагент">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) => {
                if (event.target.value === '__new__') {
                  const name = window.prompt('Название нового контрагента')
                  if (name && name.trim()) set({ companyName: name.trim() })
                  return
                }
                set({ companyName: event.target.value })
              }}
              value={
                (companies.data?.items ?? []).some((company) => company.name === form.companyName)
                  ? form.companyName
                  : form.companyName
                    ? '__custom__'
                    : ''
              }
            >
              <option value="">— не выбран —</option>
              {(companies.data?.items ?? []).map((company) => (
                <option key={company.id} value={company.name}>
                  {company.name}
                  {company.dealsCount > 0 ? ` (${company.dealsCount})` : ''}
                </option>
              ))}
              {form.companyName &&
                !(companies.data?.items ?? []).some(
                  (company) => company.name === form.companyName,
                ) && <option value="__custom__">{form.companyName} (новый)</option>}
              <option value="__new__">+ Новая компания…</option>
            </select>
            <p className="text-[10px] text-muted-foreground">
              Список ведётся на экране «Контрагенты»; новый сохранится вместе со сделкой.
            </p>
          </Field>

          <div className="grid grid-cols-[1fr_140px] gap-3">
            <Field label="Следующее действие">
              <Input
                onChange={(event) => set({ nextAction: event.target.value })}
                placeholder="Созвон, отправить КП…"
                value={form.nextAction}
              />
            </Field>
            <Field label="Когда">
              <Input
                onChange={(event) => set({ nextActionAt: event.target.value })}
                type="date"
                value={form.nextActionAt || todayDateOnly()}
              />
            </Field>
          </div>

          <Field label="Заметка">
            <Textarea
              onChange={(event) => set({ note: event.target.value })}
              placeholder="Периметр, модули, договорённости…"
              rows={3}
              value={form.note}
            />
          </Field>

          {deal && (
            <>
            <Field label="Этап">
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                onChange={(event) => {
                  const nextStageId = event.target.value
                  const target = stages.find((item) => item.id === nextStageId)
                  if (!target) return
                  if (target.isLost && !deal?.lostReason) {
                    setPendingLostStage(nextStageId)
                    return
                  }
                  moveDeal.mutate({
                    id: deal.id,
                    stageId: nextStageId,
                    position: target.deals.length,
                  })
                }}
                value={deal.stageId}
              >
                {stages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </Field>

            {pendingLostStage !== null && (
              <div className="grid gap-2 rounded-xl border border-[#F43F5E]/30 bg-[#F43F5E]/8 p-3">
                <p className="text-xs font-medium text-[#FB7185]">
                  Укажите причину отказа — она пойдёт в аналитику воронки
                </p>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  onChange={(event) => setLostReasonChoice(event.target.value)}
                  value={lostReasonChoice}
                >
                  <option value="">Выберите причину…</option>
                  {LOST_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
                {lostReasonChoice === 'Другое' && (
                  <Input
                    onChange={(event) => setLostReasonOther(event.target.value)}
                    placeholder="Свой вариант причины"
                    value={lostReasonOther}
                  />
                )}
                <div className="flex gap-2">
                  <Button
                    disabled={
                      !lostReasonChoice ||
                      (lostReasonChoice === 'Другое' && !lostReasonOther.trim()) ||
                      moveDeal.isPending ||
                      updateDeal.isPending
                    }
                    onClick={() => {
                      const target = stages.find((item) => item.id === pendingLostStage)
                      moveDeal.mutate(
                        {
                          id: deal.id,
                          stageId: pendingLostStage,
                          position: target?.deals.length ?? 0,
                        },
                        {
                          onSuccess: () => {
                            updateDeal.mutate({
                              id: deal.id,
                              input: {
                                lostReason:
                                  lostReasonChoice === 'Другое'
                                    ? `Другое: ${lostReasonOther.trim()}`
                                    : lostReasonChoice,
                              },
                            })
                            setPendingLostStage(null)
                          },
                        },
                      )
                    }}
                    size="sm"
                    variant="destructive"
                  >
                    Перенести в отказ
                  </Button>
                  <Button onClick={() => setPendingLostStage(null)} size="sm" variant="outline">
                    Отмена
                  </Button>
                </div>
              </div>
            )}

            {stage?.isLost && deal.lostReason && (
              <p className="rounded-lg border border-[#F43F5E]/25 bg-[#F43F5E]/8 px-3 py-2 text-xs text-[#FB7185]">
                Причина отказа: {deal.lostReason}
              </p>
            )}
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-2">
            <Button
              disabled={createDeal.isPending || updateDeal.isPending}
              onClick={() => void save()}
            >
              {isCreate ? 'Создать' : 'Сохранить'}
            </Button>
            <Button onClick={onClose} variant="outline">
              Отмена
            </Button>
            {deal && (
              <Button
                className="ml-auto"
                disabled={deleteDeal.isPending}
                onClick={() => {
                  if (window.confirm(`Удалить сделку «${deal.title}»?`)) {
                    deleteDeal.mutate(deal.id)
                    onClose()
                  }
                }}
                variant="destructive"
              >
                Удалить
              </Button>
            )}
          </div>

          {deal && history.data !== undefined && history.data.entries.length > 0 && (
            <div className="grid gap-1.5 border-t pt-3">
              <h3 className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                История
              </h3>
              <div className="grid gap-1">
                {history.data.entries.map((entry) => (
                  <p className="text-[11px] text-muted-foreground" key={entry.id}>
                    <span className="tabular-nums">
                      {new Date(entry.movedAt).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>{' '}
                    — {entry.fromStage ? `${entry.fromStage} → ` : ''}
                    <span className="text-[#A5B4FC]">{entry.toStage}</span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {deal && (
            <div className="grid gap-2 border-t pt-3">
              <h3 className="text-sm font-semibold">Обсуждение</h3>
              <div className="grid max-h-56 gap-2 overflow-y-auto">
                {comments.data?.comments.map((item) => (
                  <div className="rounded-lg bg-muted/50 px-3 py-2" key={item.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium">
                        {item.authorName ?? 'Коллега'}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm whitespace-pre-wrap">{item.body}</p>
                  </div>
                ))}
                {comments.data?.comments.length === 0 && (
                  <p className="text-xs text-muted-foreground">Комментариев пока нет</p>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Комментарий…"
                  value={comment}
                />
                <Button
                  disabled={!comment.trim() || addComment.isPending}
                  onClick={() => {
                    addComment.mutate(comment.trim(), {
                      onSuccess: () => setComment(''),
                    })
                  }}
                  variant="secondary"
                >
                  Отправить
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
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
