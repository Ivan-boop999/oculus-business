import { useState } from 'react'
import { Link } from '@tanstack/react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Txn } from '@oculus-business/contracts'
import { currentMonthKey, formatMoney, monthLabel } from '@/platform/format'

import { useSummaryQuery, useTxnsQuery } from './queries'
import { TxnSheet } from './TxnSheet'

const INCOME_CATEGORIES = [
  'Подписка',
  'Возмездное обследование',
  'Внедрение (Setup)',
  'Производственный консалтинг',
  'Интеграции',
  'Прочее',
]

const EXPENSE_CATEGORIES = [
  'Сервер / хостинг',
  'Обслуживание ООО',
  'Зарплата',
  'Реклама',
  'Софт и сервисы',
  'Юристы',
  'Логистика',
  'Налоги',
  'Прочее',
]

export { INCOME_CATEGORIES, EXPENSE_CATEGORIES }

/// Финансы за месяц: сводка, список операций, быстрое добавление, ссылки на
/// регулярные платежи и прогноз.
export function FinancePage() {
  const [month, setMonth] = useState(currentMonthKey())
  const [selectedTxn, setSelectedTxn] = useState<Txn | null>(null)
  const [creating, setCreating] = useState(false)

  const txns = useTxnsQuery(month)
  const summary = useSummaryQuery(month)

  const months = txns.data?.months ?? [month]

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr] lg:items-start lg:gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight text-white lg:text-2xl">Финансы</h1>
        <select
          aria-label="Месяц"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          onChange={(event) => setMonth(event.target.value)}
          value={month}
        >
          {months.map((item) => (
            <option key={item} value={item}>
              {monthLabel(item)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Tile
          label="Доход"
          loading={summary.isPending}
          tone="text-[#34D399]"
          value={summary.data ? formatMoney(summary.data.income) : '—'}
        />
        <Tile
          label="Расход"
          loading={summary.isPending}
          tone="text-[#FB7185]"
          value={summary.data ? formatMoney(summary.data.expense) : '—'}
        />
        <Tile
          label="Итог"
          loading={summary.isPending}
          tone={
            (summary.data?.net ?? 0) >= 0
              ? 'text-[#34D399]'
              : 'text-[#FB7185]'
          }
          value={summary.data ? formatMoney(summary.data.net) : '—'}
        />
      </div>

      <div className="grid gap-3 lg:contents">
      {summary.data && (
        <div className="flex flex-wrap gap-2 lg:flex-col lg:items-start">
          <Badge variant="secondary">Баланс: {formatMoney(summary.data.balance)}</Badge>
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            MRR: {formatMoney(summary.data.mrr)}/мес
          </Badge>
          <Badge variant="outline">
            Регулярно: +{formatMoney(summary.data.activeRecurringIncome)} / −
            {formatMoney(summary.data.activeRecurringExpense)}
          </Badge>
        </div>
      )}

      <div className="flex gap-2 lg:flex-col lg:items-stretch">
        <Button asChild size="sm" variant="outline">
          <Link to="/app/finance/recurring">Регулярные платежи</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/app/finance/forecast">Прогноз и runway</Link>
        </Button>
      </div>
      </div>

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold">Операции месяца</h2>
        {txns.isPending && <p className="text-sm text-muted-foreground">Загружаем…</p>}
        {txns.isError && <p className="text-sm text-destructive">Ошибка загрузки операций</p>}
        {txns.data?.items.length === 0 && (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            В этом месяце операций нет. Нажмите «+», чтобы добавить доход или расход.
          </p>
        )}
        {/* ПК: таблица операций */}
        <div className="hidden overflow-x-auto rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.035] to-transparent lg:block">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-white/[0.04] text-left text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Дата</th>
                <th className="px-3 py-2 font-medium">Категория</th>
                <th className="px-3 py-2 font-medium">Комментарий</th>
                <th className="px-3 py-2 text-right font-medium">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {(txns.data?.items ?? []).map((txn) => (
                <tr
                  className="cursor-pointer border-t border-white/5 transition-colors hover:bg-[rgba(99,102,241,0.07)]"
                  key={txn.id}
                  onClick={() => setSelectedTxn(txn)}
                >
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">{txn.occurredOn}</td>
                  <td className="px-3 py-2 font-medium">{txn.category}</td>
                  <td className="max-w-72 truncate px-3 py-2 text-muted-foreground">{txn.comment ?? '—'}</td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${
                      txn.kind === 'income'
                        ? 'text-[#34D399]'
                        : 'text-[#FB7185]'
                    }`}
                  >
                    {txn.kind === 'income' ? '+' : '−'}{formatMoney(txn.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Телефон: список */}
        <div className="lg:hidden">
        {txns.data?.items.map((txn) => (
          <button
            className="flex items-center gap-3 rounded-xl border border-white/6 bg-[#101724] p-3 text-left transition-all hover:border-[#6366F1]/35"
            key={txn.id}
            onClick={() => setSelectedTxn(txn)}
          >
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full text-base ${
                txn.kind === 'income'
                  ? 'border border-[#34D399]/25 bg-[#34D399]/12 text-[#34D399]'
                  : 'border border-[#F43F5E]/25 bg-[#F43F5E]/12 text-[#FB7185]'
              }`}
            >
              {txn.kind === 'income' ? '↓' : '↑'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{txn.category}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {txn.comment ?? '—'}
              </span>
            </span>
            <span
              className={`shrink-0 text-sm font-semibold ${
                txn.kind === 'income'
                  ? 'text-[#34D399]'
                  : 'text-[#FB7185]'
              }`}
            >
              {txn.kind === 'income' ? '+' : '−'}
              {formatMoney(txn.amount)}
            </span>
          </button>
        ))}
        </div>
      </section>

      <Button
        className="fixed right-4 bottom-20 z-30 h-14 w-14 rounded-full bg-gradient-to-br from-[#7B5CFA] to-[#4338CA] text-2xl text-white shadow-[0_8px_32px_-6px_rgba(99,102,241,0.7)] transition-transform hover:scale-105 active:scale-95 lg:bottom-6"
        onClick={() => setCreating(true)}
        size="icon-lg"
      >
        +
      </Button>

      <TxnSheet
        onClose={() => {
          setSelectedTxn(null)
          setCreating(false)
        }}
        open={selectedTxn !== null || creating}
        txn={selectedTxn}
      />
    </div>
  )
}

function Tile({
  label,
  loading,
  tone,
  value,
}: {
  label: string
  loading: boolean
  tone: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-4">
      <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={`mt-1.5 text-xl font-bold tracking-tight tabular-nums ${
          loading ? 'text-muted-foreground' : tone
        }`}
      >
        {loading ? '…' : value}
      </p>
    </div>
  )
}
