import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import type { AdminUserSummary } from '@oculus-business/contracts'
import { useAuth } from '@/features/auth'

import { AGENT_CAPABILITY_LABELS, updateAgentPermissions } from './api'

const ALL_CAPABILITIES = Object.keys(AGENT_CAPABILITY_LABELS)

/// AGENT-01-AC01: редактор прав агентской записи — администратор выдаёт и отзывает
/// набор разрешений без правки БД. Пустой набор = отзыв всех прав.
export function AgentPermissionsDialog({
  user,
  onClose,
}: {
  user: AdminUserSummary
  onClose: () => void
}) {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  const initial = ((user as { agentPermissions?: string[] }).agentPermissions ?? []) as string[]
  const [selected, setSelected] = useState<Set<string>>(new Set(initial))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const toggle = (capability: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(capability)) next.delete(capability)
      else next.add(capability)
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateAgentPermissions(transport, user.id, [...selected].sort())
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="grid max-h-[85svh] w-full max-w-lg gap-3 overflow-y-auto rounded-2xl border border-white/10 bg-[#101724] p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h3 className="text-sm font-semibold text-white">Права агента</h3>
          <p className="text-xs text-muted-foreground">
            {user.email} · роль agent. Пустой набор = агент может только читать и готовить
            черновики/задачи/исследования.
          </p>
        </div>
        <div className="grid gap-1.5">
          {ALL_CAPABILITIES.map((capability) => (
            <label className="flex items-start gap-2 rounded-lg border border-white/8 px-3 py-2 text-sm" key={capability}>
              <input
                checked={selected.has(capability)}
                onChange={() => toggle(capability)}
                type="checkbox"
              />
              <span className="text-white/90">{AGENT_CAPABILITY_LABELS[capability]}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{capability}</span>
            </label>
          ))}
        </div>
        {error !== null && <p className="text-xs text-[#FB7185]">{error}</p>}
        <div className="flex gap-2">
          <Button disabled={saving} onClick={() => void save()} size="sm">
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          <Button onClick={onClose} size="sm" variant="outline">
            Отмена
          </Button>
        </div>
      </div>
    </div>
  )
}
