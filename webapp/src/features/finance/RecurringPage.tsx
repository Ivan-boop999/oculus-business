import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { RecurringItem } from '@oculus-business/contracts'
import { formatMoney, todayDateOnly } from '@/platform/format'
import { useIsDesktop } from '@/platform/use-is-desktop'

import {
  useCreateRecurringMutation,
  useCreateTxnMutation,
  useDeleteRecurringMutation,
  useRecurringQuery,
  useSaveSettingsMutation,
  useSettingsQuery,
  useUpdateRecurringMutation,
} from './queries'

/// Регулярные ежемесячные платежи + стартовый остаток (точка отсчёта баланса).
export function RecurringPage() {
  const recurring = useRecurringQuery()
  const settings = useSettingsQuery()
  const [selected, setSelected] = useState<RecurringItem | null>(null)
  const [creating, setCreating] = useState(false)

  const income = recurring.data?.items.filter((item) => item.kind === 'income') ?? []
  const expense = recurring.data?.items.filter((item) => item.kind === 'expense') ?? []

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight text-white lg:text-2xl">Регулярные платежи</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Ежемесячные доходы и расходы. Попадают в прогноз каждого месяца, пока активны.
      </p>

      {settings.data && <BalanceForm initial={settings.data.settings} />}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Section title="Доходы каждый месяц">
          {income.map((item) => (
            <Row item={item} key={item.id} onSelect={() => setSelected(item)} />
          ))}
          {income.length === 0 && <Empty text="Регулярных доходов нет" />}
        </Section>

        <Section title="Расходы каждый месяц">
          {expense.map((item) => (
            <Row item={item} key={item.id} onSelect={() => setSelected(item)} />
          ))}
          {expense.length === 0 && <Empty text="Регулярных расходов нет" />}
        </Section>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => setCreating(true)}>+ Регулярный платёж</Button>
        <Button asChild variant="outline">
          <Link to="/app/finance">← Операции</Link>
        </Button>
      </div>

      <RecurringSheet
        item={selected}
        onClose={() => {
          setSelected(null)
          setCreating(false)
        }}
        open={selected !== null || creating}
      />
    </div>
  )
}

