import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  cashflowHistoryResponseSchema,
  createExpectedPaymentRequestSchema,
  expectedPaymentsResponseSchema,
  mrrMovementResponseSchema,
} from '@oculus-business/contracts'
import { Link } from '@tanstack/react-router'

import { useAuth } from '@/features/auth'
import { dateLabel, formatMoneyShort, monthLabel, todayDateOnly } from '@/platform/format'

/// Аналитика финансов: денежный поток за 12 месяцев, движение MRR и дебиторка
/// (ожидаемые поступления). Компонент тяжеловат для одного файла намеренно:
/// это одна функциональная зона «аналитика» на странице Финансы.
export function FinanceAnalytics() {
  return (
    <>
      <CashflowChart />
      <MrrMovementChart />
      <ExpectedPayments />
    </>
  )
}

function CashflowChart() {
  const { transport } = useAuth()
  const history = useQuery({
    queryKey: ['finance', 'cashflow', 12],
    queryFn: ({ signal }) =>
      transport.request('/api/finance/history?months=12', cashflowHistoryResponseSchema, {
        signal,
      }),
  })
  const months = history.data?.months ?? []
  const max = Math.max(...months.map((month) => Math.max(month.income, month.expense)), 1)

  return (
    <section className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        Денежный поток · 12 месяцев
      </h2>
      {months.length === 0 ? (
        <p className="text-xs text-muted-foreground">Загружаем…</p>
      ) : (
        <div className="flex h-36 items-end gap-1.5 lg:gap-2.5">
          {months.map((month) => (
            <div className="group flex h-full flex-1 flex-col justify-end gap-0.5" key={month.month}>
              <span className="mb-0.5 text-center text-[9px] leading-none text-muted-foreground tabular-nums opacity-0 transition-opacity group-hover:opacity-100 lg:opacity-100">
                {month.income > 0 ? formatMoneyShort(month.income) : ''}
              </span>
              <div
                className="w-full rounded-t-sm bg-gradient-to-t from-[#34D399]/40 to-[#34D399]"
                style={{ height: `${Math.max(2, (month.income / max) * 100)}%` }}
                title={`${monthLabel(month.month)}: доход ${formatMoneyShort(month.income)}`}
              />
              <div
                className="w-full rounded-b-sm bg-gradient-to-b from-[#F43F5E]/60 to-[#F43F5E]/30"
                style={{ height: `${Math.max(2, (month.expense / max) * 100)}%` }}
                title={`${monthLabel(month.month)}: расход ${formatMoneyShort(month.expense)}`}
              />
              <span className="mt-1 text-center text-[9px] leading-none text-muted-foreground">
                {month.month.slice(5)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-[#34D399]" /> доход
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-[#F43F5E]/60" /> расход
        </span>
      </div>
    </section>
  )
}

function MrrMovementChart() {
  const { transport } = useAuth()
  const movement = useQuery({
    queryKey: ['finance', 'mrr-movement', 12],
    queryFn: ({ signal }) =>
      transport.request('/api/finance/mrr-movement?months=12', mrrMovementResponseSchema, {
        signal,
      }),
  })
  const months = movement.data?.months ?? []
  const maxTotal = Math.max(...months.map((month) => month.totalMrr), 1)

  return (
    <section className="rounded-2xl border border-[#6366F1]/20 bg-gradient-to-br from-[#6366F1]/[0.08] via-white/[0.02] to-transparent p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold tracking-[0.1em] text-[#A5B4FC] uppercase">
          Движение MRR
        </h2>
        <span className="text-sm font-bold text-white tabular-nums">
          {months.length > 0 ? `${formatMoneyShort(months[months.length - 1]!.totalMrr)}/мес` : '—'}
        </span>
      </div>
      {months.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Пока нет данных: движение появится, когда сделки начнут попадать в этап «Действующий
          клиент».
        </p>
      ) : (
        <div className="grid gap-1">
          {months.map((month) => (
            <div className="flex items-center gap-2" key={month.month}>
              <span className="w-16 shrink-0 text-[10px] text-muted-foreground tabular-nums">
                {month.month.slice(5)}.{month.month.slice(2, 4)}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#7B5CFA] to-[#4338CA] shadow-[0_0_8px_rgba(99,102,241,0.4)] transition-all"
                  style={{ width: `${Math.max(1, (month.totalMrr / maxTotal) * 100)}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
                {month.newMrr > 0 && <span className="text-[#34D399]">+{formatMoneyShort(month.newMrr)}</span>}
                {month.churnedMrr > 0 && <span className="text-[#FB7185]"> −{formatMoneyShort(month.churnedMrr)}</span>}
                {month.newMrr === 0 && month.churnedMrr === 0 && '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ExpectedPayments() {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    title: '',
    invoiceNumber: '',
    amount: '',
    dueDate: '',
    probability: '80',
  })
  const [error, setError] = useState<string | null>(null)

  const payments = useQuery({
    queryKey: ['finance', 'expected'],
    queryFn: ({ signal }) =>
      transport.request('/api/finance/expected', expectedPaymentsResponseSchema, { signal }),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['finance'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const received = useMutation({
    mutationFn: (id: string) =>
      // 204 без тела — забираем через raw, парсинг JSON не нужен.
      transport.raw(`/api/finance/expected/${id}/received`, { method: 'POST' }),
    onSuccess: () => invalidate(),
  })

  const save = async () => {
    const amount = Number(form.amount)
    if (!form.title.trim() || !Number.isFinite(amount) || amount < 1 || !form.dueDate) {
      setError('Заполните название, сумму и дату')
      return
    }
    try {
      await transport.request(
        '/api/finance/expected',
        expectedPaymentsResponseSchema,
        {
          method: 'POST',
          body: createExpectedPaymentRequestSchema.parse({
            title: form.title.trim(),
            invoiceNumber: form.invoiceNumber.trim() || null,
            amount,
            dueDate: form.dueDate,
            probability: Number(form.probability) || 80,
          }),
        },
      )
      setCreating(false)
      setForm({ title: '', invoiceNumber: '', amount: '', dueDate: '', probability: '80' })
      setError(null)
      invalidate()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить')
    }
  }

  const items = payments.data?.items ?? []

  return (
    <section className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          Ожидаемые поступления · дебиторка
        </h2>
        <button
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-[#6366F1]/40 hover:text-white"
          onClick={() => setCreating((value) => !value)}
        >
          {creating ? 'Отмена' : '+ Ожидание'}
        </button>
      </div>

      {creating && (
        <div className="mb-3 grid gap-2 rounded-xl border border-[#6366F1]/25 bg-[#6366F1]/8 p-3">
          <Input
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Счёт: за что (например, «ВБ, этап 2»)"
            value={form.title}
          />
          <Input
            onChange={(event) => setForm((prev) => ({ ...prev, invoiceNumber: event.target.value }))}
            placeholder="№ счёта (необязательно)"
            value={form.invoiceNumber}
          />
          <div className="grid grid-cols-3 gap-2">
            <Input
              inputMode="numeric"
              onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
              placeholder="Сумма, ₽"
              value={form.amount}
            />
            <Input
              onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
              type="date"
              value={form.dueDate || todayDateOnly()}
            />
            <Input
              inputMode="numeric"
              onChange={(event) => setForm((prev) => ({ ...prev, probability: event.target.value }))}
              placeholder="Вероятность %"
              value={form.probability}
            />
          </div>
          {error && <p className="text-xs text-[#FB7185]">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={() => void save()} size="sm">
              Добавить
            </Button>
            <Button onClick={() => setCreating(false)} size="sm" variant="outline">
              Отмена
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-muted-foreground">
          Выставленных счетов нет. Добавьте ожидаемое поступление — оно попадёт в прогноз с
          коэффициентом вероятности.
        </p>
      ) : (
        <div className="grid gap-2">
          {items.map((payment) => (
            <div
              className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.025] px-3 py-2.5"
              key={payment.id}
            >
              <span className="grid shrink-0 rounded-md border border-[#6366F1]/30 bg-[#6366F1]/12 px-2 py-1 text-[11px] font-semibold text-[#A5B4FC] tabular-nums">
                {dateLabel(payment.dueDate)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">
                  {payment.title}
                  {payment.invoiceNumber && (
                    <span className="ml-1.5 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground tabular-nums">
                      № {payment.invoiceNumber}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">
                  вероятность {payment.probability}% · в прогнозе{' '}
                  {formatMoneyShort(Math.round((payment.amount * payment.probability) / 100))}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-[#34D399] tabular-nums">
                {formatMoneyShort(payment.amount)}
              </span>
              <button
                className="shrink-0 rounded-lg border border-[#34D399]/30 bg-[#34D399]/10 px-2.5 py-1.5 text-[11px] font-medium text-[#34D399] transition-colors hover:bg-[#34D399]/20"
                disabled={received.isPending}
                onClick={() => received.mutate(payment.id)}
                title="Создать доход и убрать из списка"
              >
                Получено
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        В баланс не входят (кассовый метод), учитываются в{' '}
        <Link className="text-[#A5B4FC] hover:text-white" to="/app/finance/forecast">
          прогнозе
        </Link>
        .
      </p>
    </section>
  )
}
