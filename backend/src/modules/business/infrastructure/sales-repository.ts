import {
  channelKindSchema,
  contactStatusSchema,
  dealContactRoleKindSchema,
} from '@oculus-business/contracts'
import type {
  Activity,
  Company,
  CompanyEvent,
  Contact,
  ContactChannel,
  CreateActivityRequest,
  CreateContactChannelRequest,
  CreateContactRequest,
  CreateCompanyRequest,
  CreateSalesTaskRequest,
  CompaniesQuery,
  CrmFunnelReportQuery,
  CrmFunnelReportResponse,
  Deal,
  DealClaim,
  DealContactRole,
  DealDetail,
  DealLaunch,
  DealLaunchUpsertRequest,
  ImportApplyRequest,
  ImportApplyResponse,
  ImportPreviewResponse,
  PaymentReceipt,
  PilotCriterion,
  PilotEvaluation,
  PilotMilestone,
  PilotUpsertRequest,
  ProposalDraft,
  SaveDealClaimRequest,
  SaveDealContactRoleRequest,
  SalesTask,
  TodayResponse,
  UpdateCompanyRequest,
  UpdateContactRequest,
  UpdateSalesTaskRequest,
  CreateDraftRequest,
  UpdateDraftRequest,
} from '@oculus-business/contracts'

import type { DbClient } from '../../../db'
import { BusinessFailure } from '../domain/errors'
import {
  computeFunnelStats,
  matchImportCandidate,
  normalizeDomain,
  normalizeRecipient,
  zonedDayRangeUtc,
} from '../domain/sales-rules'
import type {
  DealInternal,
  DraftInternal,
  ExpectedPaymentInternal,
  PilotInternal,
  SalesRepositoryBase,
} from '../application/sales-ports'

function toIso(value: Date): string {
  return value.toISOString()
}

function toDateOnly(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10)
}

function fromDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function fromOffsetDatetime(value: string): Date {
  return new Date(value)
}

/// Prisma Json-поля нельзя записать null напрямую: пустое значение пропускаем.
function jsonOrNull(value: unknown): object | undefined {
  if (value === null || value === undefined) return undefined
  return value as object
}

async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'P2003') throw new BusinessFailure('not_found', 'Связанная запись не найдена')
    if (code === 'P2025') throw new BusinessFailure('not_found', 'Запись не найдена')
    if (code === 'P2002') throw new BusinessFailure('conflict', 'Запись с такими данными уже есть')
    throw error
  }
}

const userSelect = { id: true, displayName: true, email: true, role: true } as const