function Row({ item, onSelect }: { item: RecurringItem; onSelect: () => void }) {
  const createTxn = useCreateTxnMutation()
  const justPaid =
    createTxn.isSuccess && createTxn.variables?.category === item.category

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/6 bg-[#101724] p-3 transition-all hover:border-[#6366F1]/35">
      <button className="min-w-0 flex-1 text-left" onClick={onSelect}>
        <span className="block truncate text-sm font-medium">{item.category}</span>
        <span className="block text-xs text-muted-foreground">
          {item.dayOfMonth}-е число
          {item.activeUntil ? ` · до ${item.activeUntil}` : ' · бессрочно'}
          {item.comment ? ` · ${item.comment}` : ''}
        </span>
      </button>
      <span
        className={`shrink-0 text-sm font-semibold ${
          item.kind === 'income'
            ? 'text-[#34D399]'
            : 'text-[#FB7185]'
        }`}
      >
        {item.kind === 'income' ? '+' : '−'}
        {formatMoney(item.amount)}
      </span>
      <button
        className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
          justPaid
            ? 'border-[#34D399]/40 bg-[#34D399]/15 text-[#34D399]'
            : 'border-white/10 bg-white/5 text-muted-foreground hover:border-[#6366F1]/40 hover:text-white'
        }`}
        disabled={createTxn.isPending}
        onClick={() =>
          createTxn.mutate({
            kind: item.kind,
            amount: item.amount,
            occurredOn: todayDateOnly(),
            category: item.category,
            comment: `Регулярный платеж (${item.dayOfMonth}-е число)`,
          })
        }
        title="Создать факт операции за сегодня"
      >
        {createTxn.isPending ? '…' : justPaid ? '✓ Оплачено' : 'Отметить оплату'}
      </button>
    </div>
  )
}

function BalanceForm({
  initial,
}: {
  initial: { openingBalance: number; openingBalanceDate: string }
}) {
  const save = useSaveSettingsMutation()
  const [balance, setBalance] = useState(String(initial.openingBalance))
  const [date, setDate] = useState(initial.openingBalanceDate)

  return (
    <div className="grid gap-2 rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-4">
      <h2 className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Стартовый остаток</h2>
      <p className="text-xs text-muted-foreground">
        Сколько денег было на счетах на эту дату. Баланс = стартовый остаток + все операции с этой
        даты.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Input
          inputMode="numeric"
          onChange={(event) => setBalance(event.target.value)}
          value={balance}
        />
        <Input onChange={(event) => setDate(event.target.value)} type="date" value={date} />
      </div>
      <Button
        disabled={save.isPending}
        onClick={() =>
          save.mutate({
            openingBalance: Number(balance) || 0,
            openingBalanceDate: date || todayDateOnly(),
          })
        }
        size="sm"
        variant="outline"
      >
        {save.isSuccess ? 'Сохранено ✓' : 'Сохранить'}
      </Button>
    </div>
  )
}

type RecurringFormState = {
  kind: 'income' | 'expense'
  amount: string
  category: string
  dayOfMonth: string
  activeFrom: string
  activeUntil: string
  comment: string
}

const emptyRecurringForm: RecurringFormState = {
  kind: 'expense',
  amount: '',
  category: '',
  dayOfMonth: '1',
  activeFrom: '',
  activeUntil: '',
  comment: '',
}

function RecurringSheet({
  item,
  onClose,
  open,
}: {
  item: RecurringItem | null
  onClose: () => void
  open: boolean
}) {
  const isCreate = item === null
  const [form, setForm] = useState<RecurringFormState>({
    ...emptyRecurringForm,
    activeFrom: todayDateOnly(),
  })
  const [error, setError] = useState<string | null>(null)
  const isDesktop = useIsDesktop()

  useEffect(() => {
    if (!open) return
    setError(null)
    if (item !== null) {
      setForm({
        kind: item.kind,
        amount: String(item.amount),
        category: item.category,
        dayOfMonth: String(item.dayOfMonth),
        activeFrom: item.activeFrom,
        activeUntil: item.activeUntil ?? '',
        comment: item.comment ?? '',
      })
    } else {
      setForm({ ...emptyRecurringForm, activeFrom: todayDateOnly() })
    }
  }, [open, item])

  const create = useCreateRecurringMutation()
  const update = useUpdateRecurringMutation()
  const deleteItem = useDeleteRecurringMutation()

  const set = (patch: Partial<RecurringFormState>) => setForm((prev) => ({ ...prev, ...patch }))

  const save = async () => {
    const amount = Number(form.amount)
    if (!form.category.trim() || !Number.isFinite(amount) || amount < 1) {
      setError('Укажите категорию и сумму')
      return
    }
    const input = {
      kind: form.kind,
      amount,
      category: form.category.trim(),
      dayOfMonth: Math.min(31, Math.max(1, Number(form.dayOfMonth) || 1)),
      activeFrom: form.activeFrom || todayDateOnly(),
      activeUntil: form.activeUntil || null,
      comment: form.comment.trim() || undefined,
    }
    try {
      if (isCreate) {
        await create.mutateAsync(input)
      } else {
        await update.mutateAsync({ id: item.id, input })
      }
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить')
    }
  }

  return (
    <Sheet onOpenChange={(next) => (!next ? onClose() : undefined)} open={open}>
      <SheetContent
        className={isDesktop ? "inset-y-0 right-0 h-full w-full gap-0 overflow-y-auto sm:max-w-lg lg:max-w-lg" : "mx-auto max-h-[92svh] max-w-3xl overflow-y-auto rounded-t-2xl"}
        side={isDesktop ? "right" : "bottom"}
      >
        <SheetHeader className="pb-0">
          <SheetTitle>
            {isCreate ? 'Новый регулярный платёж' : 'Изменить регулярный платёж'}
          </SheetTitle>
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
            <Field label="Сумма, ₽/мес">
              <Input
                inputMode="numeric"
                onChange={(event) => set({ amount: event.target.value })}
                value={form.amount}
              />
            </Field>
            <Field label="День месяца">
              <Input
                inputMode="numeric"
                max={31}
                min={1}
                onChange={(event) => set({ dayOfMonth: event.target.value })}
                value={form.dayOfMonth}
              />
            </Field>
          </div>
          <Field label="Категория">
            <Input
              onChange={(event) => set({ category: event.target.value })}
              placeholder="Сервер / хостинг"
              value={form.category}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Действует с">
              <Input
                onChange={(event) => set({ activeFrom: event.target.value })}
                type="date"
                value={form.activeFrom}
              />
            </Field>
            <Field label="Действует до (необязательно)">
              <Input
                onChange={(event) => set({ activeUntil: event.target.value })}
                type="date"
                value={form.activeUntil}
              />
            </Field>
          </div>
          <Field label="Комментарий">
            <Input
              onChange={(event) => set({ comment: event.target.value })}
              value={form.comment}
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <Button disabled={create.isPending || update.isPending} onClick={() => void save()}>
              {isCreate ? 'Добавить' : 'Сохранить'}
            </Button>
            <Button onClick={onClose} variant="outline">
              Отмена
            </Button>
            {item && (
              <Button
                className="ml-auto"
                onClick={() => {
                  if (window.confirm('Удалить регулярный платёж?')) {
                    deleteItem.mutate(item.id)
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

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground">
      {text}
    </p>
  )
}


function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className='grid gap-1.5'>
      <span className='text-xs text-muted-foreground'>{label}</span>
      {children}
    </div>
  )
}
