import {
  devTaskPrioritySchema,
  devTaskTypeSchema,
  txnKindSchema,
} from '@oculus-business/contracts'
import type {
  BizSettings,
  CrmBoardResponse,
  CrmStage,
  Deal,
  DealComment,
  CreateDealRequest,
  UpdateDealRequest,
  CreateCrmStageRequest,
  UpdateCrmStageRequest,
  DevBoardResponse,
  DevColumn,
  DevTask,
  DevTaskComment,
  CreateDevTaskRequest,
  UpdateDevTaskRequest,
  CreateDevColumnRequest,
  UpdateDevColumnRequest,
  RecurringItem,
  Txn,
  CreateTxnRequest,
  UpdateTxnRequest,
  CreateRecurringItemRequest,
  UpdateRecurringItemRequest,
  ExpectedPayment,
  CreateExpectedPaymentRequest,
  UpdateExpectedPaymentRequest,
  Sprint,
  CreateSprintRequest,
  Company,
  CreateCompanyRequest,
} from '@oculus-business/contracts'

import type { DbClient } from '../../../db'
import { BusinessFailure } from '../domain/errors'
import type { BusinessRepository } from '../application/ports'

type DealRow = Awaited<ReturnType<DbClient['deal']['findUniqueOrThrow']>> & {
  createdBy: { displayName: string | null }
  company: { name: string } | null
}
type DevTaskRow = Awaited<ReturnType<DbClient['devTask']['findUniqueOrThrow']>>
type TxnRow = Awaited<ReturnType<DbClient['txn']['findUniqueOrThrow']>>
type RecurringRow = Awaited<ReturnType<DbClient['recurringItem']['findUniqueOrThrow']>>
type DealCommentRow = Awaited<ReturnType<DbClient['dealComment']['findUniqueOrThrow']>>
type DevTaskCommentRow = Awaited<ReturnType<DbClient['devTaskComment']['findUniqueOrThrow']>>

function toDateOnly(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10)
}

function fromDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function toDealDto(row: DealRow & { _count: { comments: number } }): Deal {
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
    lastStageChangeAt: row.lastStageChangeAt ? row.lastStageChangeAt.toISOString() : null,
    createdById: row.createdById,
    createdByName: row.createdBy?.displayName ?? null,
    commentsCount: row._count.comments,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toDevTaskDto(
  row: DevTaskRow & {
    _count: { comments: number }
    deal: { title: string } | null
    sprint: { name: string } | null
  },
): DevTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: devTaskTypeSchema.parse(row.type),
    priority: devTaskPrioritySchema.parse(row.priority),
    columnId: row.columnId,
    position: row.position,
    dueDate: toDateOnly(row.dueDate),
    fixVersion: row.fixVersion,
    dealId: row.dealId,
    dealTitle: row.deal?.title ?? null,
    sprintId: row.sprintId,
    sprintName: row.sprint?.name ?? null,
    commentsCount: row._count.comments,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toTxnDto(row: TxnRow): Txn {
  return {
    id: row.id,
    kind: txnKindSchema.parse(row.kind),
    amount: row.amount,
    occurredOn: toDateOnly(row.occurredOn) ?? '',
    category: row.category,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toRecurringDto(row: RecurringRow): RecurringItem {
  return {
    id: row.id,
    kind: txnKindSchema.parse(row.kind),
    amount: row.amount,
    category: row.category,
    comment: row.comment,
    dayOfMonth: row.dayOfMonth,
    activeFrom: toDateOnly(row.activeFrom) ?? '',
    activeUntil: toDateOnly(row.activeUntil),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toDealCommentDto(row: DealCommentRow & { author: { displayName: string | null } }): DealComment {
  return {
    id: row.id,
    dealId: row.dealId,
    authorId: row.authorId,
    authorName: row.author.displayName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  }
}

function toDevTaskCommentDto(
  row: DevTaskCommentRow & { author: { displayName: string | null } },
): DevTaskComment {
  return {
    id: row.id,
    taskId: row.taskId,
    authorId: row.authorId,
    authorName: row.author.displayName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  }
}

/// Prisma-коды, которые для пользователя означают конкретную бизнес-ошибку.
function mapPrismaError(error: unknown): unknown {
  const code = (error as { code?: string }).code
  if (code === 'P2003') {
    return new BusinessFailure('not_found', 'Связанная запись не найдена')
  }
  if (code === 'P2025') {
    return new BusinessFailure('not_found', 'Запись не найдена')
  }
  return error
}

async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw mapPrismaError(error)
  }
}

const dealInclude = {
  _count: { select: { comments: true } },
  createdBy: { select: { displayName: true } },
  company: { select: { name: true } },
} as const
const devTaskInclude = {
  _count: { select: { comments: true } },
  deal: { select: { title: true } },
  sprint: { select: { name: true } },
} as const
const commentAuthorInclude = { author: { select: { displayName: true } } } as const

export function createPrismaBusinessRepository(db: DbClient): BusinessRepository {
  return {
    // ------------------------------------------------------------- CRM

    async listCrmBoard() {
      const stages = await db.crmStage.findMany({
        orderBy: { position: 'asc' },
        include: { deals: { orderBy: { position: 'asc' }, include: dealInclude } },
      })
      return stages.map((stage) => ({
        id: stage.id,
        title: stage.title,
        position: stage.position,
        isWon: stage.isWon,
        isLost: stage.isLost,
        deals: stage.deals.map(toDealDto),
      })) satisfies CrmBoardResponse['stages']
    },

    async createDeal(input, createdById, stageId) {
      return guarded(async () => {
        const last = await db.deal.findFirst({
          where: { stageId },
          orderBy: { position: 'desc' },
          select: { position: true },
        })
        const row = await db.deal.create({
          data: {
            title: input.title,
            contactName: input.contactName ?? null,
            contactPhone: input.contactPhone ?? null,
            contactTelegram: input.contactTelegram ?? null,
            source: input.source ?? null,
            oneTimeAmount: input.oneTimeAmount,
            monthlyAmount: input.monthlyAmount,
            note: input.note ?? null,
            nextActionAt: input.nextActionAt ? fromDateOnly(input.nextActionAt) : null,
            nextAction: input.nextAction ?? null,
            companyId: input.companyId ?? null,
            stageId,
            position: (last?.position ?? -1) + 1,
            createdById,
            lastStageChangeAt: new Date(),
          },
          include: dealInclude,
        })
        return toDealDto(row)
      })
    },

    async updateDeal(id, input) {
      return guarded(async () => {
        const data: Record<string, unknown> = {}
        if ('title' in input) data.title = input.title
        if ('contactName' in input) data.contactName = input.contactName ?? null
        if ('contactPhone' in input) data.contactPhone = input.contactPhone ?? null
        if ('contactTelegram' in input) data.contactTelegram = input.contactTelegram ?? null
        if ('source' in input) data.source = input.source ?? null
        if ('oneTimeAmount' in input) data.oneTimeAmount = input.oneTimeAmount
        if ('monthlyAmount' in input) data.monthlyAmount = input.monthlyAmount
        if ('note' in input) data.note = input.note ?? null
        if ('nextActionAt' in input) {
          data.nextActionAt = input.nextActionAt ? fromDateOnly(input.nextActionAt) : null
        }
        if ('nextAction' in input) data.nextAction = input.nextAction ?? null
        if ('lostReason' in input) data.lostReason = input.lostReason ?? null
        if ('companyId' in input) data.companyId = input.companyId ?? null
        if ('stageId' in input && input.stageId !== undefined) data.stageId = input.stageId
        const row = await db.deal.update({ where: { id }, data, include: dealInclude })
        return toDealDto(row)
      })
    },

    async moveDeal(id, stageId, position) {
      return db.$transaction(async (tx) => {
        const moving = await tx.deal.findUnique({ where: { id } })
        if (moving === null) throw new BusinessFailure('not_found', 'Сделка не найдена')
        const stage = await tx.crmStage.findUnique({ where: { id: stageId } })
        if (stage === null) throw new BusinessFailure('not_found', 'Этап не найден')
        const previousStage = await tx.crmStage.findUnique({
          where: { id: moving.stageId },
          select: { title: true },
        })
        const others = (
          await tx.deal.findMany({
            where: { stageId },
            orderBy: { position: 'asc' },
          })
        ).filter((deal) => deal.id !== id)
        const now = new Date()
        if (moving.stageId !== stageId) {
          await tx.dealHistory.create({
            data: {
              dealId: id,
              fromStage: previousStage?.title ?? null,
              toStage: stage.title,
            },
          })
        }
        const clamped = Math.max(0, Math.min(position, others.length))
        const ordered = [
          ...others.slice(0, clamped),
          { ...moving, stageId, lastStageChangeAt: now },
          ...others.slice(clamped),
        ]
        for (let index = 0; index < ordered.length; index += 1) {
          await tx.deal.update({
            where: { id: ordered[index].id },
            data: {
              position: index,
              stageId,
              // Дата смены этапа — только перемещаемой сделке, не всему порядку.
              ...(moving.stageId !== stageId && ordered[index].id === id
                ? { lastStageChangeAt: now }
                : {}),
            },
          })
        }
        const row = await tx.deal.findUniqueOrThrow({ where: { id }, include: dealInclude })
        return toDealDto(row)
      })
    },

    async deleteDeal(id) {
      await guarded(async () => {
        await db.deal.delete({ where: { id } })
      })
    },

    async listDealComments(dealId) {
      const rows = await db.dealComment.findMany({
        where: { dealId },
        orderBy: { createdAt: 'asc' },
        include: commentAuthorInclude,
      })
      return rows.map(toDealCommentDto)
    },

    async createDealComment(dealId, authorId, body) {
      return guarded(async () => {
        const row = await db.dealComment.create({
          data: { dealId, authorId, body },
          include: commentAuthorInclude,
        })
        return toDealCommentDto(row)
      })
    },

    async createStage(input) {
      const last = await db.crmStage.findFirst({
        orderBy: { position: 'desc' },
        select: { position: true },
      })
      const stage = await db.crmStage.create({
        data: {
          title: input.title,
          isWon: input.isWon,
          isLost: input.isLost,
          position: (last?.position ?? -1) + 1,
        },
      })
      return stage satisfies CrmStage
    },

    async updateStage(id, input) {
      return guarded(async () => {
        const data: Record<string, unknown> = {}
        if (input.title !== undefined) data.title = input.title
        if (input.isWon !== undefined) data.isWon = input.isWon
        if (input.isLost !== undefined) data.isLost = input.isLost
        if (input.position !== undefined) data.position = input.position
        const stage = await db.crmStage.update({ where: { id }, data })
        return stage satisfies CrmStage
      })
    },

    async deleteStage(id) {
      const count = await db.deal.count({ where: { stageId: id } })
      if (count > 0) {
        throw new BusinessFailure('conflict', 'На этапе есть сделки — сначала переместите их')
      }
      await guarded(async () => {
        await db.crmStage.delete({ where: { id } })
      })
    },

    async firstStageId() {
      const stage = await db.crmStage.findFirst({ orderBy: { position: 'asc' }, select: { id: true } })
      return stage?.id ?? null
    },

    // ------------------------------------------------------------- Доска доработок

    async listDevBoard() {
      const columns = await db.devColumn.findMany({
        orderBy: { position: 'asc' },
        include: { tasks: { orderBy: { position: 'asc' }, include: devTaskInclude } },
      })
      return columns.map((column) => ({
        id: column.id,
        title: column.title,
        position: column.position,
        tasks: column.tasks.map(toDevTaskDto),
      })) satisfies DevBoardResponse['columns']
    },

    async createDevTask(input, createdById, columnId) {
      return guarded(async () => {
        const last = await db.devTask.findFirst({
          where: { columnId },
          orderBy: { position: 'desc' },
          select: { position: true },
        })
        const row = await db.devTask.create({
          data: {
            title: input.title,
            description: input.description ?? null,
            type: input.type,
            priority: input.priority,
            dueDate: input.dueDate ? fromDateOnly(input.dueDate) : null,
            fixVersion: input.fixVersion ?? null,
            dealId: input.dealId ?? null,
            sprintId: input.sprintId ?? null,
            columnId,
            position: (last?.position ?? -1) + 1,
            createdById,
          },
          include: devTaskInclude,
        })
        return toDevTaskDto(row)
      })
    },

    async updateDevTask(id, input) {
      return guarded(async () => {
        const data: Record<string, unknown> = {}
        if ('title' in input) data.title = input.title
        if ('description' in input) data.description = input.description ?? null
        if ('type' in input) data.type = input.type
        if ('priority' in input) data.priority = input.priority
        if ('dueDate' in input) data.dueDate = input.dueDate ? fromDateOnly(input.dueDate) : null
        if ('fixVersion' in input) data.fixVersion = input.fixVersion ?? null
        if ('dealId' in input) data.dealId = input.dealId ?? null
        if ('sprintId' in input) data.sprintId = input.sprintId ?? null
        if ('columnId' in input && input.columnId !== undefined) data.columnId = input.columnId
        const row = await db.devTask.update({ where: { id }, data, include: devTaskInclude })
        return toDevTaskDto(row)
      })
    },

    async moveDevTask(id, columnId, position) {
      return db.$transaction(async (tx) => {
        const moving = await tx.devTask.findUnique({ where: { id } })
        if (moving === null) throw new BusinessFailure('not_found', 'Задача не найдена')
        const column = await tx.devColumn.findUnique({ where: { id: columnId } })
        if (column === null) throw new BusinessFailure('not_found', 'Колонка не найдена')
        const others = (
          await tx.devTask.findMany({
            where: { columnId },
            orderBy: { position: 'asc' },
          })
        ).filter((task) => task.id !== id)
        const clamped = Math.max(0, Math.min(position, others.length))
        const ordered = [
          ...others.slice(0, clamped),
          { ...moving, columnId },
          ...others.slice(clamped),
        ]
        for (let index = 0; index < ordered.length; index += 1) {
          await tx.devTask.update({
            where: { id: ordered[index].id },
            data: { position: index, columnId },
          })
        }
        const row = await tx.devTask.findUniqueOrThrow({ where: { id }, include: devTaskInclude })
        return toDevTaskDto(row)
      })
    },

    async deleteDevTask(id) {
      await guarded(async () => {
        await db.devTask.delete({ where: { id } })
      })
    },

    async listDevTaskComments(taskId) {
      const rows = await db.devTaskComment.findMany({
        where: { taskId },
        orderBy: { createdAt: 'asc' },
        include: commentAuthorInclude,
      })
      return rows.map(toDevTaskCommentDto)
    },

    async createDevTaskComment(taskId, authorId, body) {
      return guarded(async () => {
        const row = await db.devTaskComment.create({
          data: { taskId, authorId, body },
          include: commentAuthorInclude,
        })
        return toDevTaskCommentDto(row)
      })
    },

    async createDevColumn(input) {
      const last = await db.devColumn.findFirst({
        orderBy: { position: 'desc' },
        select: { position: true },
      })
      const column = await db.devColumn.create({
        data: { title: input.title, position: (last?.position ?? -1) + 1 },
      })
      return column satisfies DevColumn
    },

    async updateDevColumn(id, input) {
      return guarded(async () => {
        const data: Record<string, unknown> = {}
        if (input.title !== undefined) data.title = input.title
        if (input.position !== undefined) data.position = input.position
        const column = await db.devColumn.update({ where: { id }, data })
        return column satisfies DevColumn
      })
    },

    async deleteDevColumn(id) {
      const count = await db.devTask.count({ where: { columnId: id } })
      if (count > 0) {
        throw new BusinessFailure('conflict', 'В колонке есть задачи — сначала переместите их')
      }
      await guarded(async () => {
        await db.devColumn.delete({ where: { id } })
      })
    },

    async firstDevColumnId() {
      const column = await db.devColumn.findFirst({
        orderBy: { position: 'asc' },
        select: { id: true },
      })
      return column?.id ?? null
    },

    // ------------------------------------------------------------- Финансы

    async listTxns() {
      const rows = await db.txn.findMany({ orderBy: { occurredOn: 'asc' } })
      return rows.map(toTxnDto)
    },

    async createTxn(input, createdById) {
      return guarded(async () => {
        const row = await db.txn.create({
          data: {
            kind: input.kind,
            amount: input.amount,
            occurredOn: fromDateOnly(input.occurredOn),
            category: input.category,
            comment: input.comment ?? null,
            createdById,
          },
        })
        return toTxnDto(row)
      })
    },

    async updateTxn(id, input) {
      return guarded(async () => {
        const data: Record<string, unknown> = {}
        if ('kind' in input) data.kind = input.kind
        if ('amount' in input) data.amount = input.amount
        if ('occurredOn' in input && input.occurredOn !== undefined) {
          data.occurredOn = fromDateOnly(input.occurredOn)
        }
        if ('category' in input && input.category !== undefined) data.category = input.category
        if ('comment' in input) data.comment = input.comment ?? null
        const row = await db.txn.update({ where: { id }, data })
        return toTxnDto(row)
      })
    },

    async deleteTxn(id) {
      await guarded(async () => {
        await db.txn.delete({ where: { id } })
      })
    },

    async listRecurring() {
      const rows = await db.recurringItem.findMany({ orderBy: { category: 'asc' } })
      return rows.map(toRecurringDto)
    },

    async createRecurring(input, createdById) {
      return guarded(async () => {
        const row = await db.recurringItem.create({
          data: {
            kind: input.kind,
            amount: input.amount,
            category: input.category,
            comment: input.comment ?? null,
            dayOfMonth: input.dayOfMonth,
            activeFrom: fromDateOnly(input.activeFrom),
            activeUntil: input.activeUntil ? fromDateOnly(input.activeUntil) : null,
            createdById,
          },
        })
        return toRecurringDto(row)
      })
    },

    async updateRecurring(id, input) {
      return guarded(async () => {
        const data: Record<string, unknown> = {}
        if ('kind' in input) data.kind = input.kind
        if ('amount' in input) data.amount = input.amount
        if ('category' in input && input.category !== undefined) data.category = input.category
        if ('comment' in input) data.comment = input.comment ?? null
        if ('dayOfMonth' in input && input.dayOfMonth !== undefined) data.dayOfMonth = input.dayOfMonth
        if ('activeFrom' in input && input.activeFrom !== undefined) {
          data.activeFrom = fromDateOnly(input.activeFrom)
        }
        if ('activeUntil' in input) {
          data.activeUntil = input.activeUntil ? fromDateOnly(input.activeUntil) : null
        }
        const row = await db.recurringItem.update({ where: { id }, data })
        return toRecurringDto(row)
      })
    },

    async deleteRecurring(id) {
      await guarded(async () => {
        await db.recurringItem.delete({ where: { id } })
      })
    },

    async getSettings() {
      const row = await db.bizSettings.findUnique({ where: { id: 'singleton' } })
      if (row !== null) {
        return {
          openingBalanceDate: toDateOnly(row.openingBalanceDate) ?? '',
          openingBalance: row.openingBalance,
        } satisfies BizSettings
      }
      const today = new Date().toISOString().slice(0, 10)
      const created = await db.bizSettings.create({
        data: { id: 'singleton', openingBalanceDate: fromDateOnly(today), openingBalance: 0 },
      })
      return {
        openingBalanceDate: toDateOnly(created.openingBalanceDate) ?? '',
        openingBalance: created.openingBalance,
      } satisfies BizSettings
    },

    async listHistoryInRange(from, to) {
      const rows = await db.dealHistory.findMany({
        where: { movedAt: { gte: fromDateOnly(from), lt: fromDateOnly(to) } },
        include: { deal: { select: { monthlyAmount: true } } },
        orderBy: { movedAt: 'asc' },
      })
      return rows.map((row) => ({
        dealId: row.dealId,
        toStage: row.toStage,
        fromStage: row.fromStage,
        movedAt: row.movedAt.toISOString(),
        monthlyAmount: row.deal.monthlyAmount,
      }))
    },

    async listDealHistory(dealId) {
      const rows = await db.dealHistory.findMany({
        where: { dealId },
        orderBy: { movedAt: 'desc' },
      })
      return rows.map((row) => ({
        id: row.id,
        fromStage: row.fromStage,
        toStage: row.toStage,
        movedAt: row.movedAt.toISOString(),
      }))
    },

    async listExpectedPayments() {
      const rows = await db.expectedPayment.findMany({ orderBy: { dueDate: 'asc' } })
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        amount: row.amount,
        dueDate: toDateOnly(row.dueDate) ?? '',
        probability: row.probability,
        dealId: row.dealId,
        invoiceNumber: row.invoiceNumber,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }))
    },

    async createExpectedPayment(input) {
      return guarded(async () => {
        const row = await db.expectedPayment.create({
          data: {
            title: input.title,
            invoiceNumber: input.invoiceNumber ?? null,
            amount: input.amount,
            dueDate: fromDateOnly(input.dueDate),
            probability: input.probability,
            dealId: input.dealId ?? null,
          },
        })
        return mapExpected(row)
      })
    },

    async updateExpectedPayment(id, input) {
      return guarded(async () => {
        const data: Record<string, unknown> = {}
        if ('title' in input) data.title = input.title
        if ('invoiceNumber' in input) data.invoiceNumber = input.invoiceNumber ?? null
        if ('amount' in input) data.amount = input.amount
        if ('dueDate' in input && input.dueDate !== undefined) data.dueDate = fromDateOnly(input.dueDate)
        if ('probability' in input && input.probability !== undefined) data.probability = input.probability
        if ('dealId' in input) data.dealId = input.dealId ?? null
        const row = await db.expectedPayment.update({ where: { id }, data })
        return mapExpected(row)
      })
    },

    async deleteExpectedPayment(id) {
      await guarded(async () => {
        await db.expectedPayment.delete({ where: { id } })
      })
    },

    async listSprints() {
      const rows = await db.sprint.findMany({ orderBy: { startsOn: 'desc' } })
      return rows.map(mapSprint)
    },

    async createSprint(input) {
      const row = await db.sprint.create({
        data: {
          name: input.name,
          startsOn: fromDateOnly(input.startsOn),
          endsOn: fromDateOnly(input.endsOn),
        },
      })
      return mapSprint(row)
    },

    async finishSprint(id) {
      await guarded(async () => {
        await db.sprint.update({ where: { id }, data: { isActive: false } })
      })
    },

    async listCompanies() {
      const rows = await db.company.findMany({ orderBy: { name: 'asc' } })
      const stages = await db.crmStage.findMany({
        include: { deals: { select: { companyId: true, monthlyAmount: true } } },
      })
      const wonStageIds = new Set(stages.filter((stage) => stage.isWon).map((stage) => stage.id))
      return rows.map((row) => {
        let dealsCount = 0
        let activeMrr = 0
        for (const stage of stages) {
          for (const deal of stage.deals) {
            if (deal.companyId !== row.id) continue
            dealsCount += 1
            if (wonStageIds.has(stage.id)) activeMrr += deal.monthlyAmount
          }
        }
        return { id: row.id, name: row.name, note: row.note, dealsCount, activeMrr }
      })
    },

    async createCompany(input) {
      const existing = await db.company.findUnique({ where: { name: input.name } })
      if (existing) {
        throw new BusinessFailure('conflict', 'Контрагент с таким названием уже есть')
      }
      const row = await db.company.create({
        data: { name: input.name, note: input.note ?? null },
      })
      return { id: row.id, name: row.name, note: row.note, dealsCount: 0, activeMrr: 0 }
    },

    async countTxns() {
      return db.txn.count()
    },

    async listRecentComments(since, limit) {
      const rows = await db.dealComment.findMany({
        where: { createdAt: { gt: since } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          deal: { select: { id: true, title: true } },
          author: { select: { displayName: true } },
        },
      })
      return rows.map((row) => ({
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        dealId: row.deal.id,
        dealTitle: row.deal.title,
        authorName: row.author.displayName,
      }))
    },

    async markNotificationsSeen(userId, at) {
      await db.user.update({ where: { id: userId }, data: { lastSeenNotificationsAt: at } })
    },

    async getUserLastSeen(userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { lastSeenNotificationsAt: true },
      })
      return user?.lastSeenNotificationsAt ?? null
    },

    async getGoal(month) {
      const row = await db.monthGoal.findUnique({ where: { month } })
      return row ?? { month, mrrGoal: 0, incomeGoal: 0 }
    },

    async saveGoal(goal) {
      const row = await db.monthGoal.upsert({
        where: { month: goal.month },
        update: { mrrGoal: goal.mrrGoal, incomeGoal: goal.incomeGoal },
        create: goal,
      })
      return row
    },

    async saveSettings(settings) {
      const row = await db.bizSettings.upsert({
        where: { id: 'singleton' },
        update: {
          openingBalanceDate: fromDateOnly(settings.openingBalanceDate),
          openingBalance: settings.openingBalance,
        },
        create: {
          id: 'singleton',
          openingBalanceDate: fromDateOnly(settings.openingBalanceDate),
          openingBalance: settings.openingBalance,
        },
      })
      return {
        openingBalanceDate: toDateOnly(row.openingBalanceDate) ?? '',
        openingBalance: row.openingBalance,
      } satisfies BizSettings
    },
  }
}

function mapExpected(row: Awaited<ReturnType<DbClient['expectedPayment']['findUniqueOrThrow']>>): ExpectedPayment {
  return {
    id: row.id,
    title: row.title,
    invoiceNumber: row.invoiceNumber,
    amount: row.amount,
    dueDate: toDateOnly(row.dueDate) ?? '',
    probability: row.probability,
    dealId: row.dealId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function mapSprint(row: Awaited<ReturnType<DbClient['sprint']['findUniqueOrThrow']>>): Sprint {
  return {
    id: row.id,
    name: row.name,
    startsOn: toDateOnly(row.startsOn) ?? '',
    endsOn: toDateOnly(row.endsOn) ?? '',
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
