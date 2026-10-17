import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ProposalDraft } from '@oculus-business/contracts'

import { useDraftActionMutation, useDraftsQuery, useUpdateDraftMutation } from './sales-queries'

const STATUS_FILTERS = ['draft', 'reviewed', 'approved', 'sent', 'cancelled'] as const

const STATUS_LABELS: Record<string, string> = {
  draft: 'черновик',
  reviewed: 'проверен',
  approved: 'одобрен',
  sent: 'отправлен',
  failed: 'ошибка',
  cancelled: 'отменён',
}

/// Экран 4 ТЗ: очередь черновиков с версией и адресатом, редактированием,
/// подтверждением, отменой и ручной фиксацией отправки.
export function DraftsPage() {
  const [status, setStatus] = useState<string>('')
  const drafts = useDraftsQuery({ ...(status !== '' ? { status } : {}), limit: 100 })
  const action = useDraftActionMutation()
  const update = useUpdateDraftMutation()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight text-white lg:text-2xl">Черновики обращений</h1>
        {STATUS_FILTERS.map((value) => (
          <button
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              status === value
                ? 'border-[#6366F1]/40 bg-[#6366F1]/15 text-[#A5B4FC]'
                : 'border-white/10 bg-white/5 text-muted-foreground hover:text-white'
            }`}
            key={value}
            onClick={() => setStatus(status === value ? '' : value)}
          >
            {STATUS_LABELS[value]}
          </button>
        ))}
      </div>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}
      {drafts.isPending && <p className="py-8 text-center text-sm text-muted-foreground">Загружаем…</p>}

      <div className="grid gap-2">
        {(drafts.data?.items ?? []).map((draft) => (
          <DraftCard
            draft={draft}
            key={draft.id}
            onAction={(name, body) =>
              action.mutate(
                { id: draft.id, action: name, body },
                { onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка') },
              )
            }
            onEdit={(body) =>
              update.mutate(
                { id: draft.id, input: { body } },
                { onError: (caught) => setError(caught instanceof Error ? caught.message : 'Ошибка') },
              )
            }
            pending={action.isPending || update.isPending}
          />
        ))}
        {(drafts.data?.items.length ?? 0) === 0 && !drafts.isPending && (
          <p className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-muted-foreground">
            Черновиков в этом статусе нет. Создавайте их из карточки сделки или компании.
          </p>
        )}
      </div>
    </div>
  )
}

function DraftCard({
  draft,
  onAction,
  onEdit,
  pending,
}: {
  draft: ProposalDraft
  onAction: (action: 'review' | 'approve' | 'send' | 'cancel', body?: Record<string, unknown>) => void
  onEdit: (body: string) => void
  pending: boolean
}) {
  return (
    <div className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">версия {draft.version}</Badge>
        <Badge
          className={
            draft.status === 'sent'
              ? 'border-[#34D399]/25 bg-[#34D399]/10 text-[#34D399]'
              : draft.status === 'approved'
                ? 'border-[#6366F1]/25 bg-[#6366F1]/10 text-[#A5B4FC]'
                : 'border-white/10 bg-white/5 text-[#C9D0E2]'
          }
        >
          {STATUS_LABELS[draft.status] ?? draft.status}
        </Badge>
        <span className="text-sm font-semibold text-white">{draft.companyName ?? draft.companyId}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {draft.channel} → {draft.recipient}
        </span>
      </div>
      {draft.subject !== null && <p className="mt-1 text-sm text-white/90">{draft.subject}</p>}
      <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{draft.body.slice(0, 240)}</p>
      {draft.approvedAt !== null && (
        <p className="mt-1 text-[10px] text-muted-foreground/70">
          одобрено {new Date(draft.approvedAt).toLocaleString('ru-RU')} ({draft.approvedByName ?? '—'})
          {draft.sentAt !== null ? ` · отправлено ${new Date(draft.sentAt).toLocaleString('ru-RU')} (${draft.sentByName ?? '—'})` : ''}
          {draft.contentHash !== null ? ` · хэш версии ${draft.contentHash.slice(0, 18)}` : ''}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {draft.status === 'draft' && (
          <Button disabled={pending} onClick={() => onAction('review')} size="sm" variant="outline">
            Отметить проверенным
          </Button>
        )}
        {(draft.status === 'draft' || draft.status === 'reviewed') && (
          <Button disabled={pending} onClick={() => onAction('approve')} size="sm">
            Одобрить версию
          </Button>
        )}
        {draft.status === 'approved' && (
          <Button disabled={pending} onClick={() => onAction('send')} size="sm">
            Зафиксировать отправку
          </Button>
        )}
        {draft.status !== 'sent' && draft.status !== 'cancelled' && (
          <>
            <Button
              disabled={pending}
              onClick={() => {
                const body = window.prompt('Новый текст (создаст версию — нужно новое одобрение)', draft.body)
                if (body !== null && body !== draft.body) onEdit(body)
              }}
              size="sm"
              variant="ghost"
            >
              Править
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                const reason = window.prompt('Причина отмены')
                if (reason !== null && reason.trim() !== '') onAction('cancel', { reason: reason.trim() })
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
  )
}
