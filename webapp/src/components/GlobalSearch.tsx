import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { companiesResponseSchema } from '@oculus-business/contracts'
import { useAuth } from '@/features/auth'
import { useCrmBoardQuery } from '@/features/crm'
import { useDevBoardQuery } from '@/features/devboard'
import { useTxnsQuery } from '@/features/finance'
import { currentMonthKey, formatMoneyShort } from '@/platform/format'
import { useIsDesktop } from '@/platform/use-is-desktop'

/// Глобальный поиск Ctrl+K (Cmd+K): сделки, задачи и операции месяца — по подстроке.
/// Данные берёт из закэшированных запросов, без отдельного бэкенд-эндпоинта.
export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const crm = useCrmBoardQuery()
  const dev = useDevBoardQuery()
  const txns = useTxnsQuery(currentMonthKey())
  const { transport } = useAuth()
  const companies = useQuery({
    queryKey: ['crm', 'companies'],
    queryFn: ({ signal }) =>
      transport.request('/api/crm/companies', companiesResponseSchema, { signal }),
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const needle = query.trim().toLowerCase()

  const results = useMemo(() => {
    if (needle.length < 2) return { companies: [], deals: [], tasks: [], operations: [] }
    const matchedCompanies = (companies.data?.items ?? [])
      .filter((company) => company.name.toLowerCase().includes(needle))
      .slice(0, 4)
    const deals = (crm.data?.stages ?? [])
      .flatMap((stage) => stage.deals.map((deal) => ({ deal, stage: stage.title })))
      .filter(({ deal }) => deal.title.toLowerCase().includes(needle))
      .slice(0, 6)
    const tasks = (dev.data?.columns ?? [])
      .flatMap((column) => column.tasks.map((task) => ({ task, column: column.title })))
      .filter(({ task }) => task.title.toLowerCase().includes(needle))
      .slice(0, 6)
    const operations = (txns.data?.items ?? [])
      .filter(
        (txn) =>
          txn.category.toLowerCase().includes(needle) ||
          (txn.comment ?? '').toLowerCase().includes(needle),
      )
      .slice(0, 6)
    return { companies: matchedCompanies, deals, tasks, operations }
  }, [needle, crm.data, dev.data, txns.data, companies.data])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className={`w-full rounded-2xl border border-white/10 bg-[#121926] shadow-2xl ${
          isDesktop ? 'max-w-xl' : 'max-w-3xl'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/8 px-4 py-3">
          <input
            className="w-full bg-transparent text-base text-white outline-none placeholder:text-muted-foreground"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск: сделки и задачи…"
            ref={inputRef}
            value={query}
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {needle.length < 2 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Введите минимум 2 символа · Esc — закрыть
            </p>
          )}
          {needle.length >= 2 &&
            results.deals.length === 0 &&
            results.tasks.length === 0 &&
            results.operations.length === 0 &&
            results.companies.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Ничего не найдено
              </p>
            )}
          {results.companies.length > 0 && (
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Контрагенты
            </p>
          )}
          {results.companies.map((company) => (
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[rgba(99,102,241,0.1)]"
              key={company.id}
              onClick={() => {
                setOpen(false)
                void navigate({ to: '/app/companies' })
              }}
            >
              <span className="text-[#A5B4FC]">◉</span>
              <span className="min-w-0 flex-1 truncate text-white">{company.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {company.dealsCount} сделок
              </span>
            </button>
          ))}
          {results.deals.length > 0 && (
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Сделки
            </p>
          )}
          {results.deals.map(({ deal, stage }) => (
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[rgba(99,102,241,0.1)]"
              key={deal.id}
              onClick={() => {
                setOpen(false)
                void navigate({ to: '/app/crm' })
              }}
            >
              <span className="text-[#A5B4FC]">◉</span>
              <span className="min-w-0 flex-1 truncate text-white">{deal.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{stage}</span>
            </button>
          ))}
          {results.tasks.length > 0 && (
            <p className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Задачи
            </p>
          )}
          {results.tasks.map(({ task, column }) => (
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[rgba(99,102,241,0.1)]"
              key={task.id}
              onClick={() => {
                setOpen(false)
                void navigate({ to: '/app/tasks' })
              }}
            >
              <span className="text-[#A5B4FC]">{task.type === 'bug' ? '🐞' : task.type === 'idea' ? '💡' : '🚀'}</span>
              <span className="min-w-0 flex-1 truncate text-white">{task.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{column}</span>
            </button>
          ))}
          {results.operations.length > 0 && (
            <p className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Операции месяца
            </p>
          )}
          {results.operations.map((txn) => (
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[rgba(99,102,241,0.1)]"
              key={txn.id}
              onClick={() => {
                setOpen(false)
                void navigate({ to: '/app/finance' })
              }}
            >
              <span className={txn.kind === 'income' ? 'text-[#34D399]' : 'text-[#FB7185]'}>
                {txn.kind === 'income' ? '↓' : '↑'}
              </span>
              <span className="min-w-0 flex-1 truncate text-white">{txn.category}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {txn.kind === 'income' ? '+' : '−'}
                {formatMoneyShort(txn.amount)} · {txn.occurredOn.slice(8)}.{txn.occurredOn.slice(5, 7)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
