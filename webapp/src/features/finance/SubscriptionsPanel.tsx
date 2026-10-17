import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { expectedPaymentsResponseSchema } from '@oculus-business/contracts'
import { useAuth } from '@/features/auth'
import { formatMoneyShort } from '@/platform/format'

import { useCrmBoardQuery } from '@/features/crm'

/// Состояние оплат и активных подписок (экран 6 ТЗ): договорная стоимость,
/// ожидаемые поступления с остатком, фактически активные подписки и требующие
/// подтверждения периоды — раздельно, без смешения с прогнозом.
export function SubscriptionsPanel() {
  const { transport } = useAuth()
  const board = useCrmBoardQuery()
  const expected = useQuery({
    queryKey: ['finance', 'expected'],
    queryFn: ({ signal }) =>
      transport.request('/api/finance/expected', expectedPaymentsResponseSchema, { signal }),
  })

  const deals = (board.data?.stages ?? []).flatMap((stage) =>
    stage.deals.map((deal) => ({ deal, stage })),
  )
  const activeSubs = deals.filter(({ deal }) => deal.subStatus === 'active')
  const unconfirmedSubs = deals.filter(({ deal }) => deal.subStatus === 'unconfirmed')
  const activeMrr = activeSubs.reduce((sum, { deal }) => sum + deal.monthlyAmount, 0)
  const payments = expected.data?.items ?? []
  const openPayments = payments.filter((payment) => payment.status === 'expected' || payment.status === 'partially_received')
  const remainingTotal = openPayments.reduce((sum, payment) => sum + payment.remainingAmount, 0)
  const contractMonthly = deals
    .filter(({ deal }) => deal.monthlyAmount > 0)
    .reduce((sum, { deal }) => sum + deal.monthlyAmount, 0)
  const contractOneTime = deals.reduce((sum, { deal }) => sum + deal.oneTimeAmount, 0)

  return (
    <section className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        Подписки и обязательства
      </h2>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">активный MRR: {formatMoneyShort(activeMrr)}/мес</Badge>
        <Badge variant="outline">договорная подписка (все сделки): {formatMoneyShort(contractMonthly)}/мес</Badge>
        <Badge variant="outline">договорные разовые суммы: {formatMoneyShort(contractOneTime)}</Badge>
        <Badge className="border-[#6366F1]/25 bg-[#6366F1]/10 text-[#A5B4FC]">
          ожидает поступлений: {formatMoneyShort(remainingTotal)}
        </Badge>
      </div>

      {unconfirmedSubs.length > 0 && (
        <p className="mt-3 rounded-lg border border-[#F59E0B]/25 bg-[#F59E0B]/8 px-3 py-2 text-xs text-[#FBBF24]">
          Подписок, требующих подтверждения периодов: {unconfirmedSubs.length} (сумма{' '}
          {formatMoneyShort(unconfirmedSubs.reduce((sum, { deal }) => sum + deal.monthlyAmount, 0))}/мес).
          Подтвердите периоды в карточке сделки — в MRR они не входят.
        </p>
      )}

      <div className="mt-3 grid gap-1.5">
        {activeSubs.map(({ deal }) => (
          <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-[#101724] px-3 py-2 text-sm" key={deal.id}>
            <span className="min-w-0 flex-1 truncate text-white">{deal.title}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {formatMoneyShort(deal.monthlyAmount)}/мес
            </span>
            <Badge className="border-[#34D399]/25 bg-[#34D399]/10 text-[#34D399]">активна</Badge>
          </div>
        ))}
        {activeSubs.length === 0 && (
          <p className="text-xs text-muted-foreground/70">Активных подписок нет — MRR равен нулю.</p>
        )}
      </div>

      <div className="mt-3 grid gap-1.5">
        {openPayments.map((payment) => (
          <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-[#101724] px-3 py-2 text-sm" key={payment.id}>
            <span className="min-w-0 flex-1 truncate text-white">{payment.title}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              остаток {formatMoneyShort(payment.remainingAmount)} из {formatMoneyShort(payment.amount)} · срок {payment.dueDate}
            </span>
            <Badge variant="outline">
              {payment.status === 'partially_received' ? 'частично' : 'ожидается'}
            </Badge>
          </div>
        ))}
        {openPayments.length === 0 && (
          <p className="text-xs text-muted-foreground/70">Открытых обязательств нет.</p>
        )}
      </div>
    </section>
  )
}
