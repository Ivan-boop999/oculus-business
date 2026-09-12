import type { ReactNode } from 'react'

/// Общие элементы фирменного стиля OCULUS для страниц приложения:
/// карточка-секция, KPI-плитка, мини-спарклайн и бейджи семантики.

export function SectionCard({
  children,
  className = '',
  title,
  action,
}: {
  children: ReactNode
  className?: string
  title?: ReactNode
  action?: ReactNode
}) {
  return (
    <section
      className={`rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-4 ${className}`}
    >
      {(title || action) && (
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function KpiCard({
  icon,
  label,
  sub,
  tone = 'default',
  value,
}: {
  icon?: ReactNode
  label: string
  sub?: ReactNode
  tone?: 'default' | 'positive' | 'warning' | 'negative' | 'accent'
  value: string
}) {
  const toneText = {
    default: 'text-white',
    positive: 'text-[#34D399]',
    warning: 'text-[#FBBF24]',
    negative: 'text-[#FB7185]',
    accent: 'text-[#A5B4FC]',
  }[tone]
  const toneGlow = {
    default: 'from-white/10 to-white/0 text-white/80',
    positive: 'from-[#34D399]/15 to-transparent text-[#34D399]',
    warning: 'from-[#FBBF24]/15 to-transparent text-[#FBBF24]',
    negative: 'from-[#F43F5E]/15 to-transparent text-[#FB7185]',
    accent: 'from-[#6366F1]/20 to-transparent text-[#A5B4FC]',
  }[tone]

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {label}
        </p>
        {icon && (
          <span
            className={`grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${toneGlow}`}
          >
            {icon}
          </span>
        )}
      </div>
      <p className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${toneText}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{sub}</p>}
    </div>
  )
}

/// Мини-график: столбики доход/расход по месяцам. Значения — [доход, расход][].
export function DualBars({
  data,
  labels,
}: {
  data: Array<[number, number]>
  labels?: string[]
}) {
  const max = Math.max(...data.flat(), 1)
  return (
    <div className="flex h-16 items-end gap-1.5">
      {data.map((pair, index) => (
        <div className="group flex h-full flex-1 flex-col justify-end gap-0.5" key={index}>
          <div
            className="w-full rounded-t-sm bg-gradient-to-t from-[#34D399]/50 to-[#34D399] transition-all"
            style={{ height: `${Math.max(3, (pair[0] / max) * 100)}%` }}
            title={labels?.[index] ? `${labels[index]}: доход` : undefined}
          />
          <div
            className="w-full rounded-b-sm bg-gradient-to-b from-[#F43F5E]/70 to-[#F43F5E]/40"
            style={{ height: `${Math.max(3, (pair[1] / max) * 100)}%` }}
            title={labels?.[index] ? `${labels[index]}: расход` : undefined}
          />
        </div>
      ))}
    </div>
  )
}

export function MoneyBadge({
  kind,
  children,
}: {
  kind: 'income' | 'expense' | 'accent' | 'neutral' | 'warning'
  children: ReactNode
}) {
  const styles = {
    income: 'border-[#34D399]/25 bg-[#34D399]/10 text-[#34D399]',
    expense: 'border-[#F43F5E]/25 bg-[#F43F5E]/10 text-[#FB7185]',
    accent: 'border-[#6366F1]/30 bg-[#6366F1]/12 text-[#A5B4FC]',
    neutral: 'border-white/10 bg-white/5 text-muted-foreground',
    warning: 'border-[#FBBF24]/25 bg-[#FBBF24]/10 text-[#FBBF24]',
  }[kind]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${styles}`}
    >
      {children}
    </span>
  )
}

export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-xl font-semibold tracking-tight text-white lg:text-2xl">{children}</h1>
  )
}
