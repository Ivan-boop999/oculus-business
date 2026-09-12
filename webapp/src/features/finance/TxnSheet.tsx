import { useEffect, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import type { Txn } from '@oculus-business/contracts'
import { todayDateOnly } from '@/platform/format'

import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './FinancePage'
import { useCreateTxnMutation, useDeleteTxnMutation, useUpdateTxnMutation } from './queries'

type FormState = {
  kind: 'income' | 'expense'
  amount: string
  occurredOn: string
  category: string
  comment: string
}

function formFromTxn(txn: Txn | null): FormState {
  return {
    kind: txn?.kind ?? 'expense',
    amount: txn?.amount ? String(txn.amount) : '',
    occurredOn: txn?.occurredOn ?? todayDateOnly(),
    category: txn?.category ?? '',
    comment: txn?.comment ?? '',
  }
}

export function TxnSheet({
  onClose,
  open,
  txn,
}: {
  onClose: () => void
  open: boolean
  txn: Txn | null
}) {
  const isCreate = txn === null
  const [form, setForm] = useState<FormState>(() => formFromTxn(txn))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(formFromTxn(txn))
      setError(null)
    }
  }, [open, txn])

  const createTxn = useCreateTxnMutation()
  const updateTxn = useUpdateTxnMutation()
  const deleteTxn = useDeleteTxnMutation()

  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }))
  const suggestions = form.kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const save = async () => {
    const amount = Number(form.amount)
    if (!form.category.trim() || !Number.isFinite(amount) || amount < 1) {
      setError('Укажите категорию и сумму')
      return
    }
    const input = {
      kind: form.kind,
      amount,
      occurredOn: form.occurredOn || todayDateOnly(),
      category: form.category.trim(),
      comment: form.comment.trim() || undefined,
    }
    try {
      if (isCreate) {
        await createTxn.mutateAsync(input)
      } else {
        await updateTxn.mutateAsync({ id: txn.id, input })
      }
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить')
    }
  }

  return (
    <Sheet onOpenChange={(next) => (!next ? onClose() : undefined)} open={open}>
      <SheetContent
        className="mx-auto max-h-[92svh] max-w-3xl overflow-y-auto rounded-t-2xl"
        side="bottom"
      >
        <SheetHeader className="pb-0">
          <SheetTitle>{isCreate ? 'Новая операция' : 'Изменить операцию'}</SheetTitle>
        </SheetHeader>

        <div className="grid gap-3 px-4 pb-6">
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => set({ kind: 'income' })}
              variant={form.kind === 'income' ? 'default' : 'outline'}
            >
              Доход
            </Button>
            <Button
              onClick={() => set({ kind: 'expense' })}
              variant={form.kind === 'expense' ? 'default' : 'outline'}
            >
              Расход
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Сумма, ₽">
              <Input
                inputMode="numeric"
                onChange={(event) => set({ amount: event.target.value })}
                placeholder="30000"
                value={form.amount}
              />
            </Field>
            <Field label="Дата">
              <Input
                onChange={(event) => set({ occurredOn: event.target.value })}
                type="date"
                value={form.occurredOn}
              />
            </Field>
          </div>

          <Field label="Категория">
            <Input
              list="txn-categories"
              onChange={(event) => set({ category: event.target.value })}
              placeholder={form.kind === 'income' ? 'Подписка' : 'Сервер / хостинг'}
              value={form.category}
            />
            <datalist id="txn-categories">
              {suggestions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </Field>

          <Field label="Комментарий">
            <Textarea
              onChange={(event) => set({ comment: event.target.value })}
              rows={2}
              value={form.comment}
            />
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-2">
            <Button
              disabled={createTxn.isPending || updateTxn.isPending}
              onClick={() => void save()}
            >
              {isCreate ? 'Добавить' : 'Сохранить'}
            </Button>
            <Button onClick={onClose} variant="outline">
              Отмена
            </Button>
            {txn && (
              <Button
                className="ml-auto"
                onClick={() => {
                  if (window.confirm('Удалить операцию?')) {
                    deleteTxn.mutate(txn.id)
                    onClose()
                  }
                }}
                variant="destructive"
              >
                Удалить
              </Button>
            )}
          </div>
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
