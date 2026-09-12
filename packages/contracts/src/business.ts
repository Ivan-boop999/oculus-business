import { z } from 'zod'

// =============================================================================
// ОБЩИЕ
// =============================================================================

/// Дата-без-времени в формате YYYY-MM-DD (день платежа, дедлайн, следующее действие).
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

export const idParamSchema = z.object({ id: z.string().uuid() }).strict()

const nullableTrimmed = (max: number) =>
  z.union([z.string().trim().min(1).max(max), z.null()])

const optionalTrimmed = (max: number) => z.string().trim().min(1).max(max).optional()

// =============================================================================
// CRM — канбан сделок
// =============================================================================

export const crmStageSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(80),
    position: z.number().int(),
    isWon: z.boolean(),
    isLost: z.boolean(),
  })
  .strict()

export const dealSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    contactName: z.string().nullable(),
    contactPhone: z.string().nullable(),
    contactTelegram: z.string().nullable(),
    source: z.string().nullable(),
    oneTimeAmount: z.number().int(),
    monthlyAmount: z.number().int(),
    stageId: z.string().uuid(),
    position: z.number().int(),
    note: z.string().nullable(),
    nextActionAt: dateOnlySchema.nullable(),
    nextAction: z.string().nullable(),
    lostReason: z.string().nullable(),
    lastStageChangeAt: z.string().datetime().nullable(),
    createdById: z.string().uuid(),
    createdByName: z.string().nullable(),
    commentsCount: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const dealCommentSchema = z
  .object({
    id: z.string().uuid(),
    dealId: z.string().uuid(),
    authorId: z.string().uuid(),
    authorName: z.string().nullable(),
    body: z.string(),
    createdAt: z.string().datetime(),
  })
  .strict()

export const crmBoardResponseSchema = z
  .object({
    stages: z.array(crmStageSchema.extend({ deals: z.array(dealSchema) })),
  })
  .strict()

export const createDealRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    contactName: nullableTrimmed(120).optional(),
    contactPhone: nullableTrimmed(60).optional(),
    contactTelegram: nullableTrimmed(120).optional(),
    source: nullableTrimmed(60).optional(),
    oneTimeAmount: z.number().int().min(0).max(1_000_000_000).default(0),
    monthlyAmount: z.number().int().min(0).max(1_000_000_000).default(0),
    note: nullableTrimmed(4000).optional(),
    nextActionAt: dateOnlySchema.nullable().optional(),
    nextAction: nullableTrimmed(400).optional(),
    lostReason: nullableTrimmed(400).optional(),
    stageId: z.string().uuid().optional(),
  })
  .strict()

export const updateDealRequestSchema = createDealRequestSchema.partial().strict()

export const moveDealRequestSchema = z
  .object({
    stageId: z.string().uuid(),
    position: z.number().int().min(0),
  })
  .strict()

export const dealResponseSchema = z.object({ deal: dealSchema }).strict()
export const dealCommentsResponseSchema = z
  .object({ comments: z.array(dealCommentSchema) })
  .strict()
export const createDealCommentRequestSchema = z
  .object({ body: z.string().trim().min(1).max(4000) })
  .strict()

export const createCrmStageRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    isWon: z.boolean().default(false),
    isLost: z.boolean().default(false),
  })
  .strict()

export const updateCrmStageRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    isWon: z.boolean().optional(),
    isLost: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
  })
  .strict()

export const crmStageResponseSchema = z.object({ stage: crmStageSchema }).strict()

// =============================================================================
// Доска доработок и багов
// =============================================================================

export const devTaskTypeSchema = z.enum(['bug', 'feature', 'idea'])
export const devTaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])

export const devColumnSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(80),
    position: z.number().int(),
  })
  .strict()

export const devTaskSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string().nullable(),
    type: devTaskTypeSchema,
    priority: devTaskPrioritySchema,
    columnId: z.string().uuid(),
    position: z.number().int(),
    dueDate: dateOnlySchema.nullable(),
    commentsCount: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const devTaskCommentSchema = z
  .object({
    id: z.string().uuid(),
    taskId: z.string().uuid(),
    authorId: z.string().uuid(),
    authorName: z.string().nullable(),
    body: z.string(),
    createdAt: z.string().datetime(),
  })
  .strict()

export const devBoardResponseSchema = z
  .object({
    columns: z.array(devColumnSchema.extend({ tasks: z.array(devTaskSchema) })),
  })
  .strict()

export const createDevTaskRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: nullableTrimmed(8000).optional(),
    type: devTaskTypeSchema.default('feature'),
    priority: devTaskPrioritySchema.default('medium'),
    dueDate: dateOnlySchema.nullable().optional(),
    columnId: z.string().uuid().optional(),
  })
  .strict()

