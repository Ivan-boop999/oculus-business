import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { monthGoalResponseSchema, type MonthGoal } from '@oculus-business/contracts'
import { useAuth } from '@/features/auth'
import { formatMoneyShort } from '@/platform/format'

/// Блок «Цель месяца»: план по новому MRR и разовой выручке + прогресс-бары факт/план.
/// Факт: MRR-прирост месяца приходит пропом, доход месяца — из сводки.
export function MonthGoalCard({
  month,
  monthIncome,
  mrrDelta,
}: {
  month: string
  monthIncome: number
  mrrDelta: number
}) {
  const { transport } = useAuth()
  const [goal, setGoal] = useState<MonthGoal>({ month, mrrGoal: 0, incomeGoal: 0 })
  const [editing, setEditing] = useState(false)
  const [mrrGoal, setMrrGoal] = useState('0')
  const [incomeGoal, setIncomeGoal] = useState('0')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void transport.request(`/api/finance/goals?month=${month}`, monthGoalResponseSchema).then(
      (response) => {
        if (!cancelled) setGoal(response.goal)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [month, transport])

  const save = async () => {
    setSaving(true)
    try {
      const response = await transport.request('/api/finance/goals', monthGoalResponseSchema, {
        method: 'PUT',
        body: {
          month,
          mrrGoal: Number(mrrGoal) || 0,
          incomeGoal: Number(incomeGoal) || 0,
        },
      })
      setGoal(response.goal)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const incomePct = goal.incomeGoal > 0 ? Math.min(100, (monthIncome / goal.incomeGoal) * 100) : 0
  const mrrPct = goal.mrrGoal > 0 ? Math.min(100, (mrrDelta / goal.mrrGoal) * 100) : 0

  return (
    <div className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          Цель месяца
        </h2>
        <button
          className="text-xs text-[#A5B4FC] hover:text-white"
          onClick={() => {
            setMrrGoal(String(goal.mrrGoal))
            setIncomeGoal(String(goal.incomeGoal))
            setEditing((value) => !value)
          }}
        >
          {editing ? 'отмена' : 'изменить'}
        </button>
      </div>

      {editing ? (
        <div className="grid gap-2">
          <label className="grid gap-1 text-xs text-muted-foreground">
            План нового MRR, ₽/мес
            <Input
              inputMode="numeric"
              onChange={(event) => setMrrGoal(event.target.value)}
              value={mrrGoal}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            План разовой выручки, ₽
            <Input
              inputMode="numeric"
              onChange={(event) => setIncomeGoal(event.target.value)}
              value={incomeGoal}
            />
          </label>
          <Button disabled={saving} onClick={() => void save()} size="sm">
            {saving ? 'Сохраняем…' : 'Сохранить план'}
          </Button>
        </div>
      ) : goal.mrrGoal === 0 && goal.incomeGoal === 0 ? (
        <p className="text-xs text-muted-foreground">
          План на месяц не задан — нажмите «изменить» и поставьте цель по новому MRR и разовой
          выручке.
        </p>
      ) : (
        <div className="grid gap-3">
          <GoalBar
            label="Новый MRR"
            pct={mrrPct}
            text={`${formatMoneyShort(mrrDelta)} / ${formatMoneyShort(goal.mrrGoal)}`}
          />
          <GoalBar
            label="Разовая выручка"
            pct={incomePct}
            text={`${formatMoneyShort(monthIncome)} / ${formatMoneyShort(goal.incomeGoal)}`}
          />
        </div>
      )}
    </div>
  )
}

function GoalBar({ label, pct, text }: { label: string; pct: number; text: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-white tabular-nums">{text}</span>
      </div>
      <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-white/6">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#7B5CFA] to-[#4338CA] shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-500"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
        выполнено {Math.round(pct)}%
      </p>
    </div>
  )
}
