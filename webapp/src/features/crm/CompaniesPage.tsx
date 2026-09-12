import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  companiesResponseSchema,
  companyResponseSchema,
  createCompanyRequestSchema,
} from '@oculus-business/contracts'
import { useAuth } from '@/features/auth'
import { useCrmBoardQuery } from '@/features/crm'
import { formatMoneyShort } from '@/platform/format'

/// Справочник контрагентов: список компаний с числом сделок и активным MRR,
/// раскрытие — сделки компании; создание новой компании.
export function CompaniesPage() {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const companies = useQuery({
    queryKey: ['crm', 'companies'],
    queryFn: ({ signal }) =>
      transport.request('/api/crm/companies', companiesResponseSchema, { signal }),
  })
  const board = useCrmBoardQuery()

  const create = useMutation({
    mutationFn: (input: { name: string }) =>
      transport.request('/api/crm/companies', companyResponseSchema, {
        method: 'POST',
        body: createCompanyRequestSchema.parse(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'companies'] })
      setCreating(false)
      setName('')
      setError(null)
    },
    onError: (caught) => {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать')
    },
  })

  const items = companies.data?.items ?? []

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight text-white lg:text-2xl">
          Контрагенты
        </h1>
        <Button onClick={() => setCreating((value) => !value)} size="sm" variant="outline">
          {creating ? 'Отмена' : '+ Контрагент'}
        </Button>
      </div>

      {creating && (
        <div className="grid gap-2 rounded-2xl border border-[#6366F1]/25 bg-[#6366F1]/8 p-3">
          <Input
            onChange={(event) => setName(event.target.value)}
            placeholder="Название компании"
            value={name}
          />
          {error && <p className="text-xs text-[#FB7185]">{error}</p>}
          <div className="flex gap-2">
            <Button
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate({ name: name.trim() })}
              size="sm"
            >
              Создать
            </Button>
            <Button onClick={() => setCreating(false)} size="sm" variant="outline">
              Отмена
            </Button>
          </div>
        </div>
      )}

      {companies.isPending && (
        <p className="py-8 text-center text-sm text-muted-foreground">Загружаем…</p>
      )}

      {items.length === 0 && !companies.isPending && (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-muted-foreground">
          Контрагентов пока нет — они появятся из карточек сделок автоматически.
        </p>
      )}

      <div className="grid gap-2">
        {items.map((company) => {
          const expanded = expandedId === company.id
          const deals =
            (board.data?.stages ?? []).flatMap((stage) =>
              stage.deals
                .filter((deal) => deal.companyId === company.id)
                .map((deal) => ({ deal, stage: stage.title })),
            ) ?? []
          return (
            <div
              className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4"
              key={company.id}
            >
              <button
                className="flex w-full items-center gap-3 text-left"
                onClick={() => setExpandedId(expanded ? null : company.id)}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#7B5CFA]/30 to-[#4338CA]/30 text-sm font-bold text-[#A5B4FC]">
                  {company.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">
                    {company.name}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    сделок: {company.dealsCount}
                    {company.activeMrr > 0 ? ` · активный MRR ${formatMoneyShort(company.activeMrr)}/мес` : ''}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
                >
                  ›
                </span>
              </button>

              {expanded && (
                <div className="mt-3 grid gap-1.5 border-t border-white/6 pt-3">
                  {deals.length === 0 && (
                    <p className="text-xs text-muted-foreground">Сделок пока нет</p>
                  )}
                  {deals.map(({ deal, stage }) => (
                    <div
                      className="flex items-center gap-2 rounded-xl border border-white/6 bg-[#101724] px-3 py-2 text-sm"
                      key={deal.id}
                    >
                      <span className="min-w-0 flex-1 truncate text-white">{deal.title}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{stage}</span>
                      {deal.monthlyAmount > 0 && (
                        <span className="shrink-0 text-[11px] text-[#34D399] tabular-nums">
                          {formatMoneyShort(deal.monthlyAmount)}/мес
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