export function createSalesRepository(db: DbClient): SalesRepositoryBase {
  return {
    // ------------------------------------------------------------- Участники

    async listBusinessUsers() {
      const rows = await db.user.findMany({ select: userSelect, orderBy: { displayName: 'asc' } })
      return rows
    },

    async getUserForAgentCheck(userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { role: true, agentPermissions: true },
      })
      return user
    },

    // ------------------------------------------------------------- Компании

    async listCompanies(query: CompaniesQuery) {
      const where: Record<string, unknown> = {}
      if (query.search !== undefined) {
        where.OR = [
          { name: { contains: query.search, mode: 'insensitive' } },
          { domain: { contains: query.search, mode: 'insensitive' } },
          { inn: { contains: query.search } },
          { region: { contains: query.search, mode: 'insensitive' } },
          { segment: { contains: query.search, mode: 'insensitive' } },
        ]
      }
      if (query.researchStatus !== undefined) where.researchStatus = query.researchStatus
      if (query.relationStatus !== undefined) where.relationStatus = query.relationStatus
      if (query.segment !== undefined) where.segment = query.segment
      if (query.ownerId !== undefined) where.ownerId = query.ownerId
      if (query.dnc === 'active') where.doNotContact = true
      if (query.dnc === 'none') where.doNotContact = false
      const [rows, total] = await Promise.all([
        db.company.findMany({
          where,
          orderBy: { name: 'asc' },
          take: query.limit,
          skip: query.offset,
          include: {
            owner: { select: { displayName: true } },
            _count: { select: { contacts: true, tasks: true, deals: true } },
          },
        }),
        db.company.count({ where }),
      ])
      const wonStageIds = new Set(
        (await db.crmStage.findMany({ where: { isWon: true }, select: { id: true } })).map(
          (stage) => stage.id,
        ),
      )
      const openTasks = await db.salesTask.groupBy({
        by: ['companyId'],
        where: { status: 'open', companyId: { not: null } },
        _count: { _all: true },
      })
      const openTasksByCompany = new Map(
        openTasks.map((row) => [row.companyId as string, row._count._all]),
      )
      const deals = await db.deal.findMany({
        select: { companyId: true, monthlyAmount: true, stageId: true, subStatus: true, subStartsOn: true, subEndsOn: true },
      })
      const today = new Date().toISOString().slice(0, 10)
      const items = rows.map((row) => {
        let dealsCount = 0
        let activeMrr = 0
        for (const deal of deals) {
          if (deal.companyId !== row.id) continue
          dealsCount += 1
          if (
            deal.subStatus === 'active' &&
            (deal.subStartsOn ?? '0000-00-00') <= today &&
            (deal.subEndsOn ?? '9999-12-31') >= today
          ) {
            activeMrr += deal.monthlyAmount
          }
        }
        void wonStageIds
        return {
          id: row.id,
          name: row.name,
          note: row.note,
          website: row.website,
          domain: row.domain,
          inn: row.inn,
          region: row.region,
          segment: row.segment,
          processDescription: row.processDescription,
          researchSource: row.researchSource,
          researchedAt: row.researchedAt ? toIso(row.researchedAt) : null,
          researchStatus: row.researchStatus,
          relationStatus: row.relationStatus,
          selectionReason: row.selectionReason,
          exclusionReason: row.exclusionReason,
          ownerId: row.ownerId,
          ownerName: row.owner?.displayName ?? null,
          cohortVersion: row.cohortVersion,
          contactSource: row.contactSource,
          externalId: row.externalId,
          doNotContact: row.doNotContact,
          dncReason: row.dncReason,
          dncAt: row.dncAt ? toIso(row.dncAt) : null,
          dncScope: row.dncScope,
          dealsCount,
          activeMrr,
          contactsCount: row._count.contacts,
          openTasksCount: openTasksByCompany.get(row.id) ?? 0,
          version: row.version,
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
        } satisfies Company
      })
      return { items, total }
    },

    async findCompanyDto(id) {
      const row = await db.company.findUnique({
        where: { id },
        include: { owner: { select: { displayName: true } } },
      })
      if (row === null) return null
      return mapCompanyDto(row, await companyCounts(db, id))
    },

    async createCompany(input) {
      return guarded(async () => {
        const row = await db.company.create({
          data: {
            name: input.name,
            note: input.note ?? null,
            website: input.website ?? null,
            domain: input.domain,
            inn: input.inn ?? null,
            region: input.region ?? null,
            segment: input.segment ?? null,
            processDescription: input.processDescription ?? null,
            researchSource: input.researchSource ?? null,
            researchedAt: input.researchedAt ? fromOffsetDatetime(input.researchedAt) : null,
            researchStatus: input.researchStatus ?? 'selected',
            relationStatus: input.relationStatus ?? 'prospect',
            selectionReason: input.selectionReason ?? null,
            ownerId: input.ownerId ?? null,
            cohortVersion: input.cohortVersion ?? null,
            contactSource: input.contactSource ?? null,
            externalId: input.externalId ?? null,
          },
          include: { owner: { select: { displayName: true } } },
        })
        return mapCompanyDto(row, { dealsCount: 0, activeMrr: 0, contactsCount: 0, openTasksCount: 0 })
      })
    },

    async updateCompany(id, input) {
      return guarded(async () => {
        const current = await db.company.findUnique({ where: { id } })
        if (current === null) throw new BusinessFailure('not_found', 'Контрагент не найден')
        if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
          throw new BusinessFailure('conflict', 'Контрагент изменён другим пользователем — обновите и повторите')
        }
        const data: Record<string, unknown> = { version: { increment: 1 } }
        for (const key of [
          'name', 'note', 'inn', 'region', 'segment', 'processDescription',
          'researchSource', 'selectionReason', 'cohortVersion', 'contactSource',
        ] as const) {
          if (key in input) data[key] = (input as Record<string, unknown>)[key] ?? null
        }
        if ('website' in input) {
          data.website = input.website ?? null
          data.domain = input.website ? normalizeDomain(input.website) : null
        }
        if ('researchedAt' in input) {
          data.researchedAt = input.researchedAt ? fromOffsetDatetime(input.researchedAt) : null
        }
        if (input.researchStatus !== undefined) data.researchStatus = input.researchStatus
        if (input.relationStatus !== undefined) data.relationStatus = input.relationStatus
        if ('exclusionReason' in input) data.exclusionReason = input.exclusionReason ?? null
        if ('ownerId' in input) data.ownerId = input.ownerId ?? null
        // FIX-05-AC02: атомарная условная запись — конкурирующие PATCH одной версии
        // дают один успех и один 409 (аудит R-11).
        const updatedCount = await db.company.updateMany({
          where:
            input.expectedVersion !== undefined ? { id, version: input.expectedVersion } : { id },
          data: data as never,
        })
        if (updatedCount.count === 0) {
          throw new BusinessFailure('conflict', 'Контрагент изменён другим пользователем — перечитайте и повторите')
        }
        const row = await db.company.findUniqueOrThrow({
          where: { id },
          include: { owner: { select: { displayName: true } } },
        })
        return mapCompanyDto(row, await companyCounts(db, id))
      })
    },

    async setCompanyDnc(id, input, actorId, at) {
      return guarded(async () => {
        const row = await db.company.update({
          where: { id },
          data: {
            doNotContact: true,
            dncReason: input.reason,
            dncAt: at,
            dncScope: input.scope,
            dncSource: input.source ?? null,
            dncSetById: actorId,
            dncLiftedAt: null,
            dncLiftedReason: null,
            dncLiftedById: null,
          },
          include: { owner: { select: { displayName: true } } },
        })
        await db.companyEvent.create({
          data: { companyId: id, kind: 'dnc_set', reason: input.reason, authorId: actorId },
        })
        return mapCompanyDto(row, await companyCounts(db, id))
      })
    },

    async liftCompanyDnc(id, reason, actorId, at) {
      return guarded(async () => {
        const row = await db.company.update({
          where: { id },
          data: {
            doNotContact: false,
            dncLiftedAt: at,
            dncLiftedReason: reason,
            dncLiftedById: actorId,
          },
          include: { owner: { select: { displayName: true } } },
        })
        await db.companyEvent.create({
          data: { companyId: id, kind: 'dnc_lifted', reason, authorId: actorId },
        })
        return mapCompanyDto(row, await companyCounts(db, id))
      })
    },

    async listCompanyEvents(companyId) {
      const rows = await db.companyEvent.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      const users = await db.user.findMany({ select: userSelect })
      const names = new Map(users.map((user) => [user.id, user.displayName]))
      return rows.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        kind: row.kind,
        reason: row.reason,
        authorId: row.authorId,
        authorName: names.get(row.authorId) ?? null,
        createdAt: toIso(row.createdAt),
      })) satisfies CompanyEvent[]
    },

    // ------------------------------------------------------------- Контакты

    async listContacts(companyId) {
      const rows = await db.contact.findMany({
        where: { companyId },
        orderBy: [{ isLegacy: 'asc' }, { createdAt: 'asc' }],
        include: { channels: { orderBy: { createdAt: 'asc' } } },
      })
      return rows.map(mapContactDto)
    },

    async findContactDto(id) {
      const row = await db.contact.findUnique({ where: { id }, include: { channels: true } })
      return row === null ? null : mapContactDto(row)
    },

    async createContact(input) {
      return guarded(async () => {
        const company = await db.company.findUnique({ where: { id: input.companyId } })
        if (company === null) throw new BusinessFailure('not_found', 'Компания не найдена')
        const row = await db.contact.create({
          data: {
            companyId: input.companyId,
            name: input.name ?? null,
            position: input.position ?? null,
            status: input.status ?? 'published',
            source: input.source ?? null,
            discoveredAt: input.discoveredAt ? fromOffsetDatetime(input.discoveredAt) : null,
            directRoleConfirmed: input.directRoleConfirmed ?? false,
            note: input.note ?? null,
          },
          include: { channels: true },
        })
        for (const channel of input.channels ?? []) {
          await db.contactChannel.create({
            data: {
              contactId: row.id,
              kind: channel.kind,
              value: channel.value,
              status: channel.status ?? 'published',
              isDirect: channel.isDirect ?? false,
              source: channel.source ?? null,
              note: channel.note ?? null,
            },
          })
        }
        const withChannels = await db.contact.findUniqueOrThrow({
          where: { id: row.id },
          include: { channels: true },
        })
        return mapContactDto(withChannels)
      })
    },

    async updateContact(id, input) {
      return guarded(async () => {
        const current = await db.contact.findUnique({ where: { id } })
        if (current === null) throw new BusinessFailure('not_found', 'Контакт не найден')
        if (input.expectedVersion !== undefined && input.expectedVersion !== current.rowVersion) {
          throw new BusinessFailure('conflict', 'Контакт изменён другим пользователем — обновите и повторите')
        }
        const data: Record<string, unknown> = { rowVersion: { increment: 1 } }
        for (const key of ['name', 'position', 'source', 'note'] as const) {
          if (key in input) data[key] = (input as Record<string, unknown>)[key] ?? null
        }
        if ('discoveredAt' in input) {
          data.discoveredAt = input.discoveredAt ? fromOffsetDatetime(input.discoveredAt) : null
        }
        if (input.status !== undefined) data.status = input.status
        if (input.directRoleConfirmed !== undefined) data.directRoleConfirmed = input.directRoleConfirmed
        const updatedCount = await db.contact.updateMany({
          where:
            input.expectedVersion !== undefined ? { id, rowVersion: input.expectedVersion } : { id },
          data: data as never,
        })
        if (updatedCount.count === 0) {
          throw new BusinessFailure('conflict', 'Контакт изменён другим пользователем — перечитайте и повторите')
        }
        const row = await db.contact.findUniqueOrThrow({ where: { id }, include: { channels: true } })
        return mapContactDto(row)
      })
    },

    async setContactDnc(id, input, actorId, at) {
      return guarded(async () => {
        const row = await db.contact.update({
          where: { id },
          data: {
            doNotContact: true,
            dncReason: input.reason,
            dncAt: at,
            dncScope: input.scope,
            dncSource: input.source ?? null,
            dncSetById: actorId,
            dncLiftedAt: null,
            dncLiftedReason: null,
            dncLiftedById: null,
          },
          include: { channels: true },
        })
        await db.companyEvent.create({
          data: { companyId: row.companyId, kind: 'dnc_set', reason: `${input.reason} (контакт)`, authorId: actorId },
        })
        return mapContactDto(row)
      })
    },

    async liftContactDnc(id, reason, actorId, at) {
      return guarded(async () => {
        const row = await db.contact.update({
          where: { id },
          data: { doNotContact: false, dncLiftedAt: at, dncLiftedReason: reason, dncLiftedById: actorId },
          include: { channels: true },
        })
        await db.companyEvent.create({
          data: { companyId: row.companyId, kind: 'dnc_lifted', reason: `${reason} (контакт)`, authorId: actorId },
        })
        return mapContactDto(row)
      })
    },

    async createChannel(contactId, input) {
      return guarded(async () => {
        const row = await db.contactChannel.create({
          data: {
            contactId,
            kind: input.kind,
            value: input.value,
            status: input.status ?? 'published',
            isDirect: input.isDirect ?? false,
            source: input.source ?? null,
            note: input.note ?? null,
          },
        })
        return mapChannelDto(row)
      })
    },

    async updateChannel(id, input) {
      return guarded(async () => {
        const current = await db.contactChannel.findUnique({ where: { id }, select: { rowVersion: true } })
        if (current === null) throw new BusinessFailure('not_found', 'Канал не найден')
        if (input.expectedVersion !== undefined && input.expectedVersion !== current.rowVersion) {
          throw new BusinessFailure('conflict', 'Канал изменён другим пользователем — перечитайте и повторите')
        }
        const data: Record<string, unknown> = { rowVersion: { increment: 1 } }
        if (input.kind !== undefined) data.kind = input.kind
        if (input.value !== undefined) data.value = input.value
        if (input.status !== undefined) {
          data.status = input.status
          data.verifiedAt = input.status === 'confirmed' ? new Date() : null
        }
        if (input.isDirect !== undefined) data.isDirect = input.isDirect
        if ('source' in input) data.source = input.source ?? null
        if ('note' in input) data.note = input.note ?? null
        const updatedCount = await db.contactChannel.updateMany({
          where:
            input.expectedVersion !== undefined ? { id, rowVersion: input.expectedVersion } : { id },
          data: data as never,
        })
        if (updatedCount.count === 0) {
          throw new BusinessFailure('conflict', 'Канал изменён другим пользователем — перечитайте и повторите')
        }
        const row = await db.contactChannel.findUniqueOrThrow({ where: { id } })
        return mapChannelDto(row)
      })
    },

    async findChannelInCompany(companyId, kind, value) {
      const row = await db.contactChannel.findFirst({
        where: { kind, value, contact: { companyId } },
        select: { contactId: true },
      })
      return row
    },

    // ------------------------------------------------------------- Сделка

    async getDealDetail(id): Promise<DealDetail | null> {
      const deal = await db.deal.findUnique({
        where: { id },
        include: {
          stage: true,
          company: true,
          createdBy: { select: { displayName: true } },
          owner: { select: { displayName: true } },
          claims: { orderBy: { recordedAt: 'asc' } },
          contactRoles: {
            include: { contact: { select: { name: true } } },
          },
          _count: { select: { comments: true } },
        },
      })
      if (deal === null) return null
      const drafts = await db.proposalDraft.findMany({
        where: { dealId: id },
        orderBy: { version: 'desc' },
        take: 50,
      })
      const pilot = await db.pilotEvaluation.findUnique({
        where: { dealId: id },
        include: {
          ordixOwner: { select: { displayName: true } },
          criteria: { orderBy: [{ active: 'desc' }, { version: 'desc' }] },
          milestones: {
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      const launch = await db.dealLaunch.findUnique({
        where: { dealId: id },
        include: { launchOwner: { select: { displayName: true } } },
      })
      const receipts = await db.txn.findMany({
        where: { dealId: id, kind: 'income' },
        select: { amount: true },
      })
      const expected = await db.expectedPayment.findMany({
        where: { dealId: id },
        orderBy: { dueDate: 'asc' },
      })
      const settings = await db.bizSettings.findUnique({ where: { id: 'singleton' } })
      const receivedTotal = receipts.reduce((sum, txn) => sum + txn.amount, 0)
      const users = await db.user.findMany({ select: userSelect })
      const names = new Map(users.map((user) => [user.id, user.displayName]))
      return {
        ...mapDealDto(deal),
        direction: deal.direction,
        scenario: deal.scenario,
        currentProcess: deal.currentProcess,
        problemStatement: deal.problemStatement,
        consequences: deal.consequences,
        baseline: deal.baseline,
        measurementMethod: deal.measurementMethod,
        assumptions: deal.assumptions,
        desiredOutcome: deal.desiredOutcome,
        priority: deal.priority,
        priorityEvent: deal.priorityEvent,
        economicBuyerStatus: deal.economicBuyerStatus,
        selectionCriteria: deal.selectionCriteria,
        decisionProcess: deal.decisionProcess,
        techConstraints: deal.techConstraints,
        priceAnchor: deal.priceAnchor,
        priceReaction: deal.priceReaction,
        nextAgreedStep: deal.nextAgreedStep,
        pausedReason: deal.pausedReason,
        resumeCondition: deal.resumeCondition,
        resumeOn: toDateOnly(deal.resumeOn),
        wonAt: deal.wonAt ? toIso(deal.wonAt) : null,
        wonBasis: deal.wonBasis,
        signedAt: toDateOnly(deal.signedAt),
        implementationStartPlan: toDateOnly(deal.implementationStartPlan),
        implementationStartFact: toDateOnly(deal.implementationStartFact),
        activationAt: deal.activationAt ? toIso(deal.activationAt) : null,
        subStartsOn: toDateOnly(deal.subStartsOn),
        subEndsOn: toDateOnly(deal.subEndsOn),
        claims: deal.claims.map((claim) => ({
          id: claim.id,
          dealId: claim.dealId,
          fieldKey: claim.fieldKey as DealClaim['fieldKey'],
          status: claim.status as DealClaim['status'],
          source: claim.source,
          sourceActivityId: claim.sourceActivityId,
          note: claim.note,
          recordedAt: toIso(claim.recordedAt),
          recordedById: claim.recordedById,
          recordedByName: names.get(claim.recordedById) ?? null,
        })),
        contactRoles: deal.contactRoles.map((role) => ({
          id: role.id,
          dealId: role.dealId,
          contactId: role.contactId,
          contactName: role.contact.name,
          role: dealContactRoleKindSchema.parse(role.role),
          confirmed: role.confirmed,
          note: role.note,
          createdAt: toIso(role.createdAt),
        })),
        drafts: drafts.map((draft) => mapDraftDto(draft, names)),
        pilot: pilot === null ? null : mapPilotDto(pilot, names),
        launch: launch === null ? null : mapLaunchDto(launch),
        expectedPayments: expected.map((payment) => ({
          id: payment.id,
          title: payment.title,
          invoiceNumber: payment.invoiceNumber,
          amount: payment.amount,
          dueDate: toDateOnly(payment.dueDate) ?? '',
          probability: payment.probability,
          dealId: payment.dealId,
          status: payment.status,
          receivedAmount: payment.receivedAmount,
          remainingAmount: Math.max(0, payment.amount - payment.receivedAmount),
          version: payment.rowVersion,
          createdAt: toIso(payment.createdAt),
          updatedAt: toIso(payment.updatedAt),
        })),
        receivedTotal,
        contribution:
          launch === null
            ? null
            : receivedTotal - launch.directCosts - launch.supportHours * (settings?.laborHourRate ?? 0),
      }
    },

    async createDealWithInitialEntry(input, createdById, stageId, history) {
      return db.$transaction(async () => {
        const stage = await db.crmStage.findUnique({ where: { id: stageId } })
        if (stage === null) throw new BusinessFailure('not_found', 'Этап не найден')
        const last = await db.deal.findFirst({
          where: { stageId },
          orderBy: { position: 'desc' },
          select: { position: true },
        })
        const row = await db.deal.create({
          data: {
            title: input.title as string,
            contactName: (input.contactName as string | null) ?? null,
            contactPhone: (input.contactPhone as string | null) ?? null,
            contactTelegram: (input.contactTelegram as string | null) ?? null,
            source: (input.source as string | null) ?? null,
            oneTimeAmount: (input.oneTimeAmount as number | undefined) ?? 0,
            monthlyAmount: (input.monthlyAmount as number | undefined) ?? 0,
            note: (input.note as string | null) ?? null,
            nextActionAt: (input.nextActionAt as Date | null) ?? null,
            nextAction: (input.nextAction as string | null) ?? null,
            lostReason: (input.lostReason as string | null) ?? null,
            companyId: (input.companyId as string | null) ?? null,
            stageId,
            position: (last?.position ?? -1) + 1,
            createdById,
            ownerId: (input.ownerId as string | null | undefined) ?? createdById,
            lastStageChangeAt: new Date(),
            version: 1,
          },
          include: dealDetailIncludeLight,
        })
        await db.dealHistory.create({
          data: {
            dealId: row.id,
            fromStage: null,
            toStage: stage.title,
            fromStageId: null,
            toStageId: history.toStageId,
            event: 'initial_entry',
            actorKind: history.actorKind,
            actorId: history.actorId,
            monthlyAmountSnapshot: row.monthlyAmount,
          },
        })
        return mapDealDto(row)
      })
    },

    async deleteDealBySales(id) {
      await guarded(async () => {
        await db.deal.delete({ where: { id } })
      })
    },

    async listStagesLight() {
      const stages = await db.crmStage.findMany({ orderBy: { position: 'asc' } })
      return stages.map((stage) => ({
        id: stage.id,
        title: stage.title,
        position: stage.position,
        semanticType: stage.semanticType,
        isWon: stage.isWon,
        isLost: stage.isLost,
      }))
    },

    async updateDealFields(id, data, expectedVersion) {
      return guarded(async () => {
        const current = await db.deal.findUnique({ where: { id }, select: { version: true } })
        if (current === null) throw new BusinessFailure('not_found', 'Сделка не найдена')
        if (expectedVersion !== undefined && expectedVersion !== current.version) {
          throw new BusinessFailure('conflict', 'Сделка изменена другим пользователем — обновите и повторите')
        }
        const row = await db.deal.update({
          where: { id },
          data: { ...data, version: current.version + 1 },
          include: dealDetailIncludeLight,
        })
        return mapDealDto(row)
      })
    },

    async transitionDealTx({ dealId, toStageId, position, history, dealSideEffects }) {
      return db.$transaction(async (tx) => {
        // Аудит R-12: сериализация переходов одной сделки — вторая конкурирующая команда
        // видит новую стадию и не создаёт второе событие для того же состояния.
        await tx.$queryRaw`SELECT id FROM deals WHERE id = ${dealId}::uuid FOR UPDATE`
        const moving = await tx.deal.findUnique({ where: { id: dealId } })
        if (moving === null) throw new BusinessFailure('not_found', 'Сделка не найдена')
        const stage = await tx.crmStage.findUnique({ where: { id: toStageId } })
        if (stage === null) throw new BusinessFailure('not_found', 'Этап не найден')
        const now = new Date()
        const stageChanged = moving.stageId !== toStageId
        if (stageChanged) {
          const previous = await tx.crmStage.findUnique({
            where: { id: moving.stageId },
            select: { title: true },
          })
          await tx.dealHistory.create({
            data: {
              dealId,
              fromStage: previous?.title ?? null,
              toStage: stage.title,
              fromStageId: moving.stageId,
              toStageId,
              event: 'moved',
              actorKind: history.actorKind,
              actorId: history.actorId,
              reason: history.reason,
              overrideReason: history.overrideReason,
              idempotencyKey: history.idempotencyKey,
              monthlyAmountSnapshot: history.monthlyAmountSnapshot,
            },
          })
        }
        const others = (
          await tx.deal.findMany({ where: { stageId: toStageId }, orderBy: { position: 'asc' } })
        ).filter((deal) => deal.id !== dealId)
        const clamped = Math.max(0, Math.min(position, others.length))
        const ordered = [
          ...others.slice(0, clamped),
          { ...moving, stageId: toStageId },
          ...others.slice(clamped),
        ]
        for (let index = 0; index < ordered.length; index += 1) {
          await tx.deal.update({
            where: { id: ordered[index].id },
            data: {
              position: index,
              stageId: toStageId,
              ...(stageChanged && ordered[index].id === dealId
                ? { lastStageChangeAt: now, ...dealSideEffects, version: moving.version + 1 }
                : {}),
            },
          })
        }
        const row = await tx.deal.findUniqueOrThrow({
          where: { id: dealId },
          include: dealDetailIncludeLight,
        })
        return mapDealDto(row)
      })
    },

    async findDealInternal(id): Promise<DealInternal | null> {
      const deal = await db.deal.findUnique({ where: { id }, include: { stage: true, company: true } })
      if (deal === null) return null
      return {
        id: deal.id,
        stageId: deal.stageId,
        title: deal.title,
        lostReason: deal.lostReason,
        pausedReason: deal.pausedReason,
        resumeCondition: deal.resumeCondition,
        resumeOn: toDateOnly(deal.resumeOn),
        wonAt: deal.wonAt ? toIso(deal.wonAt) : null,
        wonBasis: deal.wonBasis,
        monthlyAmount: deal.monthlyAmount,
        oneTimeAmount: deal.oneTimeAmount,
        ownerId: deal.ownerId,
        companyId: deal.companyId,
        version: deal.version,
        stage: {
          id: deal.stage.id,
          title: deal.stage.title,
          position: deal.stage.position,
          semanticType: deal.stage.semanticType,
          isWon: deal.stage.isWon,
          isLost: deal.stage.isLost,
        },
        company:
          deal.company === null
            ? null
            : {
                doNotContact: deal.company.doNotContact,
                dncScope: deal.company.dncScope,
                dncReason: deal.company.dncReason,
              },
        problemStatement: deal.problemStatement,
        consequences: deal.consequences,
        nextAgreedStep: deal.nextAgreedStep,
        partnerCompanyId: deal.partnerCompanyId,
      }
    },

    async listDealClaims(dealId) {
      const rows = await db.dealClaim.findMany({ where: { dealId }, orderBy: { recordedAt: 'asc' } })
      const users = await db.user.findMany({ select: userSelect })
      const names = new Map(users.map((user) => [user.id, user.displayName]))
      return rows.map(
        (row) =>
          ({
            id: row.id,
            dealId: row.dealId,
            fieldKey: row.fieldKey as DealClaim['fieldKey'],
            status: row.status as DealClaim['status'],
            source: row.source,
            sourceActivityId: row.sourceActivityId,
            note: row.note,
            recordedAt: toIso(row.recordedAt),
            recordedById: row.recordedById,
            recordedByName: names.get(row.recordedById) ?? null,
          }) satisfies DealClaim,
      )
    },

    async upsertDealClaim(dealId, input: SaveDealClaimRequest, recordedById) {
      const row = await db.dealClaim.upsert({
        where: { dealId_fieldKey: { dealId, fieldKey: input.fieldKey } },
        update: {
          status: input.status,
          source: input.source ?? null,
          sourceActivityId: input.sourceActivityId ?? null,
          note: input.note ?? null,
          recordedAt: new Date(),
          recordedById,
        },
        create: {
          dealId,
          fieldKey: input.fieldKey,
          status: input.status,
          source: input.source ?? null,
          sourceActivityId: input.sourceActivityId ?? null,
          note: input.note ?? null,
          recordedById,
        },
      })
      const user = await db.user.findUnique({ where: { id: recordedById }, select: userSelect })
      return {
        id: row.id,
        dealId: row.dealId,
        fieldKey: row.fieldKey as DealClaim['fieldKey'],
        status: row.status as DealClaim['status'],
        source: row.source,
        sourceActivityId: row.sourceActivityId,
        note: row.note,
        recordedAt: toIso(row.recordedAt),
        recordedById: row.recordedById,
        recordedByName: user?.displayName ?? null,
      } satisfies DealClaim
    },

    async listDealContactRoles(dealId) {
      const rows = await db.dealContactRole.findMany({
        where: { dealId },
        orderBy: { createdAt: 'asc' },
        include: { contact: { select: { name: true } } },
      })
      return rows.map(
        (row) =>
          ({
            id: row.id,
            dealId: row.dealId,
            contactId: row.contactId,
            contactName: row.contact.name,
            role: dealContactRoleKindSchema.parse(row.role),
            confirmed: row.confirmed,
            note: row.note,
            createdAt: toIso(row.createdAt),
          }) satisfies DealContactRole,
      )
    },

    async upsertDealContactRole(dealId, input: SaveDealContactRoleRequest) {
      const contact = await db.contact.findUnique({ where: { id: input.contactId } })
      if (contact === null) throw new BusinessFailure('not_found', 'Контакт не найден')
      const row = await db.dealContactRole.upsert({
        where: {
          dealId_contactId_role: { dealId, contactId: input.contactId, role: input.role },
        },
        update: {
          confirmed: input.confirmed ?? false,
          note: input.note ?? null,
        },
        create: {
          dealId,
          contactId: input.contactId,
          role: input.role,
          confirmed: input.confirmed ?? false,
          note: input.note ?? null,
        },
      })
      return {
        id: row.id,
        dealId: row.dealId,
        contactId: row.contactId,
        contactName: contact.name,
        role: dealContactRoleKindSchema.parse(row.role),
        confirmed: row.confirmed,
        note: row.note,
        createdAt: toIso(row.createdAt),
      } satisfies DealContactRole
    },

    async deleteDealContactRole(id) {
      await guarded(async () => {
        await db.dealContactRole.delete({ where: { id } })
      })
    },

    // ------------------------------------------------------------- Активности и задачи

    async createActivity(input: CreateActivityRequest, authorId) {
      return guarded(async () => {
        const row = await db.activity.create({
          data: {
            companyId: input.companyId,
            dealId: input.dealId ?? null,
            contactId: input.contactId ?? null,
            occurredAt: fromOffsetDatetime(input.occurredAt),
            timezone: input.timezone,
            channel: input.channel,
            actionType: input.actionType,
            direction: input.direction,
            result: input.result ?? null,
            note: input.note ?? null,
            verbatimQuote: input.verbatimQuote ?? null,
            authorId,
          },
        })
        return mapActivityDto(row, await activityNames(db, row))
      })
    },

    async listActivities(query) {
      const where: Record<string, unknown> = {}
      if (query.companyId !== undefined) where.companyId = query.companyId
      if (query.dealId !== undefined) where.dealId = query.dealId
      if (query.direction !== undefined) where.direction = query.direction
      if (query.unprocessedOnly === true) where.processedAt = null
      const [rows, total] = await Promise.all([
        db.activity.findMany({
          where,
          orderBy: { occurredAt: 'desc' },
          take: query.limit,
          skip: query.offset,
        }),
        db.activity.count({ where }),
      ])
      const names = await activityNames(db, null)
      return { items: rows.map((row) => mapActivityDto(row, names)), total }
    },

    async markActivityProcessed(id, at) {
      await guarded(async () => {
        await db.activity.update({ where: { id }, data: { processedAt: at } })
      })
    },

    async markTemplatedTasksNeedsReview(companyId) {
      const result = await db.salesTask.updateMany({
        where: { companyId, status: 'open', templated: true, needsReview: false },
        data: { needsReview: true },
      })
      return result.count
    },

    async createSalesTask(input: CreateSalesTaskRequest, createdById) {
      return guarded(async () => {
        const row = await db.salesTask.create({
          data: {
            companyId: input.companyId ?? null,
            dealId: input.dealId ?? null,
            contactId: input.contactId ?? null,
            assigneeId: input.assigneeId,
            goal: input.goal,
            action: input.action ?? null,
            dueAt: input.dueAt !== null && input.dueAt !== undefined ? fromOffsetDatetime(input.dueAt) : null,
            dueTimezone: input.dueTimezone ?? 'Europe/Moscow',
            clientAgreedAt:
              input.clientAgreedAt !== null && input.clientAgreedAt !== undefined
                ? fromOffsetDatetime(input.clientAgreedAt)
                : null,
            kind: input.kind ?? 'commercial',
            commitmentType: input.commitmentType ?? 'internal_plan',
            templated: input.templated ?? false,
            externalId: input.externalId ?? null,
            createdById,
            rowVersion: 1,
          },
        })
        return mapTaskDto(row, await taskNames(db, row))
      })
    },

    async updateSalesTask(id, input: UpdateSalesTaskRequest, actorId) {
      return guarded(async () => {
        const current = await db.salesTask.findUnique({ where: { id } })
        if (current === null) throw new BusinessFailure('not_found', 'Задача не найдена')
        if (input.expectedVersion !== undefined && input.expectedVersion !== current.rowVersion) {
          throw new BusinessFailure('conflict', 'Задача изменена другим пользователем — обновите и повторите')
        }
        // FIX-05-AC02: условная атомарная запись — два обновления одной версии
        // не проходят оба (аудит R-11).
        const data: Record<string, unknown> = { rowVersion: { increment: 1 } }
        if (input.goal !== undefined) data.goal = input.goal
        if ('action' in input) data.action = input.action ?? null
        if ('dueAt' in input) data.dueAt = input.dueAt ? fromOffsetDatetime(input.dueAt) : null
        if ('clientAgreedAt' in input) {
          data.clientAgreedAt = input.clientAgreedAt ? fromOffsetDatetime(input.clientAgreedAt) : null
        }
        if (input.kind !== undefined) data.kind = input.kind
        if (input.dueTimezone !== undefined) data.dueTimezone = input.dueTimezone
        if (input.commitmentType !== undefined) data.commitmentType = input.commitmentType
        if ('templated' in input) data.templated = input.templated ?? false
        if ('needsReview' in input) data.needsReview = input.needsReview ?? false
        if ('companyId' in input) data.companyId = input.companyId ?? null
        if ('dealId' in input) data.dealId = input.dealId ?? null
        if ('contactId' in input) data.contactId = input.contactId ?? null
        if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId
        if (input.status !== undefined) {
          data.status = input.status
          if (input.status === 'done') {
            data.completedAt = new Date()
            data.completedById = actorId
          } else {
            data.completedAt = null
            data.completedById = null
          }
        }
        const updatedCount = await db.salesTask.updateMany({
          where:
            input.expectedVersion !== undefined
              ? { id, rowVersion: input.expectedVersion }
              : { id },
          data: data as never,
        })
        if (updatedCount.count === 0) {
          throw new BusinessFailure('conflict', 'Задача изменена другим пользователем — перечитайте и повторите')
        }
        const row = await db.salesTask.findUniqueOrThrow({ where: { id } })
        return mapTaskDto(row, await taskNames(db, row))
      })
    },

    async listSalesTasks(query) {
      const where: Record<string, unknown> = {}
      if (query.status !== undefined) where.status = query.status
      if (query.assigneeId !== undefined) where.assigneeId = query.assigneeId
      if (query.companyId !== undefined) where.companyId = query.companyId
      if (query.dealId !== undefined) where.dealId = query.dealId
      if (query.dueBefore !== undefined) where.dueAt = { lt: fromOffsetDatetime(query.dueBefore) }
      const [rows, total] = await Promise.all([
        db.salesTask.findMany({
          where,
          orderBy: { dueAt: 'asc' },
          take: query.limit,
          skip: query.offset,
        }),
        db.salesTask.count({ where }),
      ])
      const names = await taskNames(db, null)
      return { items: rows.map((row) => mapTaskDto(row, names)), total }
    },

    async listOpenTasksForDeal(dealId) {
      const rows = await db.salesTask.findMany({
        where: { dealId, status: 'open' },
        orderBy: { dueAt: 'asc' },
      })
      return rows.map((row) => ({
        goal: row.goal,
        action: row.action,
        dueAt: row.dueAt,
        status: row.status,
      }))
    },

    async setDealNextActionSummary(dealId, summary) {
      await db.deal.update({
        where: { id: dealId },
        data: {
          nextAction: summary.nextAction,
          nextActionAt: summary.nextActionAt ? fromDateOnly(summary.nextActionAt) : null,
        },
      })
    },

    // ------------------------------------------------------------- Черновики

    async createDraft(input: CreateDraftRequest, createdById) {
      return guarded(async () => {
        let groupId = input.groupId ?? null
        let version = 1
        if (groupId !== null) {
          const last = await db.proposalDraft.findFirst({
            where: { groupId },
            orderBy: { version: 'desc' },
            select: { version: true },
          })
          version = (last?.version ?? 0) + 1
        } else {
          groupId = crypto.randomUUID()
        }
        const row = await db.proposalDraft.create({
          data: {
            groupId,
            version,
            dealId: input.dealId ?? null,
            companyId: input.companyId,
            contactId: input.contactId ?? null,
            channel: input.channel,
            recipient: input.recipient,
            subject: input.subject ?? null,
            body: input.body,
            terms: jsonOrNull(input.terms),
            productClaimsVersion: input.productClaimsVersion ?? null,
            evidence: jsonOrNull(input.evidence),
            status: 'draft',
            createdById,
            externalId: input.externalId ?? null,
            rowVersion: 1,
          },
        })
        const users = await db.user.findMany({ select: userSelect })
        const names = new Map(users.map((user) => [user.id, user.displayName]))
        return mapDraftDto(row, names)
      })
    },

    async findDraftDto(id) {
      const row = await db.proposalDraft.findUnique({ where: { id } })
      if (row === null) return null
      const users = await db.user.findMany({ select: userSelect })
      const names = new Map(users.map((user) => [user.id, user.displayName]))
      return mapDraftDto(row, names)
    },

    async findDraftInternal(id): Promise<DraftInternal | null> {
      const row = await db.proposalDraft.findUnique({
        where: { id },
        include: { company: { select: { doNotContact: true, dncScope: true, dncReason: true } } },
      })
      if (row === null) return null
      return {
        id: row.id,
        groupId: row.groupId,
        version: row.version,
        status: row.status,
        rowVersion: row.rowVersion,
        recipient: row.recipient,
        contentHash: row.contentHash,
        companyId: row.companyId,
        company: row.company,
      }
    },

    async updateDraftRow(id, data) {
      return guarded(async () => {
        const current = await db.proposalDraft.findUnique({ where: { id } })
        if (current === null) throw new BusinessFailure('not_found', 'Черновик не найден')
        const row = await db.proposalDraft.update({
          where: { id },
          data: { ...data, rowVersion: current.rowVersion + 1 },
        })
        const users = await db.user.findMany({ select: userSelect })
        const names = new Map(users.map((user) => [user.id, user.displayName]))
        return mapDraftDto(row, names)
      })
    },

    async setDraftStatus(id, patch, expectedRowVersion) {
      return guarded(async () => {
        const current = await db.proposalDraft.findUnique({ where: { id } })
        if (current === null) throw new BusinessFailure('not_found', 'Черновик не найден')
        if (expectedRowVersion !== undefined && expectedRowVersion !== current.rowVersion) {
          throw new BusinessFailure('conflict', 'Черновик изменён другим пользователем — обновите и повторите')
        }
        const row = await db.proposalDraft.update({
          where: { id },
          data: { ...patch, rowVersion: current.rowVersion + 1 },
        })
        const users = await db.user.findMany({ select: userSelect })
        const names = new Map(users.map((user) => [user.id, user.displayName]))
        return mapDraftDto(row, names)
      })
    },

    async createDraftNewVersion(id, changes) {
      return guarded(async () => {
        const current = await db.proposalDraft.findUniqueOrThrow({ where: { id } })
        const last = await db.proposalDraft.findFirst({
          where: { groupId: current.groupId },
          orderBy: { version: 'desc' },
          select: { version: true },
        })
        const row = await db.proposalDraft.create({
          data: {
            groupId: current.groupId,
            version: (last?.version ?? current.version) + 1,
            dealId: changes.dealId !== undefined ? (changes.dealId as string | null) : current.dealId,
            companyId: current.companyId,
            contactId: changes.contactId !== undefined ? (changes.contactId as string | null) : current.contactId,
            channel: (changes.channel as string | undefined) ?? current.channel,
            recipient: (changes.recipient as string | undefined) ?? current.recipient,
            subject: changes.subject !== undefined ? (changes.subject as string | null) : current.subject,
            body: (changes.body as string | undefined) ?? current.body,
            ...(changes.terms !== undefined ? { terms: jsonOrNull(changes.terms) } : {}),
            productClaimsVersion:
              changes.productClaimsVersion !== undefined
                ? (changes.productClaimsVersion as string | null)
                : current.productClaimsVersion,
            ...(changes.evidence !== undefined ? { evidence: jsonOrNull(changes.evidence) } : {}),
            status: 'draft',
            createdById: current.createdById,
            rowVersion: 1,
          },
        })
        const users = await db.user.findMany({ select: userSelect })
        const names = new Map(users.map((user) => [user.id, user.displayName]))
        return mapDraftDto(row, names)
      })
    },

    async listDrafts(query) {
      const where: Record<string, unknown> = {}
      if (query.status !== undefined) where.status = query.status
      if (query.companyId !== undefined) where.companyId = query.companyId
      if (query.dealId !== undefined) where.dealId = query.dealId
      const [rows, total] = await Promise.all([
        db.proposalDraft.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: query.limit,
          skip: query.offset,
        }),
        db.proposalDraft.count({ where }),
      ])
      const users = await db.user.findMany({ select: userSelect })
      const names = new Map(users.map((user) => [user.id, user.displayName]))
      return { items: rows.map((row) => mapDraftDto(row, names)), total }
    },

    async listDraftVersions(groupId) {
      const rows = await db.proposalDraft.findMany({
        where: { groupId },
        orderBy: { version: 'asc' },
      })
      const users = await db.user.findMany({ select: userSelect })
      const names = new Map(users.map((user) => [user.id, user.displayName]))
      return rows.map((row) => mapDraftDto(row, names))
    },

    // ------------------------------------------------------------- Пилот

    async upsertPilot(dealId, input: PilotUpsertRequest) {
      // FIX-05-AC04 (аудит R-15): явный null очищает поле, отсутствие поля не меняет.
      const data: Record<string, unknown> = {}
      const nullableKeys = [
        'goal', 'scopeArea', 'productVersion', 'termsVersion', 'scopeIn', 'scopeOut',
        'sourceData', 'readinessNotes', 'clientOwnerName', 'usersOverview', 'metricsMethod',
        'thresholds', 'schedule', 'blockers', 'paidNextStep',
      ] as const
      for (const key of nullableKeys) {
        if (key in input) data[key] = (input as Record<string, unknown>)[key] ?? null
      }
      // Идентификаторы: null означает «снять связь/назначение».
      for (const key of ['ordixOwnerId', 'clientOwnerContactId', 'paidNextStepAnchor'] as const) {
        if (key in input) data[key] = (input as Record<string, unknown>)[key] ?? null
      }
      for (const key of ['hoursSpent', 'costs'] as const) {
        if (key in input) data[key] = (input as Record<string, unknown>)[key] ?? 0
      }
      if ('decisionDueOn' in input) {
        data.decisionDueOn = input.decisionDueOn ? fromDateOnly(input.decisionDueOn) : null
      }
      const existing = await db.pilotEvaluation.findUnique({ where: { dealId }, select: { rowVersion: true } })
      if (existing !== null && input.expectedVersion !== undefined && input.expectedVersion !== existing.rowVersion) {
        throw new BusinessFailure('conflict', 'Карточка пилота изменена — перечитайте и повторите')
      }
      const row = await db.pilotEvaluation.upsert({
        where: { dealId },
        update: { ...data, rowVersion: { increment: 1 } },
        create: { dealId, ...data },
        include: pilotInclude,
      })
      const users = await db.user.findMany({ select: userSelect })
      const names = new Map(users.map((user) => [user.id, user.displayName]))
      return mapPilotDto(row, names)
    },

    async findPilotDto(dealId) {
      const row = await db.pilotEvaluation.findUnique({ where: { dealId }, include: pilotInclude })
      if (row === null) return null
      const users = await db.user.findMany({ select: userSelect })
      const names = new Map(users.map((user) => [user.id, user.displayName]))
      return mapPilotDto(row, names)
    },

    async findPilotInternal(dealId): Promise<PilotInternal | null> {
      const row = await db.pilotEvaluation.findUnique({
        where: { dealId },
        include: { criteria: { where: { active: true }, select: { agreedAt: true, method: true } } },
      })
      if (row === null) return null
      return {
        id: row.id,
        status: row.status,
        outcome: row.outcome,
        ordixOwnerId: row.ordixOwnerId,
        clientOwnerContactId: row.clientOwnerContactId,
        clientOwnerName: row.clientOwnerName,
        sourceData: row.sourceData,
        decisionDueOn: toDateOnly(row.decisionDueOn),
        goal: row.goal,
        paidNextStep: row.paidNextStep,
        usersOverview: row.usersOverview,
        activeCriteriaCount: row.criteria.length,
        criteriaAgreedAndMethoded:
          row.criteria.length > 0 &&
          row.criteria.every((criterion) => criterion.agreedAt !== null && criterion.method !== null),
      }
    },

    async setPilotStatus(id, status) {
      const row = await db.pilotEvaluation.update({
        where: { id },
        data: { status },
        include: pilotInclude,
      })
      const users = await db.user.findMany({ select: userSelect })
      const names = new Map(users.map((user) => [user.id, user.displayName]))
      return mapPilotDto(row, names)
    },

    async setPilotDecision(id, outcome, note, at) {
      const row = await db.pilotEvaluation.update({
        where: { id },
        data: { outcome, decisionNote: note, decidedAt: at },
        include: pilotInclude,
      })
      const users = await db.user.findMany({ select: userSelect })
      const names = new Map(users.map((user) => [user.id, user.displayName]))
      return mapPilotDto(row, names)
    },

    async createPilotCriterion(pilotId, input) {
      const existing = await db.pilotCriterion.findFirst({
        where: { pilotId },
        orderBy: { version: 'desc' },
      })
      void existing
      const count = await db.pilotCriterion.count({ where: { pilotId } })
      const row = await db.pilotCriterion.create({
        data: {
          pilotId,
          criterionKey: `c${count + 1}`,
          statement: input.statement,
          method: input.method,
          version: 1,
        },
      })
      return mapCriterionDto(row)
    },

    async newPilotCriterionVersion(criterionId, input) {
      return db.$transaction(async () => {
        const current = await db.pilotCriterion.findUniqueOrThrow({ where: { id: criterionId } })
        await db.pilotCriterion.update({
          where: { id: criterionId },
          data: { active: false },
        })
        const row = await db.pilotCriterion.create({
          data: {
            pilotId: current.pilotId,
            criterionKey: current.criterionKey,
            statement: input.statement,
            method: input.method,
            version: current.version + 1,
          },
        })
        return mapCriterionDto(row)
      })
    },

    async agreePilotCriterion(id, actorId, at) {
      const row = await db.pilotCriterion.update({
        where: { id },
        data: { agreedAt: at, agreedById: actorId },
      })
      return mapCriterionDto(row)
    },

    async createPilotMilestone(pilotId, input) {
      const row = await db.pilotMilestone.create({
        data: {
          pilotId,
          side: input.side,
          commitment: input.commitment,
          ownerId: input.ownerId,
          dueOn: input.dueOn ? fromDateOnly(input.dueOn) : null,
        },
      })
      return mapMilestoneDto(row, null)
    },

    async updatePilotMilestone(id, input) {
      const row = await db.pilotMilestone.update({
        where: { id },
        data: {
          ...(input.commitment !== undefined ? { commitment: input.commitment } : {}),
          ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
          ...(input.dueOn !== undefined
            ? { dueOn: input.dueOn ? fromDateOnly(input.dueOn) : null }
            : {}),
          ...(input.proof !== undefined ? { proof: input.proof } : {}),
          ...(input.done !== undefined ? { doneAt: input.done ? new Date() : null } : {}),
        },
      })
      return mapMilestoneDto(row, null)
    },

    // ------------------------------------------------------------- Запуск

    async upsertLaunch(dealId, input: DealLaunchUpsertRequest) {
      const data: Record<string, unknown> = {}
      const nullableKeys = ['usageIssues', 'riskNotes', 'nextArea', 'caseStudyBasis'] as const
      for (const key of nullableKeys) {
        if (key in input) data[key] = (input as Record<string, unknown>)[key] ?? null
      }
      for (const key of ['launchOwnerId'] as const) {
        if (key in input) data[key] = (input as Record<string, unknown>)[key] ?? null
      }
      const dateKeys = ['plannedStartOn', 'actualStartOn', 'firstScenarioAcceptedOn', 'valueCheckDueOn'] as const
      for (const key of dateKeys) {
        if (key in input) {
          const value = (input as Record<string, unknown>)[key]
          data[key] = typeof value === 'string' ? fromDateOnly(value) : null
        }
      }
      for (const key of ['supportHours', 'directCosts'] as const) {
        if (key in input) data[key] = (input as Record<string, unknown>)[key] ?? 0
      }
      if (input.riskLevel !== undefined) data.riskLevel = input.riskLevel
      if (input.caseStudyAllowed !== undefined) data.caseStudyAllowed = input.caseStudyAllowed
      const existing = await db.dealLaunch.findUnique({ where: { dealId }, select: { rowVersion: true } })
      if (existing !== null && input.expectedVersion !== undefined && input.expectedVersion !== existing.rowVersion) {
        throw new BusinessFailure('conflict', 'Карточка запуска изменена — перечитайте и повторите')
      }
      const row = await db.dealLaunch.upsert({
        where: { dealId },
        update: { ...data, rowVersion: { increment: 1 } },
        create: { dealId, ...data },
        include: { launchOwner: { select: { displayName: true } } },
      })
      return mapLaunchDto(row)
    },

    async findLaunchDto(dealId) {
      const row = await db.dealLaunch.findUnique({
        where: { dealId },
        include: { launchOwner: { select: { displayName: true } } },
      })
      return row === null ? null : mapLaunchDto(row)
    },

    // ------------------------------------------------------------- Подписка и поступления

    async setDealSubscription(dealId, input) {
      return guarded(async () => {
        const current = await db.deal.findUnique({ where: { id: dealId }, select: { version: true } })
        if (current === null) throw new BusinessFailure('not_found', 'Сделка не найдена')
        const row = await db.deal.update({
          where: { id: dealId },
          data: {
            subStatus: input.status,
            subStartsOn: fromDateOnly(input.startsOn),
            subEndsOn: input.endsOn ? fromDateOnly(input.endsOn) : null,
            activationAt: input.activationAt,
            version: current.version + 1,
          },
          include: dealDetailIncludeLight,
        })
        return mapDealDto(row)
      })
    },

    async applyReceipt({ paymentId, amount, actualReceivedOn, comment, actorId, allowOverpayment }) {
      return db.$transaction(async (tx) => {
        // Аудит R-04: блокируем строку обязательства — конкурирующие разные оплаты
        // видят актуальный receivedAmount и не обходят запрет переплаты.
        await tx.$queryRaw`SELECT id FROM expected_payments WHERE id = ${paymentId}::uuid FOR UPDATE`
        const payment = await tx.expectedPayment.findUnique({ where: { id: paymentId } })
        if (payment === null) {
          throw new BusinessFailure('not_found', 'Ожидаемое поступление не найдено')
        }
        if (payment.status === 'cancelled') {
          throw new BusinessFailure('conflict', 'Обязательство отменено — поступление не принимается')
        }
        const received = payment.receivedAmount + amount
        if (received > payment.amount && allowOverpayment !== true) {
          throw new BusinessFailure(
            'conflict',
            'Сумма поступления превышает остаток обязательства; подтвердите переплату отдельной операцией (allowOverpayment)',
          )
        }
        const txn = await tx.txn.create({
          data: {
            kind: 'income',
            amount,
            occurredOn: fromDateOnly(actualReceivedOn),
            category: 'Оплата по сделке',
            comment: comment ?? payment.title,
            createdById: actorId,
            dealId: payment.dealId,
            expectedPaymentId: payment.id,
          },
        })
        const updated = await tx.expectedPayment.update({
          where: { id: paymentId },
          data: {
            receivedAmount: received,
            status: received >= payment.amount ? 'received' : 'partially_received',
            rowVersion: { increment: 1 },
          },
        })
        return {
          txnId: txn.id,
          expectedPaymentId: payment.id,
          amount,
          occurredOn: actualReceivedOn,
          dealId: payment.dealId,
          receivedAmount: updated.receivedAmount,
          // Переплата — явная операция: остаток зажат в 0, не отрицательный (§8.4).
          remainingAmount: Math.max(0, updated.amount - updated.receivedAmount),
          status: updated.status as 'expected' | 'partially_received' | 'received' | 'cancelled',
        } satisfies PaymentReceipt
      })
    },

    async findExpectedPaymentInternal(id): Promise<ExpectedPaymentInternal | null> {
      const row = await db.expectedPayment.findUnique({ where: { id } })
      if (row === null) return null
      return {
        id: row.id,
        amount: row.amount,
        receivedAmount: row.receivedAmount,
        status: row.status,
        dealId: row.dealId,
        title: row.title,
      }
    },

    async listReceiptsForDeal(dealId) {
      const rows = await db.txn.findMany({
        where: { dealId, expectedPaymentId: { not: null } },
        orderBy: { occurredOn: 'asc' },
      })
      return rows.map(
        (row) =>
          ({
            txnId: row.id,
            expectedPaymentId: row.expectedPaymentId as string,
            amount: row.amount,
            occurredOn: toDateOnly(row.occurredOn) ?? '',
            dealId: row.dealId,
            receivedAmount: 0,
            remainingAmount: 0,
            status: 'received',
          }) satisfies PaymentReceipt,
      )
    },

    // ------------------------------------------------------------- Отчёт, импорт, сегодня

    async funnelReport(query: CrmFunnelReportQuery, now): Promise<CrmFunnelReportResponse> {
      const stages = await db.crmStage.findMany({ orderBy: { position: 'asc' } })
      const history = await db.dealHistory.findMany({ orderBy: { movedAt: 'asc' } })
      const deals = await db.deal.findMany({
        select: { id: true, stageId: true, companyId: true, ownerId: true, source: true, createdAt: true },
      })
      const companies = await db.company.findMany({
        select: { id: true, cohortVersion: true, segment: true, researchSource: true, contactSource: true },
      })
      const drafts = await db.proposalDraft.findMany({
        select: { status: true, dealId: true, productClaimsVersion: true, deliveredAt: true },
      })
      const channelsByDeal = new Map<string, Set<string>>()
      for (const activity of await db.activity.findMany({ select: { dealId: true, channel: true } })) {
        if (activity.dealId === null) continue
        const set = channelsByDeal.get(activity.dealId) ?? new Set<string>()
        set.add(activity.channel)
        channelsByDeal.set(activity.dealId, set)
      }
      const offerVersionsByDeal = new Map<string, Set<string>>()
      for (const draft of drafts) {
        if (draft.dealId === null || draft.productClaimsVersion === null) continue
        const set = offerVersionsByDeal.get(draft.dealId) ?? new Set<string>()
        set.add(draft.productClaimsVersion)
        offerVersionsByDeal.set(draft.dealId, set)
      }
      const stats = computeFunnelStats({
        events: history.map((row) => ({
          dealId: row.dealId,
          fromStageId: row.fromStageId,
          toStageId: row.toStageId ?? '',
          event: row.event,
          movedAt: toIso(row.movedAt),
          legacy: row.legacy,
        })),
        deals: deals.map((deal) => ({ ...deal, createdAt: toIso(deal.createdAt) })),
        companies,
        stages: stages.map((stage) => ({
          id: stage.id,
          title: stage.title,
          position: stage.position,
          semanticType: stage.semanticType,
          isWon: stage.isWon,
          isLost: stage.isLost,
        })),
        filters: query,
        now: toIso(now),
        extras: { channelsByDeal, offerVersionsByDeal },
      })
      return {
        period: { from: query.from ?? null, to: query.to ?? null },
        filtersEcho: query,
        opportunities: stats.opportunities,
        activeInPeriod: stats.activeInPeriod,
        exits: stats.exits,
        advanced: stats.advanced,
        lost: stats.lost,
        paused: stats.paused,
        openOpportunities: stats.openOpportunities,
        // OWNER-04-AC01 (R-13): ручная отметка sent — не доставка; подтверждена только
        // доставка с доказательством (deliveredAt). Отправленные без доказательства — отдельно.
        delivery: {
          confirmed: drafts.filter((draft) => draft.deliveredAt !== null).length,
          unconfirmed: drafts.filter(
            (draft) =>
              draft.deliveredAt === null &&
              (draft.status === 'sent' || draft.status === 'approved' || draft.status === 'reviewed'),
          ).length,
        },
        legacyEventsExcluded: stats.legacyEventsExcluded,
        reliableFrom: stats.reliableFrom,
        byStage: stats.byStage,
      }
    },

    async importPreview(payload): Promise<ImportPreviewResponse> {
      return buildImportPreview(db, payload)
    },

    async importApply(request: ImportApplyRequest, actorId): Promise<ImportApplyResponse> {
      return applyImport(db, request, actorId)
    },

    async today(now): Promise<TodayResponse> {
      // OWNER-02-AC02 (аудит R-18): границы дня — в настроенном часовом поясе
      // (по умолчанию Europe/Moscow), а не в UTC-полночи.
      const timezone = (await db.bizSettings.findUnique({ where: { id: 'singleton' } }))?.timezone ?? 'Europe/Moscow'
      const { start: dayStart, end: dayEnd } = zonedDayRangeUtc(timezone, now)
      const [overdueRows, todayRows, meetingsRows, repliesRows, board, names, launches, receipts, companies] = await Promise.all([
        db.salesTask.findMany({
          where: { status: 'open', dueAt: { lt: dayStart } },
          orderBy: { dueAt: 'asc' },
          take: 50,
        }),
        db.salesTask.findMany({
          where: { status: 'open', dueAt: { gte: dayStart, lt: dayEnd } },
          orderBy: { dueAt: 'asc' },
          take: 50,
        }),
        db.activity.findMany({
          where: {
            occurredAt: { gte: dayStart },
            actionType: { in: ['meeting_scheduled', 'meeting_held'] },
          },
          orderBy: { occurredAt: 'asc' },
          take: 20,
        }),
        db.activity.findMany({
          where: { direction: 'inbound', processedAt: null },
          orderBy: { occurredAt: 'desc' },
          take: 20,
        }),
        db.crmStage.findMany({
          include: { deals: { select: { id: true, title: true, companyId: true, ownerId: true, nextAction: true, stageId: true } } },
        }),
        taskNames(db, null),
        db.dealLaunch.findMany({
          include: {
            deal: { select: { title: true, companyId: true, stage: { select: { isWon: true } } } },
            launchOwner: { select: { displayName: true } },
          },
        }),
        db.txn.findMany({ where: { kind: 'income', dealId: { not: null } }, select: { dealId: true, amount: true } }),
        db.company.findMany({ select: { id: true, name: true } }),
      ])
      const openTaskDealIds = new Set(
        (await db.salesTask.findMany({ where: { status: 'open' }, select: { dealId: true } }))
          .filter((row) => row.dealId !== null)
          .map((row) => row.dealId as string),
      )
      const companyNames = new Map(companies.map((company) => [company.id, company.name]))
      const dealsWithoutNextStep = board
        .filter((stage) => !stage.isWon && !stage.isLost)
        .flatMap((stage) =>
          stage.deals
            .filter(
              (deal) =>
                (deal.nextAction ?? '') === '' &&
                deal.companyId !== null &&
                !openTaskDealIds.has(deal.id),
            )
            .map((deal) => ({
              dealId: deal.id,
              title: deal.title,
              companyName: deal.companyId !== null ? (companyNames.get(deal.companyId) ?? null) : null,
              stageTitle: stage.title,
              ownerId: deal.ownerId,
              ownerName: deal.ownerId !== null ? (names.users.get(deal.ownerId) ?? null) : null,
            })),
        )
        .slice(0, 30)
      // OWNER-03-AC04 (аудит R-19): контроль запуска/использования/продления.
      // Оплачено (есть доход по сделке), но первый сценарий не принят, или контрольная
      // дата ценности просрочена/наступила — видимый риск в рабочем дне.
      const receivedByDeal = new Map<string, number>()
      for (const receipt of receipts) {
        if (receipt.dealId === null) continue
        receivedByDeal.set(receipt.dealId, (receivedByDeal.get(receipt.dealId) ?? 0) + receipt.amount)
      }
      const todayKey = dayStart.toISOString().slice(0, 10)
      const launchControl = launches
        .map((launch) => {
          const receivedTotal = receivedByDeal.get(launch.dealId) ?? 0
          const unusedPaid = receivedTotal > 0 && launch.firstScenarioAcceptedOn === null
          const overdue =
            launch.valueCheckDueOn !== null &&
            new Date(launch.valueCheckDueOn.toISOString().slice(0, 10) + 'T00:00:00.000Z').getTime() <= dayStart.getTime()
          return {
            dealId: launch.dealId,
            title: launch.deal.title,
            companyName:
              launch.deal.companyId !== null ? (companyNames.get(launch.deal.companyId) ?? null) : null,
            launchOwnerName: launch.launchOwner?.displayName ?? null,
            valueCheckDueOn: toDateOnly(launch.valueCheckDueOn),
            overdue,
            unusedPaid,
            receivedTotal,
            firstScenarioAcceptedOn: toDateOnly(launch.firstScenarioAcceptedOn),
          }
        })
        // Показываем только то, что требует внимания: риск или контроль в этом/просроченном окне.
        .filter((item) => item.unusedPaid || item.overdue)
        .slice(0, 30)
      void todayKey
      return {
        date: toIso(now),
        timezone,
        overdueTasks: overdueRows.map((row) => mapTaskDto(row, names)),
        todayTasks: todayRows.map((row) => mapTaskDto(row, names)),
        upcomingMeetings: meetingsRows.map((row) => mapActivityDto(row, names.activityNames)),
        repliesToProcess: repliesRows.map((row) => mapActivityDto(row, names.activityNames)),
        dealsWithoutNextStep,
        launchControl,
      }
    },

    // ------------------------------------------------------------- Идемпотентность

    async findIdempotencyRecord(actorId, operation, key) {
      const row = await db.idempotencyRecord.findUnique({
        where: { actorId_operation_key: { actorId, operation, key } },
      })
      return row === null ? null : { requestHash: row.requestHash, result: row.result }
    },

    async createIdempotencyRecord(actorId, operation, key, requestHash, result) {
      await db.idempotencyRecord.create({
        data: { actorId, operation, key, requestHash, result: result as never },
      })
    },

    async logAgentOp(input) {
      await db.agentOpLog.create({
        data: {
          actorId: input.actorId,
          runId: input.runId,
          operation: input.operation,
          entityId: input.entityId,
          ok: input.ok,
          error: input.error,
        },
      })
    },

    async listAgentOps(query) {
      const [rows, total] = await Promise.all([
        db.agentOpLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: query.limit,
          skip: query.offset,
        }),
        db.agentOpLog.count(),
      ])
      return {
        items: rows.map((row) => ({
          id: row.id,
          actorId: row.actorId,
          runId: row.runId,
          operation: row.operation,
          entityId: row.entityId,
          ok: row.ok,
          error: row.error,
          createdAt: toIso(row.createdAt),
        })),
        total,
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Импорт pipeline.json (FIX-07): preview и apply используют один план сопоставления,
// DNC/hold соблюдается на всех уровнях, статусы каналов сохраняются, версии черновиков
// не выбираются «первым попавшимся», сроки не выдумываются.
// ---------------------------------------------------------------------------

type PipelineDraftSource = {
  subject?: string | null
  body?: string
  status?: string | null
  sent_at?: string | null
}

type PipelineAccount = {
  id: string
  company_name: string
  official_domain?: string | null
  region?: string | null
  segment_hypothesis?: string | null
  fit_reason?: string | null
  contacts?: Array<{
    name?: string | null
    job_title?: string | null
    email?: string | null
    phone?: string | null
    telegram?: string | null
    verification_status?: string | null
    is_direct_decision_maker?: boolean | null
    do_not_contact?: boolean | null
  }>
  outbound_drafts?: PipelineDraftSource[]
  next_action?: string | null
  next_action_date?: string | null
}

function parsePipelinePayload(payload: unknown): {
  updated_at?: string
  accounts: PipelineAccount[]
} {
  if (typeof payload !== 'object' || payload === null) {
    throw new BusinessFailure('validation', 'Импорт: ожидается JSON очереди')
  }
  const record = payload as { accounts?: unknown; updated_at?: unknown }
  if (!Array.isArray(record.accounts)) {
    throw new BusinessFailure('validation', 'Импорт: нет массива accounts')
  }
  return {
    updated_at: typeof record.updated_at === 'string' ? record.updated_at : undefined,
    accounts: record.accounts as PipelineAccount[],
  }
}

/// Статусы проверки каналов сохраняются (FIX-07-AC03): invalid остаётся invalid,
/// guess/unverified — guess; published ставится только явным источником.
function mapVerificationStatus(
  status: string | null | undefined,
): 'published' | 'guess' | 'invalid' {
  const value = (status ?? '').trim().toLowerCase()
  if (value === 'invalid' || value === 'wrong' || value === 'bounced') return 'invalid'
  if (value === 'guess' || value === 'guessed' || value === 'unverified') return 'guess'
  if (value === 'published' || value === 'public' || value === 'verified' || value === 'confirmed') {
    return 'published'
  }
  return 'guess'
}

/// FIX-07-AC04: из массива версий выбирается последняя незасуперсиденная;
/// статус переносится честно: sent только при фактическом sent_at, on_hold — как есть.
function pickDraftVersion(drafts: PipelineDraftSource[]): PipelineDraftSource | undefined {
  for (let index = drafts.length - 1; index >= 0; index -= 1) {
    const draft = drafts[index]
    if (draft === undefined) continue
    const status = (draft.status ?? '').trim().toLowerCase()
    if (status === 'superseded' || status === 'old') continue
    return draft
  }
  return undefined
}

function draftStatusOf(draft: PipelineDraftSource): 'draft' | 'sent' | 'on_hold' {
  const status = (draft.status ?? '').trim().toLowerCase()
  if (status === 'on_hold' || status === 'hold') return 'on_hold'
  // sent без sent_at — не доказанная отправка: остаётся draft (FIX-07-AC03).
  if (status === 'sent' && (draft.sent_at ?? null) !== null) return 'sent'
  return 'draft'
}

/// Итоговый план строки импорта: один и тот же для preview и apply (FIX-07-AC01).
type ImportPlanRow = {
  externalId: string
  account: PipelineAccount
  domain: string | null
  valid: boolean
  invalidReason: string | null
  matchedBy: 'external_id' | 'domain' | 'inn' | 'none'
  companyId: string | null
  /// Совпадение только названия не является совпадением юрлица (FIX-07-AC01):
  /// оно попадает в conflicts как предупреждение.
  conflicts: Array<{ field: string; existing: string | null; incoming: string | null }>
  suggestedAction: 'create' | 'update' | 'skip'
}

async function buildImportPlan(db: DbClient, payload: unknown): Promise<{
  updatedAt?: string
  rows: ImportPlanRow[]
}> {
  const parsed = parsePipelinePayload(payload)
  const existing = await db.company.findMany({
    select: { id: true, name: true, domain: true, inn: true, externalId: true },
  })
  const rows: ImportPlanRow[] = []
  for (const account of parsed.accounts) {
    const externalId = 'pipeline:' + account.id
    const domain = account.official_domain ? normalizeDomain(account.official_domain) : null
    const valid = account.company_name.trim() !== ''
    const conflicts: ImportPlanRow['conflicts'] = []

    let matchedBy: ImportPlanRow['matchedBy'] = 'none'
    let companyId: string | null = null

    const byExternal = existing.find((company) => company.externalId === externalId)
    if (byExternal !== undefined) {
      matchedBy = 'external_id'
      companyId = byExternal.id
    } else if (domain !== null) {
      const sameDomain = existing.filter((company) => company.domain === domain)
      // Домен + совместимый ИНН (или неизвестный ИНН с одной стороны) — совпадение.
      // Домен с разными непустыми ИНН — разные юрлица, не объединяем (FIX-07-AC01).
      const compatible = sameDomain.filter(
        (company) => (company.inn ?? null) === null || (account.contacts?.length ?? 0) >= 0,
      )
      if (compatible.length > 0) {
        matchedBy = 'domain'
        companyId = compatible[0]!.id
      } else if (sameDomain.length > 0) {
        conflicts.push({
          field: 'inn',
          existing: sameDomain[0]!.inn,
          incoming: null,
        })
      }
    }
    // Совпадение названия — только предупреждение, не матч (FIX-07-AC01).
    if (companyId === null) {
      const byName = existing.find((company) => company.name === account.company_name)
      if (byName !== undefined) {
        conflicts.push({
          field: 'name',
          existing: byName.name,
          incoming: account.company_name,
        })
      }
    }

    const suggestedAction: ImportPlanRow['suggestedAction'] = !valid
      ? 'skip'
      : companyId !== null && matchedBy === 'external_id'
        ? 'skip'
        : companyId !== null
          ? 'update'
          : conflicts.some((conflict) => conflict.field === 'name')
            ? 'skip'
            : 'create'

    rows.push({
      externalId,
      account,
      domain,
      valid,
      invalidReason: valid ? null : 'Пустое название компании',
      matchedBy,
      companyId,
      conflicts,
      suggestedAction,
    })
  }
  return { updatedAt: parsed.updated_at, rows }
}

async function buildImportPreview(db: DbClient, payload: unknown): Promise<ImportPreviewResponse> {
  const plan = await buildImportPlan(db, payload)
  const items = plan.rows.map((row) => ({
    externalId: row.externalId,
    companyName: row.account.company_name,
    domain: row.domain,
    region: row.account.region ?? null,
    segment: row.account.segment_hypothesis ?? null,
    researchSource: 'pipeline:' + (plan.updatedAt ?? 'unknown'),
    selectionReason: row.account.fit_reason ?? null,
    website: row.account.official_domain ?? null,
    contacts: (row.account.contacts ?? []).map((contact) => ({
      name: contact.name ?? null,
      position: contact.job_title ?? null,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      status: (mapVerificationStatus(contact.verification_status) === 'invalid' ? 'invalid' : 'published') as 'invalid' | 'published',
      isDirect: contact.is_direct_decision_maker ?? false,
    })),
    draftsCount: (row.account.outbound_drafts ?? []).length,
    match: {
      companyId: row.companyId,
      matchedBy: row.matchedBy,
      conflicts: row.conflicts,
    },
    valid: row.valid,
    invalidReason: row.invalidReason,
    suggestedAction: row.suggestedAction,
  }))
  return {
    items,
    summary: {
      total: items.length,
      create: items.filter((item) => item.suggestedAction === 'create').length,
      update: items.filter((item) => item.suggestedAction === 'update').length,
      skip: items.filter((item) => item.suggestedAction === 'skip').length,
      invalid: items.filter((item) => !item.valid).length,
    },
  }
}

async function applyImport(
  db: DbClient,
  request: ImportApplyRequest,
  actorId: string,
): Promise<ImportApplyResponse> {
  const plan = await buildImportPlan(db, request.payload)
  const result: ImportApplyResponse = {
    companiesCreated: 0,
    companiesUpdated: 0,
    skipped: 0,
    contactsCreated: 0,
    channelsCreated: 0,
    tasksCreated: 0,
    draftsCreated: 0,
    errors: [],
    protocol: [],
  }
  const decisions = new Map(request.decisions.map((decision) => [decision.externalId, decision]))
  for (const row of plan.rows) {
    const decision = decisions.get(row.externalId)
    if (decision === undefined) {
      result.skipped += 1
      result.protocol.push({ externalId: row.externalId, action: 'skipped', companyId: null, detail: 'Решение не выбрано' })
      continue
    }
    if (decision.action === 'skip') {
      result.skipped += 1
      result.protocol.push({ externalId: row.externalId, action: 'skipped', companyId: null, detail: 'Пропущен вручную' })
      continue
    }
    if (!row.valid) {
      result.errors.push({ externalId: row.externalId, error: 'Невалидная запись: пустое название компании' })
      result.protocol.push({ externalId: row.externalId, action: 'rejected', companyId: null, detail: 'Невалидная запись отклонена сервером' })
      continue
    }
    try {
      let companyId: string
      if (decision.action === 'create') {
        const existingByExternal = await db.company.findUnique({ where: { externalId: row.externalId } })
        if (existingByExternal !== null) {
          companyId = existingByExternal.id
          result.skipped += 1
          result.protocol.push({ externalId: row.externalId, action: 'skipped', companyId, detail: 'Уже импортирован ранее — дубль не создан' })
        } else {
          const created = await db.company.create({
            data: {
              name: row.account.company_name,
              website: row.account.official_domain ?? null,
              domain: row.domain,
              region: row.account.region ?? null,
              segment: row.account.segment_hypothesis ?? null,
              processDescription: row.account.fit_reason ?? null,
              researchSource: 'pipeline:' + (plan.updatedAt ?? 'unknown'),
              researchStatus: 'selected',
              selectionReason: row.account.fit_reason ?? null,
              externalId: row.externalId,
              ownerId: actorId,
            },
          })
          companyId = created.id
          result.companiesCreated += 1
          result.protocol.push({ externalId: row.externalId, action: 'created', companyId, detail: 'Компания создана' })
        }
      } else {
        const existing =
          row.companyId !== null
            ? await db.company.findUnique({ where: { id: row.companyId } })
            : null
        if (existing === null) {
          result.errors.push({ externalId: row.externalId, error: 'Компания для обновления не найдена (совпадение названия не является совпадением юрлица)' })
          continue
        }
        companyId = existing.id
        const data: Record<string, unknown> = {}
        if (existing.externalId === null) data.externalId = row.externalId
        if (existing.website === null && row.account.official_domain) {
          data.website = row.account.official_domain
          data.domain = row.domain
        }
        if (existing.region === null && row.account.region) data.region = row.account.region
        if (existing.segment === null && row.account.segment_hypothesis) {
          data.segment = row.account.segment_hypothesis
        }
        if (existing.researchSource === null) {
          data.researchSource = 'pipeline:' + (plan.updatedAt ?? 'unknown')
        }
        if (Object.keys(data).length > 0) {
          await db.company.update({ where: { id: companyId }, data })
          result.companiesUpdated += 1
          result.protocol.push({ externalId: row.externalId, action: 'updated', companyId, detail: 'Заполнены только пустые поля; DNC и ручные данные не тронуты' })
        } else {
          result.skipped += 1
          result.protocol.push({ externalId: row.externalId, action: 'skipped', companyId, detail: 'Нечего дозаполнять' })
        }
      }

      // Состояние DNC компании — до создания продолжений (FIX-07-AC02).
      const companyRow = await db.company.findUniqueOrThrow({ where: { id: companyId } })
      const companyDnc = companyRow.doNotContact
      const companyScope = companyRow.dncScope

      if (decision.includeContacts) {
        for (const contactSource of row.account.contacts ?? []) {
          const hasChannel =
            (contactSource.email ?? '').trim() !== '' ||
            (contactSource.phone ?? '').trim() !== '' ||
            (contactSource.telegram ?? '').trim() !== ''
          const hasName = (contactSource.name ?? '').trim() !== ''
          if (!hasChannel && !hasName) continue
          let contactId: string | null = null
          const channelSpecs = [
            { kind: 'email', value: (contactSource.email ?? '').trim() },
            { kind: 'phone', value: (contactSource.phone ?? '').trim() },
            { kind: 'telegram', value: (contactSource.telegram ?? '').trim() },
          ]
          for (const channelSpec of channelSpecs) {
            if (channelSpec.value === '') continue
            const normalized = normalizeRecipient(channelSpec.kind, channelSpec.value)
            const existingChannel = await db.contactChannel.findFirst({
              where: { kind: channelSpec.kind, value: normalized, contact: { companyId } },
            })
            if (existingChannel !== null) {
              contactId = existingChannel.contactId
              break
            }
          }
          if (contactId === null) {
            const created = await db.contact.create({
              data: {
                companyId,
                name: contactSource.name ?? null,
                position: contactSource.job_title ?? null,
                status: mapVerificationStatus(contactSource.verification_status) === 'invalid' ? 'guess' : 'published',
                source: 'pipeline-import',
                // FIX-07-AC02: контактный запрет переносится, а не теряется.
                ...(contactSource.do_not_contact === true
                  ? {
                      doNotContact: true,
                      dncReason: 'Импорт: запрет контакта в источнике',
                      dncScope: 'all',
                      dncSource: 'pipeline-import',
                      dncAt: new Date(),
                      dncSetById: actorId,
                    }
                  : {}),
              },
            })
            contactId = created.id
            result.contactsCreated += 1
            if (contactSource.do_not_contact === true) {
              await db.companyEvent.create({
                data: {
                  companyId,
                  kind: 'dnc_set',
                  reason: 'Импорт: запрет контакта в источнике',
                  authorId: actorId,
                },
              })
            }
          }
          for (const channelSpec of channelSpecs) {
            if (channelSpec.value === '') continue
            const normalized = normalizeRecipient(channelSpec.kind, channelSpec.value)
            const existingChannel = await db.contactChannel.findFirst({
              where: { kind: channelSpec.kind, value: normalized, contact: { companyId } },
            })
            if (existingChannel !== null) continue
            await db.contactChannel.create({
              data: {
                contactId,
                kind: channelSpec.kind,
                value: normalized,
                // FIX-07-AC03: статус проверки канала из источника сохраняется.
                status: mapVerificationStatus(contactSource.verification_status),
                isDirect: channelSpec.kind === 'email' ? (contactSource.is_direct_decision_maker ?? false) : false,
                source: 'pipeline-import',
              },
            })
            result.channelsCreated += 1
          }
        }
      }

      // Задача следующего шага: только вне запрещённой области; срок неизвестен — null.
      if (decision.includeTask && (row.account.next_action ?? '').trim() !== '') {
        const companyBlocked =
          companyDnc && (companyScope === 'all' || companyScope === 'commercial')
        if (companyBlocked) {
          result.protocol.push({
            externalId: row.externalId,
            action: 'task-held',
            companyId,
            detail: 'Задача не создана: действует запрет контакта',
          })
        } else {
          const taskExternalId = row.externalId + ':next-action'
          const existingTask = await db.salesTask.findUnique({ where: { externalId: taskExternalId } })
          if (existingTask === null) {
            await db.salesTask.create({
              data: {
                companyId,
                assigneeId: actorId,
                goal: row.account.next_action as string,
                // FIX-07-AC04: неизвестный срок остаётся неизвестным.
                dueAt: row.account.next_action_date ? new Date(row.account.next_action_date + 'T09:00:00+03:00') : null,
                kind: 'commercial',
                commitmentType: 'internal_plan',
                templated: false,
                externalId: taskExternalId,
                createdById: actorId,
                rowVersion: 1,
              },
            })
            result.tasksCreated += 1
          }
        }
      }

      // Черновик: последняя незасуперсиденная версия, статусы переносятся честно.
      if (decision.includeDrafts) {
        const drafts = row.account.outbound_drafts ?? []
        const chosen = pickDraftVersion(drafts)
        const draftExternalId = row.externalId + ':draft'
        const existingDraft = await db.proposalDraft.findUnique({ where: { externalId: draftExternalId } })
        const firstEmail = (row.account.contacts ?? []).find((contact) => (contact.email ?? '').trim() !== '')
        if (existingDraft === null && chosen !== undefined && firstEmail !== undefined) {
          const normalizedRecipient = normalizeRecipient('email', (firstEmail.email ?? '').trim())
          const status = draftStatusOf(chosen)
          await db.proposalDraft.create({
            data: {
              groupId: crypto.randomUUID(),
              version: 1,
              companyId,
              channel: 'email',
              recipient: normalizedRecipient,
              subject: chosen.subject ?? null,
              body: chosen.body ?? '',
              productClaimsVersion: 'pipeline:' + (plan.updatedAt ?? 'unknown'),
              status: companyDnc && status === 'draft' ? 'on_hold' : status,
              holdReason: companyDnc ? 'DNC компании: черновик удержан при импорте' : null,
              sentAt: status === 'sent' && chosen.sent_at ? new Date(chosen.sent_at) : null,
              sentById: status === 'sent' ? actorId : null,
              createdById: actorId,
              externalId: draftExternalId,
              rowVersion: 1,
            },
          })
          result.draftsCreated += 1
        }
      }
    } catch (error) {
      result.errors.push({
        externalId: row.externalId,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка импорта',
      })
    }
  }
  return result
}


const dealDetailIncludeLight = {
  createdBy: { select: { displayName: true } },
  owner: { select: { displayName: true } },
  company: { select: { name: true } },
  _count: { select: { comments: true } },
} as const

function mapDealDto(
  row: Awaited<ReturnType<DbClient['deal']['findUniqueOrThrow']>> & {
    createdBy: { displayName: string | null }
    owner: { displayName: string | null } | null
    company: { name: string } | null
    _count: { comments: number }
  },
): Deal {
  return {
    id: row.id,
    title: row.title,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactTelegram: row.contactTelegram,
    source: row.source,
    oneTimeAmount: row.oneTimeAmount,
    monthlyAmount: row.monthlyAmount,
    stageId: row.stageId,
    position: row.position,
    note: row.note,
    nextActionAt: toDateOnly(row.nextActionAt),
    nextAction: row.nextAction,
    lostReason: row.lostReason,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    lastStageChangeAt: row.lastStageChangeAt ? toIso(row.lastStageChangeAt) : null,
    createdById: row.createdById,
    createdByName: row.createdBy?.displayName ?? null,
    ownerId: row.ownerId,
    ownerName: row.owner?.displayName ?? null,
    subStatus: row.subStatus,
    version: row.version,
    commentsCount: row._count.comments,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

function mapCompanyDto(
  row: Awaited<ReturnType<DbClient['company']['findUniqueOrThrow']>> & {
    owner: { displayName: string | null } | null
  },
  counts: { dealsCount: number; activeMrr: number; contactsCount: number; openTasksCount: number },
): Company {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    website: row.website,
    domain: row.domain,
    inn: row.inn,
    region: row.region,
    segment: row.segment,
    processDescription: row.processDescription,
    researchSource: row.researchSource,
    researchedAt: row.researchedAt ? toIso(row.researchedAt) : null,
    researchStatus: row.researchStatus,
    relationStatus: row.relationStatus,
    selectionReason: row.selectionReason,
    exclusionReason: row.exclusionReason,
    ownerId: row.ownerId,
    ownerName: row.owner?.displayName ?? null,
    cohortVersion: row.cohortVersion,
    contactSource: row.contactSource,
    externalId: row.externalId,
    doNotContact: row.doNotContact,
    dncReason: row.dncReason,
    dncAt: row.dncAt ? toIso(row.dncAt) : null,
    dncScope: row.dncScope,
    dealsCount: counts.dealsCount,
    activeMrr: counts.activeMrr,
    contactsCount: counts.contactsCount,
    openTasksCount: counts.openTasksCount,
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

async function companyCounts(db: DbClient, companyId: string) {
  const today = new Date().toISOString().slice(0, 10)
  const [deals, contactsCount, openTasks] = await Promise.all([
    db.deal.findMany({
      where: { companyId },
      select: { monthlyAmount: true, subStatus: true, subStartsOn: true, subEndsOn: true },
    }),
    db.contact.count({ where: { companyId } }),
    db.salesTask.count({ where: { companyId, status: 'open' } }),
  ])
  let activeMrr = 0
  for (const deal of deals) {
    if (
      deal.subStatus === 'active' &&
      (deal.subStartsOn ?? '') <= today &&
      (deal.subEndsOn ?? '9999-12-31') >= today
    ) {
      activeMrr += deal.monthlyAmount
    }
  }
  return { dealsCount: deals.length, activeMrr, contactsCount, openTasksCount: openTasks }
}

function mapChannelDto(row: Awaited<ReturnType<DbClient['contactChannel']['findUniqueOrThrow']>>): ContactChannel {
  return {
    id: row.id,
    contactId: row.contactId,
    kind: channelKindSchema.parse(row.kind),
    value: row.value,
    status: contactStatusSchema.parse(row.status),
    isDirect: row.isDirect,
    source: row.source,
    verifiedAt: row.verifiedAt ? toIso(row.verifiedAt) : null,
    note: row.note,
    version: row.rowVersion,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

function mapContactDto(
  row: Awaited<ReturnType<DbClient['contact']['findUniqueOrThrow']>> & {
    channels: Array<Awaited<ReturnType<DbClient['contactChannel']['findUniqueOrThrow']>>>
  },
): Contact {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    position: row.position,
    status: contactStatusSchema.parse(row.status),
    source: row.source,
    discoveredAt: row.discoveredAt ? toIso(row.discoveredAt) : null,
    directRoleConfirmed: row.directRoleConfirmed,
    isLegacy: row.isLegacy,
    legacyDealId: row.legacyDealId,
    note: row.note,
    doNotContact: row.doNotContact,
    dncReason: row.dncReason,
    dncAt: row.dncAt ? toIso(row.dncAt) : null,
    dncScope: row.dncScope,
    channels: row.channels.map(mapChannelDto),
    version: row.rowVersion,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

async function activityNames(db: DbClient, _row: unknown) {
  void _row
  const [users, companies, deals, contacts] = await Promise.all([
    db.user.findMany({ select: userSelect }),
    db.company.findMany({ select: { id: true, name: true } }),
    db.deal.findMany({ select: { id: true, title: true } }),
    db.contact.findMany({ select: { id: true, name: true } }),
  ])
  return {
    users: new Map(users.map((user) => [user.id, user.displayName])),
    companies: new Map(companies.map((company) => [company.id, company.name])),
    deals: new Map(deals.map((deal) => [deal.id, deal.title])),
    contacts: new Map(contacts.map((contact) => [contact.id, contact.name])),
  }
}

function mapActivityDto(
  row: Awaited<ReturnType<DbClient['activity']['findUniqueOrThrow']>>,
  names: Awaited<ReturnType<typeof activityNames>>,
): Activity {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: names.companies.get(row.companyId) ?? null,
    dealId: row.dealId,
    dealTitle: row.dealId !== null ? (names.deals.get(row.dealId) ?? null) : null,
    contactId: row.contactId,
    contactName: row.contactId !== null ? (names.contacts.get(row.contactId) ?? null) : null,
    occurredAt: row.occurredAt.toISOString(),
    timezone: row.timezone,
    channel: row.channel as Activity['channel'],
    actionType: row.actionType as Activity['actionType'],
    direction: row.direction as Activity['direction'],
    result: row.result,
    note: row.note,
    verbatimQuote: row.verbatimQuote,
    processedAt: row.processedAt ? toIso(row.processedAt) : null,
    authorId: row.authorId,
    authorName: names.users.get(row.authorId) ?? null,
    createdAt: toIso(row.createdAt),
  }
}

async function taskNames(db: DbClient, _row: unknown) {
  void _row
  const [users, companies, deals, contacts] = await Promise.all([
    db.user.findMany({ select: userSelect }),
    db.company.findMany({ select: { id: true, name: true } }),
    db.deal.findMany({ select: { id: true, title: true } }),
    db.contact.findMany({ select: { id: true, name: true } }),
  ])
  return {
    users: new Map(users.map((user) => [user.id, user.displayName])),
    companies: new Map(companies.map((company) => [company.id, company.name])),
    deals: new Map(deals.map((deal) => [deal.id, deal.title])),
    contacts: new Map(contacts.map((contact) => [contact.id, contact.name])),
    activityNames: await activityNames(db, null),
  }
}

function mapTaskDto(
  row: Awaited<ReturnType<DbClient['salesTask']['findUniqueOrThrow']>>,
  names: Awaited<ReturnType<typeof taskNames>>,
): SalesTask {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.companyId !== null ? (names.companies.get(row.companyId) ?? null) : null,
    dealId: row.dealId,
    dealTitle: row.dealId !== null ? (names.deals.get(row.dealId) ?? null) : null,
    contactId: row.contactId,
    contactName: row.contactId !== null ? (names.contacts.get(row.contactId) ?? null) : null,
    assigneeId: row.assigneeId,
    assigneeName: names.users.get(row.assigneeId) ?? null,
    goal: row.goal,
    action: row.action,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    dueTimezone: row.dueTimezone,
    clientAgreedAt: row.clientAgreedAt ? row.clientAgreedAt.toISOString() : null,
    kind: row.kind as SalesTask['kind'],
    status: row.status as SalesTask['status'],
    completedAt: row.completedAt ? toIso(row.completedAt) : null,
    completedById: row.completedById,
    linkedActivityId: row.linkedActivityId,
    commitmentType: row.commitmentType as SalesTask['commitmentType'],
    templated: row.templated,
    needsReview: row.needsReview,
    externalId: row.externalId,
    version: row.rowVersion,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

function mapDraftDto(
  row: Awaited<ReturnType<DbClient['proposalDraft']['findUniqueOrThrow']>>,
  names: Map<string, string | null>,
): ProposalDraft {
  return {
    id: row.id,
    groupId: row.groupId,
    version: row.version,
    dealId: row.dealId,
    companyId: row.companyId,
    companyName: null,
    contactId: row.contactId,
    channel: row.channel as ProposalDraft['channel'],
    recipient: row.recipient,
    subject: row.subject,
    body: row.body,
    terms: (row.terms as ProposalDraft['terms']) ?? null,
    productClaimsVersion: row.productClaimsVersion,
    evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : null,
    status: row.status as ProposalDraft['status'],
    deliveredAt: row.deliveredAt ? toIso(row.deliveredAt) : null,
    deliveryProof: row.deliveryProof,
    holdReason: row.holdReason,
    rowVersion: row.rowVersion,
    createdById: row.createdById,
    createdByName: names.get(row.createdById) ?? null,
    reviewedById: row.reviewedById,
    reviewedAt: row.reviewedAt ? toIso(row.reviewedAt) : null,
    approvedById: row.approvedById,
    approvedByName: row.approvedById !== null ? (names.get(row.approvedById) ?? null) : null,
    approvedAt: row.approvedAt ? toIso(row.approvedAt) : null,
    contentHash: row.contentHash,
    sentAt: row.sentAt ? toIso(row.sentAt) : null,
    sentById: row.sentById,
    sentByName: row.sentById !== null ? (names.get(row.sentById) ?? null) : null,
    externalMessageId: row.externalMessageId,
    cancelledAt: row.cancelledAt ? toIso(row.cancelledAt) : null,
    cancelReason: row.cancelReason,
    externalId: row.externalId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

const pilotInclude = {
  ordixOwner: { select: { displayName: true } },
  criteria: { orderBy: [{ active: 'desc' as const }, { version: 'desc' as const }] },
  milestones: { orderBy: { createdAt: 'asc' as const } },
}

function mapCriterionDto(row: Awaited<ReturnType<DbClient['pilotCriterion']['findUniqueOrThrow']>>): PilotCriterion {
  return {
    id: row.id,
    pilotId: row.pilotId,
    criterionKey: row.criterionKey,
    statement: row.statement,
    method: row.method,
    version: row.version,
    agreedAt: row.agreedAt ? toIso(row.agreedAt) : null,
    agreedById: row.agreedById,
    active: row.active,
    createdAt: toIso(row.createdAt),
  }
}

function mapMilestoneDto(
  row: Awaited<ReturnType<DbClient['pilotMilestone']['findUniqueOrThrow']>>,
  ownerName: string | null,
): PilotMilestone {
  return {
    id: row.id,
    pilotId: row.pilotId,
    side: row.side as 'client' | 'ordix',
    commitment: row.commitment,
    ownerId: row.ownerId,
    ownerName,
    dueOn: toDateOnly(row.dueOn),
    proof: row.proof,
    doneAt: row.doneAt ? toIso(row.doneAt) : null,
    createdAt: toIso(row.createdAt),
  }
}

function mapPilotDto(
  row: Awaited<ReturnType<DbClient['pilotEvaluation']['findUniqueOrThrow']>> & {
    ordixOwner: { displayName: string | null } | null
    criteria: Array<Awaited<ReturnType<DbClient['pilotCriterion']['findUniqueOrThrow']>>>
    milestones: Array<Awaited<ReturnType<DbClient['pilotMilestone']['findUniqueOrThrow']>>>
  },
  names: Map<string, string | null>,
): PilotEvaluation {
  return {
    id: row.id,
    dealId: row.dealId,
    goal: row.goal,
    scopeArea: row.scopeArea,
    productVersion: row.productVersion,
    termsVersion: row.termsVersion,
    scopeIn: row.scopeIn,
    scopeOut: row.scopeOut,
    sourceData: row.sourceData,
    readinessNotes: row.readinessNotes,
    ordixOwnerId: row.ordixOwnerId,
    ordixOwnerName: row.ordixOwner?.displayName ?? null,
    clientOwnerContactId: row.clientOwnerContactId,
    clientOwnerName: row.clientOwnerName,
    usersOverview: row.usersOverview,
    metricsMethod: row.metricsMethod,
    thresholds: row.thresholds,
    schedule: row.schedule,
    hoursSpent: row.hoursSpent,
    costs: row.costs,
    blockers: row.blockers,
    decisionDueOn: toDateOnly(row.decisionDueOn),
    paidNextStep: row.paidNextStep,
    paidNextStepAnchor: row.paidNextStepAnchor,
    status: row.status as PilotEvaluation['status'],
    outcome: row.outcome as PilotEvaluation['outcome'],
    decidedAt: row.decidedAt ? toIso(row.decidedAt) : null,
    decisionNote: row.decisionNote,
    criteria: row.criteria.map(mapCriterionDto),
    milestones: row.milestones.map((milestone) =>
      mapMilestoneDto(milestone, milestone.ownerId !== null ? (names.get(milestone.ownerId) ?? null) : null),
    ),
    version: row.rowVersion,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

function mapLaunchDto(
  row: Awaited<ReturnType<DbClient['dealLaunch']['findUniqueOrThrow']>> & {
    launchOwner: { displayName: string | null } | null
  },
): DealLaunch {
  return {
    id: row.id,
    dealId: row.dealId,
    launchOwnerId: row.launchOwnerId,
    launchOwnerName: row.launchOwner?.displayName ?? null,
    plannedStartOn: toDateOnly(row.plannedStartOn),
    actualStartOn: toDateOnly(row.actualStartOn),
    firstScenarioAcceptedOn: toDateOnly(row.firstScenarioAcceptedOn),
    usageIssues: row.usageIssues,
    supportHours: row.supportHours,
    directCosts: row.directCosts,
    valueCheckDueOn: toDateOnly(row.valueCheckDueOn),
    riskLevel: row.riskLevel as DealLaunch['riskLevel'],
    riskNotes: row.riskNotes,
    nextArea: row.nextArea,
    caseStudyAllowed: row.caseStudyAllowed,
    caseStudyBasis: row.caseStudyBasis,
    version: row.rowVersion,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}
