import type {
  CompaniesExportResponse,
  CompanyFact,
  CreateCompanyFactRequest,
  PartnerAgreement,
  PartnerAgreementUpsertRequest,
} from '@oculus-business/contracts'

import type { DbClient } from '../../../db'
import { BusinessFailure } from '../domain/errors'
import type { V2SalesRepositoryExtensions } from '../application/sales-ports'

/// V2-методы репозитория продаж: атомарная идемпотентность, остановка продолжений
/// при запрете, сторнирование поступлений, факты, партнёры, экспорт, часовой пояс.
export function createSalesRepositoryV2(db: DbClient): V2SalesRepositoryExtensions {
  return {
    // ------------------------------------------------------------- Идемпотентность (FIX-03)

    async reserveIdempotency(actorId, operation, key, requestHash) {
      const where = { actorId_operation_key: { actorId, operation, key } }
      const staleBoundary = new Date(Date.now() - 60_000)
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await db.idempotencyRecord.create({
            data: { actorId, operation, key, requestHash, state: 'reserved', result: undefined },
          })
          return { kind: 'reserved' as const }
        } catch (error) {
          if ((error as { code?: string }).code !== 'P2002') throw error
        }
        const existing = await db.idempotencyRecord.findUnique({ where })
        if (existing === null) continue
        if (existing.state === 'completed') {
          return {
            kind: 'completed' as const,
            requestHash: existing.requestHash,
            result: existing.result,
          }
        }
        // Зависший резерв старше 60 с перехватывается: повтор после сбоя не застревает.
        if (existing.updatedAt < staleBoundary) {
          await db.idempotencyRecord.delete({ where }).catch(() => undefined)
          continue
        }
        return { kind: 'in_progress' as const }
      }
      return { kind: 'in_progress' as const }
    },

    async completeIdempotency(actorId, operation, key, requestHash, result) {
      await db.idempotencyRecord.update({
        where: { actorId_operation_key: { actorId, operation, key } },
        data: { state: 'completed', requestHash, result: result as never },
      })
    },

    async releaseIdempotency(actorId, operation, key) {
      await db.idempotencyRecord
        .deleteMany({ where: { actorId, operation, key, state: 'reserved' } })
        .catch(() => undefined)
    },

    // --------------------------------------------------- Остановка продолжений при DNC (FIX-06-AC03)

    async stopContinuationsForDnc(companyId, scope, reason) {
      const kindBlocked = scope === 'all' ? ['commercial', 'service'] : ['commercial']
      await db.salesTask.updateMany({
        where: { companyId, status: 'open', kind: { in: kindBlocked } },
        data: { needsReview: true },
      })
      await db.proposalDraft.updateMany({
        where: {
          companyId,
          status: { in: ['draft', 'reviewed', 'approved'] },
        },
        data: { status: 'on_hold', holdReason: `DNC(${scope}): ${reason}` },
      })
    },

    async stopContinuationsForContactDnc(contactId, scope, reason) {
      const contact = await db.contact.findUnique({ where: { id: contactId }, select: { companyId: true } })
      if (contact === null) return
      const kindBlocked = scope === 'all' ? ['commercial', 'service'] : ['commercial']
      await db.salesTask.updateMany({
        where: { contactId, status: 'open', kind: { in: kindBlocked } },
        data: { needsReview: true },
      })
      await db.proposalDraft.updateMany({
        where: { contactId, status: { in: ['draft', 'reviewed', 'approved'] } },
        data: { status: 'on_hold', holdReason: `DNC(${scope}, контакт): ${reason}` },
      })
    },

    // --------------------------------------------------- Сторнирование поступления (FIX-04-AC03)

    async findLinkedReceipts(txnId) {
      const rows = await db.txn.findMany({
        where: { OR: [{ id: txnId }, { reversalOfId: txnId }] },
        select: { id: true, expectedPaymentId: true },
      })
      return rows
    },

    async reverseReceipt({ paymentId, txnId, reason, reversalDate, actorId }) {
      return db.$transaction(async (tx) => {
        // Сериализация конкурирующих операций по обязательству (FIX-04-AC01).
        await tx.$queryRaw`SELECT id FROM expected_payments WHERE id = ${paymentId}::uuid FOR UPDATE`
        const payment = await tx.expectedPayment.findUnique({ where: { id: paymentId } })
        if (payment === null) throw new BusinessFailure('not_found', 'Обязательство не найдено')
        const txn = await tx.txn.findUnique({ where: { id: txnId } })
        if (txn === null) throw new BusinessFailure('not_found', 'Поступление не найдено')
        if (txn.expectedPaymentId !== paymentId) {
          throw new BusinessFailure('validation', 'Поступление не связано с этим обязательством')
        }
        if (txn.reversalOfId !== null) {
          throw new BusinessFailure('conflict', 'Это уже сторнирующая запись')
        }
        const alreadyReversed = await tx.txn.findFirst({
          where: { reversalOfId: txnId },
          select: { id: true },
        })
        if (alreadyReversed !== null) {
          throw new BusinessFailure('conflict', 'Поступление уже сторнировано')
        }
        // Разворачиваем только неподтверждённую сторнированием часть.
        const reversed = Math.min(txn.amount, payment.receivedAmount)
        if (reversed <= 0) {
          throw new BusinessFailure('conflict', 'Нет подтверждённой суммы для сторнирования')
        }
        const reversal = await tx.txn.create({
          data: {
            kind: 'expense',
            amount: reversed,
            occurredOn: new Date(`${reversalDate}T00:00:00.000Z`),
            category: 'Сторнирование поступления',
            comment: `${txn.comment ?? payment.title} — основание: ${reason}`,
            createdById: actorId,
            dealId: txn.dealId,
            expectedPaymentId: paymentId,
            reversalOfId: txnId,
            reversalReason: reason,
          },
        })
        await tx.txn.update({ where: { id: txnId }, data: { reversedAt: new Date() } })
        const receivedAmount = payment.receivedAmount - reversed
        const updated = await tx.expectedPayment.update({
          where: { id: paymentId },
          data: {
            receivedAmount,
            status:
              receivedAmount === 0
                ? 'expected'
                : receivedAmount >= payment.amount
                  ? 'received'
                  : 'partially_received',
            rowVersion: { increment: 1 },
          },
        })
        return {
          reversalTxnId: reversal.id,
          expectedPaymentId: paymentId,
          reversedTxnId: txnId,
          receivedAmount: updated.receivedAmount,
          remainingAmount: Math.max(0, updated.amount - updated.receivedAmount),
          status: updated.status,
        }
      })
    },

    // --------------------------------------------------- Факты исследования (AGENT-03)

    async listCompanyFacts(companyId) {
      const rows = await db.companyFact.findMany({
        where: { companyId },
        orderBy: { observedAt: 'desc' },
        take: 200,
      })
      const users = await db.user.findMany({ select: { id: true, displayName: true } })
      const names = new Map(users.map((user) => [user.id, user.displayName]))
      return rows.map(
        (row) =>
          ({
            id: row.id,
            companyId: row.companyId,
            claim: row.claim,
            sourceUrl: row.sourceUrl,
            observedAt: row.observedAt.toISOString(),
            authorId: row.authorId,
            authorName: row.authorId !== null ? (names.get(row.authorId) ?? null) : null,
            runId: row.runId,
            status: row.status as CompanyFact['status'],
            basis: row.basis,
            createdAt: row.createdAt.toISOString(),
          }) satisfies CompanyFact,
      )
    },

    async createCompanyFact(companyId, input, authorId) {
      const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true } })
      if (company === null) throw new BusinessFailure('not_found', 'Компания не найдена')
      const row = await db.companyFact.create({
        data: {
          companyId,
          claim: input.claim,
          sourceUrl: input.sourceUrl ?? null,
          observedAt: new Date(input.observedAt),
          authorId,
          runId: input.runId ?? null,
          status: input.status ?? 'hypothesis',
          basis: input.basis ?? null,
        },
      })
      return {
        id: row.id,
        companyId: row.companyId,
        claim: row.claim,
        sourceUrl: row.sourceUrl,
        observedAt: row.observedAt.toISOString(),
        authorId: row.authorId,
        authorName: null,
        runId: row.runId,
        status: row.status as CompanyFact['status'],
        basis: row.basis,
        createdAt: row.createdAt.toISOString(),
      } satisfies CompanyFact
    },

    // --------------------------------------------------- Партнёры (OWNER-05)

    async findPartnerAgreement(dealId) {
      const row = await db.partnerAgreement.findUnique({
        where: { dealId },
        include: { deal: { select: { partnerCompany: { select: { name: true } } } } },
      })
      if (row === null) return null
      const owner = row.ownerId !== null
        ? await db.user.findUnique({ where: { id: row.ownerId }, select: { displayName: true } })
        : null
      return mapPartner(row, row.deal.partnerCompany?.name ?? null, owner?.displayName ?? null)
    },

    async upsertPartnerAgreement(dealId, input) {
      const existing = await db.partnerAgreement.findUnique({ where: { dealId } })
      if (existing !== null && input.expectedVersion !== undefined && input.expectedVersion !== existing.rowVersion) {
        throw new BusinessFailure('conflict', 'Условия партнёрства изменены — перечитайте и повторите')
      }
      const data: Record<string, unknown> = {}
      const keys = [
        'partnerContactId', 'calculationBase', 'periodNotes', 'payoutTrigger', 'documentRef',
      ] as const
      for (const key of keys) {
        if (key in input) data[key] = (input as Record<string, unknown>)[key] ?? null
      }
      if (input.status !== undefined) data.status = input.status
      if ('rateBps' in input) data.rateBps = input.rateBps
      if ('ownerId' in input) data.ownerId = input.ownerId ?? null
      const row = await db.partnerAgreement.upsert({
        where: { dealId },
        update: { ...data, rowVersion: { increment: 1 } },
        create: {
          dealId,
          partnerCompanyId: input.partnerCompanyId,
          ...data,
        },
      })
      const deal = await db.deal.findUnique({
        where: { id: dealId },
        select: { partnerCompany: { select: { name: true } } },
      })
      const owner = row.ownerId !== null
        ? await db.user.findUnique({ where: { id: row.ownerId }, select: { displayName: true } })
        : null
      return mapPartner(row, deal?.partnerCompany?.name ?? null, owner?.displayName ?? null)
    },

    async setDealPartner(dealId, partnerCompanyId) {
      await db.deal.update({
        where: { id: dealId },
        data: { partnerCompanyId },
      })
    },

    // --------------------------------------------------- Экспорт (OWNER-05-AC03)

    async exportCompanies() {
      const [companies, contacts, tasks, deals] = await Promise.all([
        db.company.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, domain: true } }),
        db.contact.findMany({
          select: { id: true, companyId: true, name: true, doNotContact: true },
          orderBy: { createdAt: 'asc' },
        }),
        db.salesTask.findMany({
          select: { id: true, companyId: true, goal: true, status: true },
          orderBy: { createdAt: 'asc' },
        }),
        db.deal.findMany({
          select: { id: true, companyId: true, title: true, stageId: true },
          orderBy: { createdAt: 'asc' },
        }),
      ])
      return {
        exportedAt: new Date().toISOString(),
        companies,
        contacts,
        tasks,
        deals,
      } satisfies CompaniesExportResponse
    },

    // --------------------------------------------------- Часовой пояс (OWNER-02-AC02)

    async getTimezone() {
      const settings = await db.bizSettings.findUnique({ where: { id: 'singleton' } })
      return settings?.timezone ?? 'Europe/Moscow'
    },
  }
}

function mapPartner(
  row: Awaited<ReturnType<DbClient['partnerAgreement']['findUniqueOrThrow']>> & {
    deal?: { partnerCompany?: { name: string } | null }
  },
  partnerCompanyName: string | null,
  ownerName: string | null,
): PartnerAgreement {
  void row.deal
  return {
    id: row.id,
    dealId: row.dealId,
    partnerCompanyId: row.partnerCompanyId,
    partnerCompanyName,
    partnerContactId: row.partnerContactId,
    status: row.status,
    rateBps: row.rateBps,
    calculationBase: row.calculationBase,
    periodNotes: row.periodNotes,
    payoutTrigger: row.payoutTrigger,
    documentRef: row.documentRef,
    ownerId: row.ownerId,
    ownerName,
    version: row.rowVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