export const updateDevTaskRequestSchema = createDevTaskRequestSchema.partial().strict()

export const moveDevTaskRequestSchema = z
  .object({
    columnId: z.string().uuid(),
    position: z.number().int().min(0),
  })
  .strict()

export const devTaskResponseSchema = z.object({ task: devTaskSchema }).strict()
export const devTaskCommentsResponseSchema = z
  .object({ comments: z.array(devTaskCommentSchema) })
  .strict()
export const createDevTaskCommentRequestSchema = z
  .object({ body: z.string().trim().min(1).max(4000) })
  .strict()

export const createDevColumnRequestSchema = z
  .object({ title: z.string().trim().min(1).max(80) })
  .strict()

export const updateDevColumnRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    position: z.number().int().min(0).optional(),
  })
  .strict()

export const devColumnResponseSchema = z.object({ column: devColumnSchema }).strict()

// =============================================================================
// Финансы
// =============================================================================

export const txnKindSchema = z.enum(['income', 'expense'])

export const txnSchema = z
  .object({
    id: z.string().uuid(),
    kind: txnKindSchema,
    amount: z.number().int(),
    occurredOn: dateOnlySchema,
    category: z.string(),
    comment: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const recurringItemSchema = z
  .object({
    id: z.string().uuid(),
    kind: txnKindSchema,
    amount: z.number().int(),
    category: z.string(),
    comment: z.string().nullable(),
    dayOfMonth: z.number().int().min(1).max(31),
    activeFrom: dateOnlySchema,
    activeUntil: dateOnlySchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const createTxnRequestSchema = z
  .object({
    kind: txnKindSchema,
    amount: z.number().int().min(1).max(1_000_000_000),
    occurredOn: dateOnlySchema,
    category: z.string().trim().min(1).max(80),
    comment: optionalTrimmed(400),
  })
  .strict()

export const updateTxnRequestSchema = createTxnRequestSchema.partial().strict()

export const createRecurringItemRequestSchema = z
  .object({
    kind: txnKindSchema,
    amount: z.number().int().min(1).max(1_000_000_000),
    category: z.string().trim().min(1).max(80),
    comment: optionalTrimmed(400),
    dayOfMonth: z.number().int().min(1).max(31).default(1),
    activeFrom: dateOnlySchema,
    activeUntil: dateOnlySchema.nullable().optional(),
  })
  .strict()

export const updateRecurringItemRequestSchema =
  createRecurringItemRequestSchema.partial().strict()

export const txnResponseSchema = z.object({ txn: txnSchema }).strict()
export const recurringItemResponseSchema = z
  .object({ item: recurringItemSchema })
  .strict()
export const recurringItemsResponseSchema = z
  .object({ items: z.array(recurringItemSchema) })
  .strict()

export const txnsQuerySchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  })
  .strict()

export const txnsResponseSchema = z
  .object({
    items: z.array(txnSchema),
    recurring: z.array(recurringItemSchema),
    months: z.array(z.string().regex(/^\d{4}-\d{2}$/)),
  })
  .strict()

export const bizSettingsSchema = z
  .object({
    openingBalanceDate: dateOnlySchema,
    openingBalance: z.number().int(),
  })
  .strict()

export const monthGoalSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    mrrGoal: z.number().int().min(0).max(1_000_000_000),
    incomeGoal: z.number().int().min(0).max(1_000_000_000),
  })
  .strict()

export const saveMonthGoalRequestSchema = monthGoalSchema

export const monthGoalResponseSchema = z.object({ goal: monthGoalSchema }).strict()

export const updateBizSettingsRequestSchema = bizSettingsSchema.strict()

export const bizSettingsResponseSchema = z.object({ settings: bizSettingsSchema }).strict()

export const categoryTotalSchema = z
  .object({
    category: z.string(),
    amount: z.number().int(),
  })
  .strict()

export const financeSummaryResponseSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    income: z.number().int(),
    expense: z.number().int(),
    net: z.number().int(),
    incomeByCategory: z.array(categoryTotalSchema),
    expenseByCategory: z.array(categoryTotalSchema),
    mrr: z.number().int(),
    pipelineMonthly: z.number().int(),
    pipelineOneTime: z.number().int(),
    activeRecurringIncome: z.number().int(),
    activeRecurringExpense: z.number().int(),
    balance: z.number().int(),
  })
  .strict()

