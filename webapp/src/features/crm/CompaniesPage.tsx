import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Company, ImportPreviewResponse } from '@oculus-business/contracts'
import { formatMoneyShort } from '@/platform/format'

import {
  useCompaniesQuery,
  useCreateCompanyMutation,
  useImportApplyMutation,
  useImportPreviewMutation,
} from './sales-queries'
import { CompanySheet } from './CompanySheet'

const RESEARCH_LABELS: Record<string, string> = {
  selected: 'отобрана',
  reaching: 'выходим',
  dialogue: 'диалог',
  nurture: 'ведение',
  disqualified: 'дисквал.',
}

const RELATION_LABELS: Record<string, string> = {
  prospect: 'перспективная',
  customer: 'клиент',
  partner: 'партнёр',
  excluded: 'исключена',
}

/// Экран 1 ТЗ: список компаний с поиском и фильтрами, создание компании без сделки,
/// карточка компании, импорт очереди pipeline.json с предпросмотром и протоколом.
export function CompaniesPage() {
  const [search, setSearch] = useState('')
  const [researchStatus, setResearchStatus] = useState<string>('')
  const [relationStatus, setRelationStatus] = useState<string>('')
  const [dnc, setDnc] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Company | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const query = {
    ...(search.trim() !== '' ? { search: search.trim() } : {}),
    ...(researchStatus !== '' ? { researchStatus } : {}),
    ...(relationStatus !== '' ? { relationStatus } : {}),
    ...(dnc !== '' ? { dnc } : {}),
    limit: 100,
    offset: 0,
  }
  const companies = useCompaniesQuery(query)
  const items = companies.data?.items ?? []

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight text-white lg:text-2xl">Контрагенты</h1>
        <Button onClick={() => setImportOpen((value) => !value)} size="sm" variant="outline">
          Импорт очереди
        </Button>
        <Button onClick={() => setCreating((value) => !value)} size="sm">
          {creating ? 'Отмена' : '+ Компания'}
        </Button>
      </div>

      {importOpen && <ImportPanel onClose={() => setImportOpen(false)} />}

      {creating && <CreateCompanyForm onDone={() => setCreating(false)} />}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск: название, домен, ИНН, регион…"
          value={search}
        />
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          onChange={(event) => setResearchStatus(event.target.value)}
          value={researchStatus}
        >
          <option value="">Статус исследования: все</option>
          {Object.entries(RESEARCH_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          onChange={(event) => setRelationStatus(event.target.value)}
          value={relationStatus}
        >
          <option value="">Отношение: все</option>
          {Object.entries(RELATION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          onChange={(event) => setDnc(event.target.value)}
          value={dnc}
        >
          <option value="">Запрет контакта: любой</option>
          <option value="active">Действует</option>
          <option value="none">Нет</option>
        </select>
      </div>

      {companies.isPending && <p className="py-8 text-center text-sm text-muted-foreground">Загружаем…</p>}
      {companies.isError && (
        <div className="grid gap-3 py-8 text-center">
          <p className="text-sm text-destructive">Не удалось загрузить контрагентов</p>
          <Button className="mx-auto" onClick={() => void companies.refetch()} variant="outline">
            Повторить
          </Button>
        </div>
      )}

      {items.length === 0 && !companies.isPending && (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-muted-foreground">
          Компаний не найдено. Добавьте предприятие из исследования — сделка не обязательна.
        </p>
      )}

      <div className="grid gap-2">
        {items.map((company) => (
          <button
            className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4 text-left transition-colors hover:border-[#6366F1]/40"
            key={company.id}
            onClick={() => setSelected(company)}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#7B5CFA]/30 to-[#4338CA]/30 text-sm font-bold text-[#A5B4FC]">
                {company.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">
                  {company.name}
                  {company.domain !== null ? ` · ${company.domain}` : ''}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {RESEARCH_LABELS[company.researchStatus] ?? company.researchStatus} ·{' '}
                  {RELATION_LABELS[company.relationStatus] ?? company.relationStatus}
                  {company.region !== null ? ` · ${company.region}` : ''}
                  {company.segment !== null ? ` · ${company.segment}` : ''}
                  {` · сделок: ${company.dealsCount}`}
                  {company.activeMrr > 0 ? ` · MRR ${formatMoneyShort(company.activeMrr)}/мес` : ''}
                  {company.contactsCount > 0 ? ` · контактов: ${company.contactsCount}` : ''}
                  {company.openTasksCount > 0 ? ` · задач: ${company.openTasksCount}` : ''}
                </span>
              </span>
              {company.doNotContact && (
                <Badge className="shrink-0 border-[#F43F5E]/25 bg-[#F43F5E]/10 text-[#FB7185]">запрет</Badge>
              )}
            </div>
          </button>
        ))}
      </div>

      <CompanySheet company={selected} onClose={() => setSelected(null)} open={selected !== null} />
    </div>
  )
}

function CreateCompanyForm({ onDone }: { onDone: () => void }) {
  const create = useCreateCompanyMutation()
  const [allowDomainDuplicate, setAllowDomainDuplicate] = useState(false)
  const [domainWarning, setDomainWarning] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    website: '',
    region: '',
    segment: '',
    researchSource: '',
    selectionReason: '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }))
  return (
    <div className="grid gap-2 rounded-2xl border border-[#6366F1]/25 bg-[#6366F1]/8 p-3">
      <p className="text-xs text-muted-foreground">
        Компания существует до сделки: неизвестное можно оставить пустым и заполнить по ходу исследования.
      </p>
      <Input onChange={(event) => set({ name: event.target.value })} placeholder="Название компании *" value={form.name} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input onChange={(event) => set({ website: event.target.value })} placeholder="Официальный сайт" value={form.website} />
        <Input onChange={(event) => set({ region: event.target.value })} placeholder="Регион / площадка" value={form.region} />
        <Input onChange={(event) => set({ segment: event.target.value })} placeholder="Сегмент" value={form.segment} />
        <Input onChange={(event) => set({ researchSource: event.target.value })} placeholder="Источник нахождения" value={form.researchSource} />
      </div>
      <Input onChange={(event) => set({ selectionReason: event.target.value })} placeholder="Причина включения в обработку" value={form.selectionReason} />
      {domainWarning !== null && (
        <div className="grid gap-1.5 rounded-lg border border-[#F59E0B]/25 bg-[#F59E0B]/8 p-2 text-xs text-[#FBBF24]">
          <p>{domainWarning}</p>
          <label className="flex items-center gap-2">
            <input
              checked={allowDomainDuplicate}
              onChange={(event) => setAllowDomainDuplicate(event.target.checked)}
              type="checkbox"
            />
            Это другое юрлицо той же группы — создать отдельную компанию
          </label>
        </div>
      )}
      {error !== null && <p className="text-xs text-[#FB7185]">{error}</p>}
      <div className="flex gap-2">
        <Button
          disabled={form.name.trim() === '' || create.isPending}
          onClick={() =>
            create.mutate(
              {
                name: form.name.trim(),
                website: form.website.trim() || null,
                region: form.region.trim() || null,
                segment: form.segment.trim() || null,
                researchSource: form.researchSource.trim() || null,
                selectionReason: form.selectionReason.trim() || null,
                researchedAt: new Date().toISOString(),
                allowDomainDuplicate,
              },
              {
                onError: (caught) => {
                  const message = caught instanceof Error ? caught.message : 'Не удалось создать'
                  if (message.includes('Домен') && message.includes('уже связан')) {
                    setDomainWarning(message)
                    setError(null)
                    return
                  }
                  setError(message)
                },
                onSuccess: onDone,
              },
            )
          }
          size="sm"
        >
          Создать
        </Button>
        <Button onClick={onDone} size="sm" variant="outline">
          Отмена
        </Button>
      </div>
    </div>
  )
}

type ImportProtocol = {
  companiesCreated: number
  companiesUpdated: number
  skipped: number
  contactsCreated: number
  channelsCreated: number
  tasksCreated: number
  draftsCreated: number
  errors: Array<{ externalId: string; error: string }>
  protocol: Array<{ externalId: string; action: string; companyId: string | null; detail: string }>
}

function ImportPanel({ onClose }: { onClose: () => void }) {
  const preview = useImportPreviewMutation()
  const apply = useImportApplyMutation()
  const [raw, setRaw] = useState('')
  const [previewData, setPreviewData] = useState<ImportPreviewResponse | null>(null)
  const [decisions, setDecisions] = useState<Record<string, 'create' | 'update' | 'skip'>>({})
  const [protocol, setProtocol] = useState<ImportProtocol | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runPreview = () => {
    setError(null)
    setProtocol(null)
    try {
      const payload = JSON.parse(raw)
      preview.mutate(payload, {
        onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка разбора'),
        onSuccess: (data) => {
          setPreviewData(data)
          const initial: Record<string, 'create' | 'update' | 'skip'> = {}
          for (const item of data.items) {
            if (item.valid) initial[item.externalId ?? ''] = item.suggestedAction
          }
          setDecisions(initial)
        },
      })
    } catch {
      setError('JSON не разобран — проверьте вставленную очередь')
    }
  }

  const runApply = () => {
    if (previewData === null) return
    apply.mutate(
      {
        payload: JSON.parse(raw),
        decisions: previewData.items
          .filter((item) => item.externalId !== null)
          .map((item) => ({
            externalId: item.externalId as string,
            action: decisions[item.externalId ?? ''] ?? 'skip',
            includeContacts: true,
            includeDrafts: true,
            includeTask: true,
          })),
      },
      {
        onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка применения'),
        onSuccess: (data) => {
          setProtocol(data)
          setPreviewData(null)
        },
      },
    )
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-[#6366F1]/25 bg-[#6366F1]/8 p-3">
      <h3 className="text-sm font-semibold text-white">Импорт очереди исследования (pipeline.json)</h3>
      <p className="text-xs text-muted-foreground">
        Совпадения показываются до записи; повторный импорт не создаёт дублей; ручные данные и запреты контакта
        не затираются. Разные юрлица одного домена не объединяются.
      </p>
      <textarea
        className="min-h-32 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
        onChange={(event) => setRaw(event.target.value)}
        placeholder="Вставьте содержимое pipeline.json…"
        value={raw}
      />
      {error !== null && <p className="text-xs text-[#FB7185]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={raw.trim() === '' || preview.isPending} onClick={runPreview} size="sm">
          Предпросмотр
        </Button>
        {previewData !== null && (
          <Button disabled={apply.isPending} onClick={runApply} size="sm" variant="secondary">
            Применить выбранные действия
          </Button>
        )}
        <Button onClick={onClose} size="sm" variant="outline">
          Закрыть
        </Button>
      </div>

      {previewData !== null && (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-1 text-xs">
            <Badge variant="secondary">всего: {previewData.summary.total}</Badge>
            <Badge className="border-[#34D399]/25 bg-[#34D399]/10 text-[#34D399]">новых: {previewData.summary.create}</Badge>
            <Badge variant="outline">дозаполнить: {previewData.summary.update}</Badge>
            <Badge variant="outline">пропустить: {previewData.summary.skip}</Badge>
            <Badge className="border-[#F43F5E]/25 bg-[#F43F5E]/10 text-[#FB7185]">невалидных: {previewData.summary.invalid}</Badge>
          </div>
          {previewData.items.map((item) => (
            <div className="rounded-xl border border-white/8 bg-[#101724] p-3 text-sm" key={item.externalId ?? item.companyName}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-white">{item.companyName}</span>
                {item.domain !== null && <span className="text-xs text-muted-foreground">{item.domain}</span>}
                <select
                  className="ml-auto h-8 rounded-md border border-input bg-background px-2 text-xs"
                  disabled={!item.valid}
                  onChange={(event) =>
                    setDecisions((prev) => ({ ...prev, [item.externalId ?? '']: event.target.value as 'create' | 'update' | 'skip' }))
                  }
                  value={decisions[item.externalId ?? ''] ?? 'skip'}
                >
                  <option value="create">создать</option>
                  <option value="update">дозаполнить пустые поля</option>
                  <option value="skip">пропустить</option>
                </select>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                совпадение: {item.match.matchedBy}
                {item.match.companyId !== null ? ' (существующая компания)' : ''}
                {item.contacts.length > 0 ? ` · контактов: ${item.contacts.length}` : ''}
                {item.draftsCount > 0 ? ` · черновиков: ${item.draftsCount}` : ''}
                {item.valid ? '' : ` · невалидно: ${item.invalidReason ?? ''}`}
              </p>
              {item.match.conflicts.map((conflict) => (
                <p className="mt-1 text-xs text-[#FBBF24]" key={conflict.field}>
                  конфликт ({conflict.field}): «{conflict.existing ?? '—'}» ↔ «{conflict.incoming ?? '—'}»
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      {protocol !== null && (
        <div className="grid gap-2 rounded-xl border border-[#34D399]/25 bg-[#34D399]/8 p-3">
          <h4 className="text-sm font-semibold text-white">Протокол импорта</h4>
          <p className="text-xs text-muted-foreground">
            компаний создано: {protocol.companiesCreated} · дозаполнено: {protocol.companiesUpdated} · пропущено:{' '}
            {protocol.skipped} · контактов: {protocol.contactsCreated} · каналов: {protocol.channelsCreated} · задач:{' '}
            {protocol.tasksCreated} · черновиков: {protocol.draftsCreated} · ошибок: {protocol.errors.length}
          </p>
          {protocol.protocol.map((row) => (
            <p className="text-xs text-muted-foreground" key={row.externalId + row.action}>
              {row.externalId} → {row.action}: {row.detail}
            </p>
          ))}
          {protocol.errors.map((row) => (
            <p className="text-xs text-[#FB7185]" key={row.externalId}>
              {row.externalId}: {row.error}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