export const forecastMonthSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    recurringIncome: z.number().int(),
    mrrIncome: z.number().int(),
    oneTimeIncome: z.number().int(),
    recurringExpense: z.number().int(),
    oneTimeExpense: z.number().int(),
    plannedIncome: z.number().int(),
    plannedExpense: z.number().int(),
    net: z.number().int(),
    closingBalance: z.number().int(),
  })
  .strict()

export const forecastResponseSchema = z
  .object({
    balance: z.number().int(),
    mrr: z.number().int(),
    avgNetBurn3m: z.number().int().nullable(),
    /// null — чистый поток неотрицательный, runway не ограничен.
    runwayMonths: z.number().nullable(),
    /// positive | comfortable | stable | watchful | defensive | critical
    mode: z.enum(['positive', 'comfortable', 'stable', 'watchful', 'defensive', 'critical']),
    months: z.array(forecastMonthSchema),
  })
  .strict()

export const forecastQuerySchema = z
  .object({
    months: z.coerce.number().int().min(1).max(12).default(6),
  })
  .strict()

// =============================================================================
// Дашборд
// =============================================================================

export const nextActionSchema = z
  .object({
    dealId: z.string().uuid(),
    dealTitle: z.string(),
    stageTitle: z.string(),
    nextAction: z.string().nullable(),
    nextActionAt: dateOnlySchema.nullable(),
    overdue: z.boolean(),
  })
  .strict()

export const dashboardResponseSchema = z
  .object({
    crm: z.object({
      activeDeals: z.number().int(),
      wonDeals: z.number().int(),
      mrr: z.number().int(),
      pipelineMonthly: z.number().int(),
      pipelineOneTime: z.number().int(),
    }),
    finance: z.object({
      balance: z.number().int(),
      monthIncome: z.number().int(),
      monthExpense: z.number().int(),
      monthNet: z.number().int(),
      runwayMonths: z.number().int().nullable(),
      mode: z.enum([
        'positive',
        'comfortable',
        'stable',
        'watchful',
        'defensive',
        'critical',
      ]),
    }),
    nextActions: z.array(nextActionSchema),
    dev: z.object({
      openTasks: z.number().int(),
      inProgressTasks: z.number().int(),
      urgentBugs: z.number().int(),
    }),
  })
  .strict()

// =============================================================================
// Типы
// =============================================================================

export type CrmStage = z.infer<typeof crmStageSchema>
export type Deal = z.infer<typeof dealSchema>
export type DealComment = z.infer<typeof dealCommentSchema>
export type CrmBoardResponse = z.infer<typeof crmBoardResponseSchema>
export type CreateDealRequest = z.infer<typeof createDealRequestSchema>
export type UpdateDealRequest = z.infer<typeof updateDealRequestSchema>
export type MoveDealRequest = z.infer<typeof moveDealRequestSchema>
export type CreateCrmStageRequest = z.infer<typeof createCrmStageRequestSchema>
export type UpdateCrmStageRequest = z.infer<typeof updateCrmStageRequestSchema>
export type DevColumn = z.infer<typeof devColumnSchema>
export type DevTask = z.infer<typeof devTaskSchema>
export type DevTaskType = z.infer<typeof devTaskTypeSchema>
export type DevTaskPriority = z.infer<typeof devTaskPrioritySchema>
export type DevTaskComment = z.infer<typeof devTaskCommentSchema>
export type DevBoardResponse = z.infer<typeof devBoardResponseSchema>
export type CreateDevTaskRequest = z.infer<typeof createDevTaskRequestSchema>
export type UpdateDevTaskRequest = z.infer<typeof updateDevTaskRequestSchema>
export type MoveDevTaskRequest = z.infer<typeof moveDevTaskRequestSchema>
export type CreateDevColumnRequest = z.infer<typeof createDevColumnRequestSchema>
export type UpdateDevColumnRequest = z.infer<typeof updateDevColumnRequestSchema>
export type Txn = z.infer<typeof txnSchema>
export type RecurringItem = z.infer<typeof recurringItemSchema>
export type CreateTxnRequest = z.infer<typeof createTxnRequestSchema>
export type UpdateTxnRequest = z.infer<typeof updateTxnRequestSchema>
export type CreateRecurringItemRequest = z.infer<typeof createRecurringItemRequestSchema>
export type UpdateRecurringItemRequest = z.infer<typeof updateRecurringItemRequestSchema>
export type BizSettings = z.infer<typeof bizSettingsSchema>
export type MonthGoal = z.infer<typeof monthGoalSchema>
export type FinanceSummary = z.infer<typeof financeSummaryResponseSchema>
export type ForecastMonth = z.infer<typeof forecastMonthSchema>
export type ForecastResponse = z.infer<typeof forecastResponseSchema>
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>
