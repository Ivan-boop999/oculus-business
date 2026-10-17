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
    code: z.string(),
    semanticType: z.string(),
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
    companyId: z.string().uuid().nullable(),
    companyName: z.string().nullable(),
    lastStageChangeAt: z.string().datetime().nullable(),
    createdById: z.string().uuid(),
    createdByName: z.string().nullable(),
    ownerId: z.string().uuid().nullable(),
    ownerName: z.string().nullable(),
    subStatus: z.string(),
    version: z.number().int(),
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
    // Без .default(0): в Zod 4 default переживает .partial() и PATCH вернул бы
    // отсутствующим полям нули (затирание сумм). Отсутствие = «не менять».
    oneTimeAmount: z.number().int().min(0).max(1_000_000_000).optional(),
    monthlyAmount: z.number().int().min(0).max(1_000_000_000).optional(),
    note: nullableTrimmed(4000).optional(),
    nextActionAt: dateOnlySchema.nullable().optional(),
    nextAction: nullableTrimmed(400).optional(),
    lostReason: nullableTrimmed(400).optional(),
    companyId: z.string().uuid().nullable().optional(),
    stageId: z.string().uuid().optional(),
    ownerId: z.string().uuid().nullable().optional(),
    /// Основание обхода обязательных условий при создании на позднем этапе (FIX-02-AC01);
    /// действует только для человека, фиксируется в истории.
    overrideReason: nullableTrimmed(400).optional(),
    // Квалификация (CRM-05) — все поля необязательные: заполнение по этапам (§4.7).
    direction: nullableTrimmed(300).optional(),
    scenario: nullableTrimmed(2000).optional(),
    currentProcess: nullableTrimmed(2000).optional(),
    problemStatement: nullableTrimmed(4000).optional(),
    consequences: nullableTrimmed(4000).optional(),
    baseline: nullableTrimmed(2000).optional(),
    measurementMethod: nullableTrimmed(2000).optional(),
    assumptions: nullableTrimmed(2000).optional(),
    desiredOutcome: nullableTrimmed(2000).optional(),
    priority: nullableTrimmed(60).optional(),
    priorityEvent: nullableTrimmed(300).optional(),
    economicBuyerStatus: nullableTrimmed(60).optional(),
    selectionCriteria: nullableTrimmed(2000).optional(),
    decisionProcess: nullableTrimmed(2000).optional(),
    techConstraints: nullableTrimmed(2000).optional(),
    priceAnchor: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    priceReaction: nullableTrimmed(1000).optional(),
    nextAgreedStep: nullableTrimmed(500).optional(),
    pausedReason: nullableTrimmed(500).optional(),
    resumeCondition: nullableTrimmed(500).optional(),
    resumeOn: dateOnlySchema.nullable().optional(),
    wonBasis: nullableTrimmed(1000).optional(),
    signedAt: dateOnlySchema.nullable().optional(),
    implementationStartPlan: dateOnlySchema.nullable().optional(),
    implementationStartFact: dateOnlySchema.nullable().optional(),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict()

export const updateDealRequestSchema = createDealRequestSchema.partial().strict()

export const moveDealRequestSchema = z
  .object({
    stageId: z.string().uuid(),
    position: z.number().int().min(0),
    reason: nullableTrimmed(400).optional(),
    /// Override обязательного условия перехода — только с причиной, попадает в аудит.
    overrideReason: nullableTrimmed(400).optional(),
    /// Контроль конкуренции: версия записи, которую клиент видел.
    expectedVersion: z.number().int().min(1).optional(),
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
    semanticType: z.string().trim().min(1).max(40).optional(),
  })
  .strict()

export const updateCrmStageRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    isWon: z.boolean().optional(),
    isLost: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
    semanticType: z.string().trim().min(1).max(40).optional(),
  })
  .strict()

export const crmStageResponseSchema = z.object({ stage: crmStageSchema }).strict()

// =============================================================================
// Доска доработок и багов
// =============================================================================

export const devTaskTypeSchema = z.enum(['bug', 'feature', 'idea'])
export const devTaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])

export const sprintSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    startsOn: dateOnlySchema,
    endsOn: dateOnlySchema,
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const createSprintRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    startsOn: dateOnlySchema,
    endsOn: dateOnlySchema,
  })
  .strict()

export const sprintResponseSchema = z.object({ sprint: sprintSchema }).strict()
export const sprintsResponseSchema = z.object({ items: z.array(sprintSchema) }).strict()

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
    fixVersion: z.string().nullable(),
    dealId: z.string().uuid().nullable(),
    dealTitle: z.string().nullable(),
    sprintId: z.string().uuid().nullable(),
    sprintName: z.string().nullable(),
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
    // Без default: partial() в Zod 4 сохраняет default и PATCH сбрасывал бы тип/приоритет.
    type: devTaskTypeSchema.optional(),
    priority: devTaskPrioritySchema.optional(),
    dueDate: dateOnlySchema.nullable().optional(),
    fixVersion: nullableTrimmed(60).optional(),
    dealId: z.string().uuid().nullable().optional(),
    sprintId: z.string().uuid().nullable().optional(),
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
    /// Связь поступления со сделкой (CRM-11-AC03): null для нераспределённых операций.
    dealId: z.string().uuid().nullable(),
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
    /// Стоимость часа работы для расчёта вклада запуска после расходов (CRM-12).
    laborHourRate: z.number().int().min(0).max(1_000_000).default(0),
    /// Рабочий часовой пояс «Сегодня» (OWNER-02-AC02), по умолчанию Europe/Moscow.
    timezone: z.string().trim().min(1).max(60).default('Europe/Moscow'),
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
    prevMonthIncome: z.number().int(),
    prevMonthExpense: z.number().int(),
    incomeByCategory: z.array(categoryTotalSchema),
    expenseByCategory: z.array(categoryTotalSchema),
    mrr: z.number().int(),
    /// Прирост MRR за месяц: сделки, вошедшие в этап-победитель в этом месяце.
    mrrDelta: z.number().int(),
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
    expectedIncome: z.number().int(),
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
      totalDeals: z.number().int(),
      totalTxns: z.number().int(),
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
// Стадия 2: аналитика — история сделки, отчёт воронки, движение MRR, поток, дебиторка
// =============================================================================

export const dealHistoryEntrySchema = z
  .object({
    id: z.string().uuid(),
    fromStage: z.string().nullable(),
    toStage: z.string(),
    fromStageId: z.string().uuid().nullable(),
    toStageId: z.string().uuid().nullable(),
    /// initial_entry | moved
    event: z.string(),
    /// human | agent
    actorKind: z.string(),
    actorId: z.string().uuid().nullable(),
    reason: z.string().nullable(),
    overrideReason: z.string().nullable(),
    monthlyAmountSnapshot: z.number().int().nullable(),
    /// true — строка до доработки: без stageId и initial-entry, пробел помечен.
    legacy: z.boolean(),
    movedAt: z.string().datetime(),
  })
  .strict()

export const dealHistoryResponseSchema = z
  .object({ entries: z.array(dealHistoryEntrySchema) })
  .strict()

export const crmStageReportSchema = z
  .object({
    title: z.string(),
    dealsNow: z.number().int(),
    entered: z.number().int(),
    conversionPct: z.number().nullable(),
    avgDaysInStage: z.number().nullable(),
  })
  .strict()

export const crmReportResponseSchema = z
  .object({
    stages: z.array(crmStageReportSchema),
    avgCycleDays: z.number().nullable(),
    avgOneTimeAmount: z.number().int(),
    avgMonthlyAmount: z.number().int(),
    lostReasons: z.array(z.object({ reason: z.string(), count: z.number().int() }).strict()),
  })
  .strict()

export const mrrMovementMonthSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    newMrr: z.number().int(),
    churnedMrr: z.number().int(),
    totalMrr: z.number().int(),
  })
  .strict()

export const mrrMovementResponseSchema = z
  .object({ months: z.array(mrrMovementMonthSchema) })
  .strict()

export const cashflowMonthSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    income: z.number().int(),
    expense: z.number().int(),
    net: z.number().int(),
  })
  .strict()

export const cashflowHistoryResponseSchema = z
  .object({ months: z.array(cashflowMonthSchema) })
  .strict()

export const expectedPaymentSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    invoiceNumber: z.string().nullable(),
    amount: z.number().int(),
    dueDate: dateOnlySchema,
    probability: z.number().int().min(0).max(100),
    dealId: z.string().uuid().nullable(),
    status: z.string(),
    receivedAmount: z.number().int(),
    remainingAmount: z.number().int(),
    /// Контроль конкуренции (FIX-05).
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const createExpectedPaymentRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    invoiceNumber: nullableTrimmed(60).optional(),
    amount: z.number().int().min(1).max(1_000_000_000),
    dueDate: dateOnlySchema,
    probability: z.number().int().min(0).max(100).default(80),
    dealId: z.string().uuid().nullable().optional(),
  })
  .strict()

export const updateExpectedPaymentRequestSchema =
  createExpectedPaymentRequestSchema.partial().strict()

export const expectedPaymentResponseSchema = z.object({ payment: expectedPaymentSchema }).strict()
export const expectedPaymentsResponseSchema = z
  .object({ items: z.array(expectedPaymentSchema) })
  .strict()

// =============================================================================
// Цикл 2: контрагенты, уведомления
// =============================================================================

export const companyResearchStatusSchema = z.enum([
  'selected',
  'reaching',
  'dialogue',
  'nurture',
  'disqualified',
])
export const companyRelationStatusSchema = z.enum(['prospect', 'customer', 'partner', 'excluded'])

export const companySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    note: z.string().nullable(),
    website: z.string().nullable(),
    domain: z.string().nullable(),
    inn: z.string().nullable(),
    region: z.string().nullable(),
    segment: z.string().nullable(),
    processDescription: z.string().nullable(),
    researchSource: z.string().nullable(),
    researchedAt: z.string().datetime().nullable(),
    researchStatus: z.string(),
    relationStatus: z.string(),
    selectionReason: z.string().nullable(),
    exclusionReason: z.string().nullable(),
    ownerId: z.string().uuid().nullable(),
    ownerName: z.string().nullable(),
    cohortVersion: z.string().nullable(),
    contactSource: z.string().nullable(),
    externalId: z.string().nullable(),
    doNotContact: z.boolean(),
    dncReason: z.string().nullable(),
    dncAt: z.string().datetime().nullable(),
    dncScope: z.string(),
    dealsCount: z.number().int(),
    activeMrr: z.number().int(),
    contactsCount: z.number().int(),
    openTasksCount: z.number().int(),
    /// Контроль конкуренции (FIX-05-AC01): отдаётся и проверяется на сервере атомарно.
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const companiesResponseSchema = z
  .object({ items: z.array(companySchema), total: z.number().int() })
  .strict()

export const createCompanyRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    /// Явное подтверждение «домен совпадает, но это другое юрлицо группы» (CRM-01).
    allowDomainDuplicate: z.boolean().optional(),
    note: nullableTrimmed(1000).optional(),
    website: nullableTrimmed(300).optional(),
    inn: nullableTrimmed(20).optional(),
    region: nullableTrimmed(120).optional(),
    segment: nullableTrimmed(120).optional(),
    processDescription: nullableTrimmed(2000).optional(),
    researchSource: nullableTrimmed(200).optional(),
    researchedAt: z.string().datetime({ offset: true }).nullable().optional(),
    researchStatus: companyResearchStatusSchema.optional(),
    relationStatus: companyRelationStatusSchema.optional(),
    selectionReason: nullableTrimmed(1000).optional(),
    ownerId: z.string().uuid().nullable().optional(),
    cohortVersion: nullableTrimmed(60).optional(),
    contactSource: nullableTrimmed(200).optional(),
    externalId: nullableTrimmed(120).optional(),
  })
  .strict()

export const updateCompanyRequestSchema = createCompanyRequestSchema.partial().extend({
  exclusionReason: nullableTrimmed(1000).optional(),
  expectedVersion: z.number().int().min(1).optional(),
}).strict()

export const companyResponseSchema = z.object({ company: companySchema }).strict()

export const companiesQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(120).optional(),
    researchStatus: companyResearchStatusSchema.optional(),
    relationStatus: companyRelationStatusSchema.optional(),
    segment: z.string().trim().min(1).max(120).optional(),
    ownerId: z.string().uuid().optional(),
    dnc: z.enum(['any', 'active', 'none']).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict()

export const companyDncRequestSchema = z
  .object({
    reason: z.string().trim().min(3).max(1000),
    scope: z.enum(['all', 'commercial']).default('all'),
    source: nullableTrimmed(200).optional(),
  })
  .strict()

export const companyDncLiftRequestSchema = z
  .object({ reason: z.string().trim().min(3).max(1000) })
  .strict()

export const companyEventSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    kind: z.string(),
    reason: z.string().nullable(),
    authorId: z.string().uuid(),
    authorName: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict()

export const notificationItemSchema = z
  .object({
    kind: z.enum(['overdue', 'comment']),
    title: z.string(),
    subtitle: z.string(),
    at: z.string().datetime(),
  })
  .strict()

export const notificationsResponseSchema = z
  .object({
    overdueCount: z.number().int(),
    newCommentsCount: z.number().int(),
    items: z.array(notificationItemSchema),
  })
  .strict()

// =============================================================================
// B2B-продажи: контакты, взаимодействия, задачи, квалификация, черновики,
// пилоты, запуск, деньги, отчёты, импорт, «Сегодня» (ТЗ от 17.10.2026)
// =============================================================================

export const contactStatusSchema = z.enum(['published', 'confirmed', 'guess', 'invalid'])
export const channelKindSchema = z.enum(['email', 'phone', 'telegram', 'other'])
export const dealContactRoleKindSchema = z.enum([
  'economic_buyer',
  'process_owner',
  'technical',
  'procurement',
  'champion',
  'other',
])
export const claimStatusSchema = z.enum(['hypothesis', 'customer_confirmed', 'tested', 'unknown'])
export const dealClaimFieldKeySchema = z.enum([
  'problem',
  'consequences',
  'baseline',
  'economic_buyer',
  'process_owner',
  'budget',
  'solution',
])
export const activityChannelSchema = z.enum(['call', 'email', 'telegram', 'meeting', 'other'])
export const activityActionTypeSchema = z.enum([
  'call_attempt',
  'conversation',
  'meeting_scheduled',
  'meeting_held',
  'message_sent',
  'message_received',
  'other',
])
export const activityDirectionSchema = z.enum(['outbound', 'inbound'])
export const salesTaskStatusSchema = z.enum(['open', 'done', 'cancelled'])
export const salesTaskCommitmentSchema = z.enum(['client_commitment', 'internal_plan'])
/// Назначение задачи определяет область DNC (FIX-06-AC02).
export const salesTaskKindSchema = z.enum(['commercial', 'service', 'internal'])
export const draftStatusSchema = z.enum([
  'draft',
  'reviewed',
  'approved',
  'sent',
  'delivered',
  'on_hold',
  'superseded',
  'failed',
  'cancelled',
])
export const draftChannelSchema = z.enum(['email', 'telegram', 'phone', 'other'])
export const pilotStatusSchema = z.enum(['draft', 'running'])
export const pilotOutcomeSchema = z.enum(['accepted', 'revise', 'stop'])
export const dealSubStatusSchema = z.enum(['none', 'unconfirmed', 'active', 'paused', 'ended'])
export const expectedPaymentStatusKindSchema = z.enum([
  'expected',
  'partially_received',
  'received',
  'cancelled',
])
export const riskLevelSchema = z.enum(['none', 'low', 'medium', 'high'])

const datetimeWithOffset = z.string().datetime({ offset: true })

export const contactChannelSchema = z
  .object({
    id: z.string().uuid(),
    contactId: z.string().uuid(),
    kind: channelKindSchema,
    value: z.string(),
    status: contactStatusSchema,
    isDirect: z.boolean(),
    source: z.string().nullable(),
    verifiedAt: datetimeWithOffset.nullable(),
    note: z.string().nullable(),
    /// Контроль конкуренции (FIX-05).
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const contactSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    name: z.string().nullable(),
    position: z.string().nullable(),
    status: contactStatusSchema,
    source: z.string().nullable(),
    discoveredAt: datetimeWithOffset.nullable(),
    directRoleConfirmed: z.boolean(),
    isLegacy: z.boolean(),
    legacyDealId: z.string().uuid().nullable(),
    note: z.string().nullable(),
    doNotContact: z.boolean(),
    dncReason: z.string().nullable(),
    dncAt: datetimeWithOffset.nullable(),
    dncScope: z.string(),
    channels: z.array(contactChannelSchema),
    /// Контроль конкуренции (FIX-05).
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const createContactRequestSchema = z
  .object({
    companyId: z.string().uuid(),
    name: nullableTrimmed(160).optional(),
    position: nullableTrimmed(160).optional(),
    status: contactStatusSchema.optional(),
    source: nullableTrimmed(200).optional(),
    discoveredAt: datetimeWithOffset.nullable().optional(),
    directRoleConfirmed: z.boolean().optional(),
    note: nullableTrimmed(2000).optional(),
    externalId: nullableTrimmed(120).optional(),
    channels: z
      .array(
        z
          .object({
            kind: channelKindSchema,
            value: z.string().trim().min(3).max(300),
            status: contactStatusSchema.optional(),
            isDirect: z.boolean().optional(),
            source: nullableTrimmed(200).optional(),
            note: nullableTrimmed(500).optional(),
          })
          .strict(),
      )
      .max(10)
      .optional(),
  })
  .strict()

export const updateContactRequestSchema = createContactRequestSchema
  .omit({ companyId: true, channels: true })
  .partial()
  .extend({ expectedVersion: z.number().int().min(1).optional() })
  .strict()

export const createContactChannelRequestSchema = z
  .object({
    kind: channelKindSchema,
    value: z.string().trim().min(3).max(300),
    status: contactStatusSchema.optional(),
    isDirect: z.boolean().optional(),
    source: nullableTrimmed(200).optional(),
    note: nullableTrimmed(500).optional(),
  })
  .strict()

export const updateContactChannelRequestSchema = createContactChannelRequestSchema
  .partial()
  .extend({ expectedVersion: z.number().int().min(1).optional() })
  .strict()

export const contactResponseSchema = z.object({ contact: contactSchema }).strict()
export const contactsResponseSchema = z.object({ items: z.array(contactSchema) }).strict()
export const contactChannelResponseSchema = z
  .object({ channel: contactChannelSchema })
  .strict()

export const dealContactRoleSchema = z
  .object({
    id: z.string().uuid(),
    dealId: z.string().uuid(),
    contactId: z.string().uuid(),
    contactName: z.string().nullable(),
    role: dealContactRoleKindSchema,
    confirmed: z.boolean(),
    note: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict()

export const saveDealContactRoleRequestSchema = z
  .object({
    contactId: z.string().uuid(),
    role: dealContactRoleKindSchema,
    confirmed: z.boolean().optional(),
    note: nullableTrimmed(500).optional(),
  })
  .strict()

export const dealClaimSchema = z
  .object({
    id: z.string().uuid(),
    dealId: z.string().uuid(),
    fieldKey: dealClaimFieldKeySchema,
    status: claimStatusSchema,
    source: z.string().nullable(),
    sourceActivityId: z.string().uuid().nullable(),
    note: z.string().nullable(),
    recordedAt: z.string().datetime(),
    recordedById: z.string().uuid(),
    recordedByName: z.string().nullable(),
  })
  .strict()

export const saveDealClaimRequestSchema = z
  .object({
    fieldKey: dealClaimFieldKeySchema,
    status: claimStatusSchema,
    source: nullableTrimmed(500).optional(),
    sourceActivityId: z.string().uuid().nullable().optional(),
    note: nullableTrimmed(1000).optional(),
  })
  .strict()

export const activitySchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    companyName: z.string().nullable(),
    dealId: z.string().uuid().nullable(),
    dealTitle: z.string().nullable(),
    contactId: z.string().uuid().nullable(),
    contactName: z.string().nullable(),
    occurredAt: datetimeWithOffset,
    timezone: z.string(),
    channel: activityChannelSchema,
    actionType: activityActionTypeSchema,
    direction: activityDirectionSchema,
    result: z.string().nullable(),
    note: z.string().nullable(),
    verbatimQuote: z.string().nullable(),
    processedAt: datetimeWithOffset.nullable(),
    authorId: z.string().uuid(),
    authorName: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict()

export const createActivityRequestSchema = z
  .object({
    companyId: z.string().uuid(),
    dealId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    occurredAt: datetimeWithOffset,
    timezone: z.string().trim().min(1).max(60).default('Europe/Moscow'),
    channel: activityChannelSchema,
    actionType: activityActionTypeSchema,
    direction: activityDirectionSchema,
    result: nullableTrimmed(500).optional(),
    note: nullableTrimmed(4000).optional(),
    verbatimQuote: nullableTrimmed(4000).optional(),
    externalId: nullableTrimmed(120).optional(),
  })
  .strict()

export const activitiesResponseSchema = z
  .object({ items: z.array(activitySchema), total: z.number().int() })
  .strict()

export const salesTaskSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid().nullable(),
    companyName: z.string().nullable(),
    dealId: z.string().uuid().nullable(),
    dealTitle: z.string().nullable(),
    contactId: z.string().uuid().nullable(),
    contactName: z.string().nullable(),
    assigneeId: z.string().uuid(),
    assigneeName: z.string().nullable(),
    goal: z.string(),
    action: z.string().nullable(),
    /// null — срок неизвестен (FIX-07-AC04: не выдумываем now+1day).
    dueAt: datetimeWithOffset.nullable(),
    dueTimezone: z.string(),
    /// Плановая предложенная дата vs согласованная клиентом (OWNER-02-AC03).
    clientAgreedAt: datetimeWithOffset.nullable(),
    kind: salesTaskKindSchema,
    status: salesTaskStatusSchema,
    completedAt: datetimeWithOffset.nullable(),
    completedById: z.string().uuid().nullable(),
    linkedActivityId: z.string().uuid().nullable(),
    commitmentType: salesTaskCommitmentSchema,
    templated: z.boolean(),
    needsReview: z.boolean(),
    externalId: z.string().nullable(),
    /// Контроль конкуренции (FIX-05).
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const createSalesTaskRequestSchema = z
  .object({
    companyId: z.string().uuid().nullable().optional(),
    dealId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    assigneeId: z.string().uuid(),
    goal: z.string().trim().min(1).max(500),
    action: nullableTrimmed(500).optional(),
    dueAt: datetimeWithOffset.nullable(),
    // Без default: partial() в Zod 4 сохраняет default и PATCH затёр бы поле.
    dueTimezone: z.string().trim().min(1).max(60).optional(),
    clientAgreedAt: datetimeWithOffset.nullable().optional(),
    kind: salesTaskKindSchema.optional(),
    commitmentType: salesTaskCommitmentSchema.optional(),
    templated: z.boolean().optional(),
    externalId: nullableTrimmed(120).optional(),
  })
  .strict()

export const updateSalesTaskRequestSchema = createSalesTaskRequestSchema
  .omit({ assigneeId: true })
  .partial()
  .extend({
    assigneeId: z.string().uuid().optional(),
    status: salesTaskStatusSchema.optional(),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict()

export const salesTasksResponseSchema = z
  .object({ items: z.array(salesTaskSchema), total: z.number().int() })
  .strict()

export const draftTermsSchema = z
  .object({
    scope: nullableTrimmed(2000).optional(),
    exclusions: nullableTrimmed(2000).optional(),
    oneTime: nullableTrimmed(200).optional(),
    recurring: nullableTrimmed(200).optional(),
    timeline: nullableTrimmed(500).optional(),
    obligations: nullableTrimmed(2000).optional(),
    criteria: nullableTrimmed(2000).optional(),
    validUntil: nullableTrimmed(60).optional(),
  })
  .strict()

export const proposalDraftSchema = z
  .object({
    id: z.string().uuid(),
    groupId: z.string().uuid(),
    version: z.number().int(),
    dealId: z.string().uuid().nullable(),
    companyId: z.string().uuid(),
    companyName: z.string().nullable(),
    contactId: z.string().uuid().nullable(),
    channel: draftChannelSchema,
    recipient: z.string(),
    subject: z.string().nullable(),
    body: z.string(),
    terms: draftTermsSchema.nullable(),
    productClaimsVersion: z.string().nullable(),
    evidence: z.array(z.string()).nullable(),
    status: draftStatusSchema,
    createdById: z.string().uuid(),
    createdByName: z.string().nullable(),
    reviewedById: z.string().uuid().nullable(),
    reviewedAt: datetimeWithOffset.nullable(),
    approvedById: z.string().uuid().nullable(),
    approvedByName: z.string().nullable(),
    approvedAt: datetimeWithOffset.nullable(),
    contentHash: z.string().nullable(),
    sentAt: datetimeWithOffset.nullable(),
    sentById: z.string().uuid().nullable(),
    sentByName: z.string().nullable(),
    externalMessageId: z.string().nullable(),
    cancelledAt: datetimeWithOffset.nullable(),
    cancelReason: z.string().nullable(),
    /// Доказательство доставки (OWNER-04-AC01): фиксация отправки ≠ доставка.
    deliveredAt: datetimeWithOffset.nullable(),
    deliveryProof: z.string().nullable(),
    holdReason: z.string().nullable(),
    externalId: z.string().nullable(),
    /// Контроль конкуренции (FIX-05); version занята номером версии группы.
    rowVersion: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const createDraftRequestSchema = z
  .object({
    companyId: z.string().uuid(),
    dealId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    channel: draftChannelSchema,
    recipient: z.string().trim().min(3).max(300),
    subject: nullableTrimmed(300).optional(),
    body: z.string().trim().min(1).max(50_000),
    terms: draftTermsSchema.optional(),
    productClaimsVersion: nullableTrimmed(120).optional(),
    evidence: z.array(z.string().max(500)).max(20).optional(),
    /// Новая версия существующей группы черновиков.
    groupId: z.string().uuid().nullable().optional(),
    externalId: nullableTrimmed(120).optional(),
  })
  .strict()

export const updateDraftRequestSchema = z
  .object({
    dealId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    channel: draftChannelSchema.optional(),
    recipient: z.string().trim().min(3).max(300).optional(),
    subject: nullableTrimmed(300).optional(),
    body: z.string().trim().min(1).max(50_000).optional(),
    terms: draftTermsSchema.optional(),
    productClaimsVersion: nullableTrimmed(120).optional(),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict()

export const draftReviewRequestSchema = z.object({}).strict()
export const draftApproveRequestSchema = z.object({}).strict()

export const draftSendRequestSchema = z
  .object({
    /// Время фактической отправки, если фиксируется задним числом; по умолчанию сейчас.
    sentAt: datetimeWithOffset.optional(),
    externalMessageId: nullableTrimmed(300).optional(),
  })
  .strict()

export const draftCancelRequestSchema = z
  .object({ reason: z.string().trim().min(3).max(1000) })
  .strict()

export const draftsResponseSchema = z
  .object({ items: z.array(proposalDraftSchema), total: z.number().int() })
  .strict()
export const draftResponseSchema = z.object({ draft: proposalDraftSchema }).strict()

export const pilotCriterionSchema = z
  .object({
    id: z.string().uuid(),
    pilotId: z.string().uuid(),
    criterionKey: z.string(),
    statement: z.string(),
    method: z.string().nullable(),
    version: z.number().int(),
    agreedAt: datetimeWithOffset.nullable(),
    agreedById: z.string().uuid().nullable(),
    active: z.boolean(),
    createdAt: z.string().datetime(),
  })
  .strict()

export const pilotMilestoneSchema = z
  .object({
    id: z.string().uuid(),
    pilotId: z.string().uuid(),
    side: z.enum(['client', 'ordix']),
    commitment: z.string(),
    ownerId: z.string().uuid().nullable(),
    ownerName: z.string().nullable(),
    dueOn: dateOnlySchema.nullable(),
    proof: z.string().nullable(),
    doneAt: datetimeWithOffset.nullable(),
    createdAt: z.string().datetime(),
  })
  .strict()

export const pilotSchema = z
  .object({
    id: z.string().uuid(),
    dealId: z.string().uuid(),
    goal: z.string().nullable(),
    scopeArea: z.string().nullable(),
    productVersion: z.string().nullable(),
    termsVersion: z.string().nullable(),
    scopeIn: z.string().nullable(),
    scopeOut: z.string().nullable(),
    sourceData: z.string().nullable(),
    readinessNotes: z.string().nullable(),
    ordixOwnerId: z.string().uuid().nullable(),
    ordixOwnerName: z.string().nullable(),
    clientOwnerContactId: z.string().uuid().nullable(),
    clientOwnerName: z.string().nullable(),
    usersOverview: z.string().nullable(),
    metricsMethod: z.string().nullable(),
    thresholds: z.string().nullable(),
    schedule: z.string().nullable(),
    hoursSpent: z.number().int(),
    costs: z.number().int(),
    blockers: z.string().nullable(),
    decisionDueOn: dateOnlySchema.nullable(),
    paidNextStep: z.string().nullable(),
    paidNextStepAnchor: z.number().int().nullable(),
    status: pilotStatusSchema,
    outcome: pilotOutcomeSchema.nullable(),
    decidedAt: datetimeWithOffset.nullable(),
    decisionNote: z.string().nullable(),
    criteria: z.array(pilotCriterionSchema),
    milestones: z.array(pilotMilestoneSchema),
    /// Контроль конкуренции (FIX-05).
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const pilotUpsertRequestSchema = z
  .object({
    goal: nullableTrimmed(2000).optional(),
    scopeArea: nullableTrimmed(300).optional(),
    productVersion: nullableTrimmed(120).optional(),
    termsVersion: nullableTrimmed(120).optional(),
    scopeIn: nullableTrimmed(2000).optional(),
    scopeOut: nullableTrimmed(2000).optional(),
    sourceData: nullableTrimmed(2000).optional(),
    readinessNotes: nullableTrimmed(2000).optional(),
    ordixOwnerId: z.string().uuid().nullable().optional(),
    clientOwnerContactId: z.string().uuid().nullable().optional(),
    clientOwnerName: nullableTrimmed(160).optional(),
    usersOverview: nullableTrimmed(1000).optional(),
    metricsMethod: nullableTrimmed(2000).optional(),
    thresholds: nullableTrimmed(1000).optional(),
    schedule: nullableTrimmed(2000).optional(),
    hoursSpent: z.number().int().min(0).max(1_000_000).optional(),
    costs: z.number().int().min(0).max(1_000_000_000).optional(),
    blockers: nullableTrimmed(2000).optional(),
    decisionDueOn: dateOnlySchema.nullable().optional(),
    paidNextStep: nullableTrimmed(1000).optional(),
    paidNextStepAnchor: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict()

export const pilotDecisionRequestSchema = z
  .object({
    outcome: pilotOutcomeSchema,
    note: nullableTrimmed(2000).optional(),
  })
  .strict()

export const pilotCriterionRequestSchema = z
  .object({
    statement: z.string().trim().min(3).max(1000),
    method: nullableTrimmed(1000).optional(),
  })
  .strict()

export const pilotMilestoneRequestSchema = z
  .object({
    side: z.enum(['client', 'ordix']),
    commitment: z.string().trim().min(3).max(1000),
    ownerId: z.string().uuid().nullable().optional(),
    dueOn: dateOnlySchema.nullable().optional(),
  })
  .strict()

export const pilotMilestoneUpdateRequestSchema = z
  .object({
    commitment: z.string().trim().min(3).max(1000).optional(),
    ownerId: z.string().uuid().nullable().optional(),
    dueOn: dateOnlySchema.nullable().optional(),
    proof: nullableTrimmed(1000).optional(),
    done: z.boolean().optional(),
  })
  .strict()

export const dealLaunchSchema = z
  .object({
    id: z.string().uuid(),
    dealId: z.string().uuid(),
    launchOwnerId: z.string().uuid().nullable(),
    launchOwnerName: z.string().nullable(),
    plannedStartOn: dateOnlySchema.nullable(),
    actualStartOn: dateOnlySchema.nullable(),
    firstScenarioAcceptedOn: dateOnlySchema.nullable(),
    usageIssues: z.string().nullable(),
    supportHours: z.number().int(),
    directCosts: z.number().int(),
    valueCheckDueOn: dateOnlySchema.nullable(),
    riskLevel: riskLevelSchema,
    riskNotes: z.string().nullable(),
    nextArea: z.string().nullable(),
    caseStudyAllowed: z.boolean(),
    caseStudyBasis: z.string().nullable(),
    /// Контроль конкуренции (FIX-05).
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const dealLaunchUpsertRequestSchema = z
  .object({
    launchOwnerId: z.string().uuid().nullable().optional(),
    plannedStartOn: dateOnlySchema.nullable().optional(),
    actualStartOn: dateOnlySchema.nullable().optional(),
    firstScenarioAcceptedOn: dateOnlySchema.nullable().optional(),
    usageIssues: nullableTrimmed(2000).optional(),
    supportHours: z.number().int().min(0).max(1_000_000).optional(),
    directCosts: z.number().int().min(0).max(1_000_000_000).optional(),
    valueCheckDueOn: dateOnlySchema.nullable().optional(),
    riskLevel: riskLevelSchema.optional(),
    riskNotes: nullableTrimmed(1000).optional(),
    nextArea: nullableTrimmed(500).optional(),
    caseStudyAllowed: z.boolean().optional(),
    caseStudyBasis: nullableTrimmed(500).optional(),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict()

export const dealSubscriptionRequestSchema = z
  .object({
    status: z.enum(['active', 'paused', 'ended']),
    startsOn: dateOnlySchema,
    endsOn: dateOnlySchema.nullable().optional(),
    /// Явное основание активировать подписку без зафиксированного won (аудит).
    overrideReason: nullableTrimmed(400).optional(),
  })
  .strict()

export const paymentReceiptRequestSchema = z
  .object({
    amount: z.number().int().min(1).max(1_000_000_000),
    /// Фактическая дата поступления — доход датируется ею, не dueDate (CRM-11-AC01).
    actualReceivedOn: dateOnlySchema,
    comment: nullableTrimmed(400).optional(),
    /// Явная операция переплаты: остаток остаётся 0, избыток фиксируется в комментарии.
    allowOverpayment: z.boolean().optional(),
  })
  .strict()

export const paymentReceiptSchema = z
  .object({
    txnId: z.string().uuid(),
    expectedPaymentId: z.string().uuid(),
    amount: z.number().int(),
    occurredOn: dateOnlySchema,
    dealId: z.string().uuid().nullable(),
    receivedAmount: z.number().int(),
    remainingAmount: z.number().int(),
    status: expectedPaymentStatusKindSchema,
  })
  .strict()

export const paymentReceiptResponseSchema = z.object({ receipt: paymentReceiptSchema }).strict()

export const todayLaunchControlItemSchema = z
  .object({
    dealId: z.string().uuid(),
    title: z.string(),
    companyName: z.string().nullable(),
    launchOwnerName: z.string().nullable(),
    valueCheckDueOn: dateOnlySchema.nullable(),
    /// Контроль просрочен или оплачено без принятого использования.
    overdue: z.boolean(),
    /// Оплачено, но первый сценарий не принят (данные о использовании отсутствуют/отрицательные).
    unusedPaid: z.boolean(),
    receivedTotal: z.number().int(),
    firstScenarioAcceptedOn: dateOnlySchema.nullable(),
  })
  .strict()

export const todayTaskItemSchema = salesTaskSchema
export const todayResponseSchema = z
  .object({
    date: z.string().datetime(),
    timezone: z.string(),
    overdueTasks: z.array(salesTaskSchema),
    todayTasks: z.array(salesTaskSchema),
    upcomingMeetings: z.array(activitySchema),
    repliesToProcess: z.array(activitySchema),
    dealsWithoutNextStep: z.array(
      z
        .object({
          dealId: z.string().uuid(),
          title: z.string(),
          companyName: z.string().nullable(),
          stageTitle: z.string().nullable(),
          ownerId: z.string().uuid().nullable(),
          ownerName: z.string().nullable(),
        })
        .strict(),
    ),
    /// Контроль запуска/использования/продления (OWNER-03-AC04, аудит R-19).
    launchControl: z.array(todayLaunchControlItemSchema),
  })
  .strict()

export const crmFunnelReportQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    cohort: z.string().trim().min(1).max(60).optional(),
    segment: z.string().trim().min(1).max(120).optional(),
    source: z.string().trim().min(1).max(200).optional(),
    /// Словарь каналов ВЗАИМОДЕЙСТВИЙ (call/meeting), не контактных каналов (phone).
    channel: activityChannelSchema.optional(),
    ownerId: z.string().uuid().optional(),
    /// Версия оффера/утверждений (productClaimsVersion черновиков сделки).
    offerVersion: z.string().trim().min(1).max(120).optional(),
  })
  .strict()

export const crmFunnelReportResponseSchema = z
  .object({
    period: z.object({ from: z.string().nullable(), to: z.string().nullable() }).strict(),
    filtersEcho: crmFunnelReportQuerySchema,
    /// Числитель/знаменатель всегда рядом с процентом (CRM-07-AC05).
    opportunities: z.number().int(),
    /// Уникальные возможности, двигавшиеся в периоде, — знаменатель событиевых долей
    /// (OWNER-04-AC03): старые возможности, перешедшие сейчас, не дают >100%.
    activeInPeriod: z.number().int(),
    exits: z
      .object({ n: z.number().int(), total: z.number().int(), pct: z.number().int().nullable() })
      .strict(),
    advanced: z
      .object({ n: z.number().int(), total: z.number().int(), pct: z.number().int().nullable() })
      .strict(),
    lost: z
      .object({ n: z.number().int(), total: z.number().int(), pct: z.number().int().nullable() })
      .strict(),
    paused: z.object({ n: z.number().int() }).strict(),
    openOpportunities: z.number().int(),
    /// Доставка контактов: подтверждённая и непроверенная — раздельно (CRM-07-AC04).
    delivery: z
      .object({ confirmed: z.number().int(), unconfirmed: z.number().int() })
      .strict(),
    /// Строки истории до доработки не имеют stageId: исключены из подсчёта и показаны числом.
    legacyEventsExcluded: z.number().int(),
    reliableFrom: z.string().datetime().nullable(),
    byStage: z
      .array(
        z
          .object({
            stageId: z.string().uuid(),
            title: z.string(),
            semanticType: z.string(),
            entered: z.number().int(),
            exitedAny: z.number().int(),
            advancedToNext: z.number().int(),
            lostFrom: z.number().int(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()

export const importPreviewItemSchema = z
  .object({
    externalId: z.string().nullable(),
    companyName: z.string(),
    domain: z.string().nullable(),
    region: z.string().nullable(),
    segment: z.string().nullable(),
    researchSource: z.string().nullable(),
    selectionReason: z.string().nullable(),
    website: z.string().nullable(),
    contacts: z
      .array(
        z
          .object({
            name: z.string().nullable(),
            position: z.string().nullable(),
            email: z.string().nullable(),
            phone: z.string().nullable(),
            status: contactStatusSchema,
            isDirect: z.boolean(),
          })
          .strict(),
      )
      .max(20),
    draftsCount: z.number().int(),
    match: z
      .object({
        companyId: z.string().uuid().nullable(),
        matchedBy: z.enum(['external_id', 'domain', 'inn', 'name', 'none']),
        conflicts: z
          .array(
            z
              .object({
                field: z.string(),
                existing: z.string().nullable(),
                incoming: z.string().nullable(),
              })
              .strict(),
          )
          .max(20),
      })
      .strict(),
    valid: z.boolean(),
    invalidReason: z.string().nullable(),
    /// Предлагаемое действие: create | update (дозаполнить пустые поля) | skip.
    suggestedAction: z.enum(['create', 'update', 'skip']),
  })
  .strict()

export const importPreviewResponseSchema = z
  .object({
    items: z.array(importPreviewItemSchema),
    summary: z
      .object({
        total: z.number().int(),
        create: z.number().int(),
        update: z.number().int(),
        skip: z.number().int(),
        invalid: z.number().int(),
      })
      .strict(),
  })
  .strict()

export const importPipelinePayloadSchema = z
  .object({
    version: z.number().int().optional(),
    updated_at: z.string().optional(),
    accounts: z
      .array(
        z
          .object({
            id: z.string().min(1).max(120),
            company_name: z.string().min(1).max(300),
            official_domain: z.string().max(300).nullable().optional(),
            region: z.string().max(200).nullable().optional(),
            segment_hypothesis: z.string().max(200).nullable().optional(),
            fit_reason: z.string().max(2000).nullable().optional(),
            contacts: z
              .array(
                z
                  .object({
                    name: z.string().max(160).nullable().optional(),
                    job_title: z.string().max(160).nullable().optional(),
                    email: z.string().max(300).nullable().optional(),
                    phone: z.string().max(100).nullable().optional(),
                    verification_status: z.string().max(40).nullable().optional(),
                    is_direct_decision_maker: z.boolean().nullable().optional(),
                  })
                  .passthrough(),
              )
              .max(20)
              .optional(),
            outbound_drafts: z
              .array(
                z
                  .object({
                    subject: z.string().max(300).nullable().optional(),
                    body: z.string().max(50_000).optional(),
                  }
                  )
                  .passthrough(),
              )
              .max(10)
              .optional(),
            next_action: z.string().max(500).nullable().optional(),
            next_action_date: z.string().max(40).nullable().optional(),
          })
          .passthrough(),
      )
      .max(2000),
  })
  .passthrough()

export const importApplyRequestSchema = z
  .object({
    payload: importPipelinePayloadSchema,
    decisions: z
      .array(
        z
          .object({
            externalId: z.string(),
            action: z.enum(['create', 'update', 'skip']),
            includeContacts: z.boolean().default(true),
            includeDrafts: z.boolean().default(true),
            includeTask: z.boolean().default(true),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict()

export const importApplyResponseSchema = z
  .object({
    companiesCreated: z.number().int(),
    companiesUpdated: z.number().int(),
    skipped: z.number().int(),
    contactsCreated: z.number().int(),
    channelsCreated: z.number().int(),
    tasksCreated: z.number().int(),
    draftsCreated: z.number().int(),
    errors: z
      .array(z.object({ externalId: z.string(), error: z.string() }).strict())
      .max(2000),
    protocol: z.array(
      z
        .object({
          externalId: z.string(),
          action: z.string(),
          companyId: z.string().uuid().nullable(),
          detail: z.string(),
        })
        .strict(),
    ),
  })
  .strict()

export const agentOpLogSchema = z
  .object({
    id: z.string().uuid(),
    actorId: z.string().uuid(),
    runId: z.string().nullable(),
    operation: z.string(),
    entityId: z.string().uuid().nullable(),
    ok: z.boolean(),
    error: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict()

export const agentOpLogsResponseSchema = z
  .object({ items: z.array(agentOpLogSchema), total: z.number().int() })
  .strict()

// =============================================================================
// V2: факты исследования, партнёры, доставка/сторнирование, «Сегодня», экспорт
// =============================================================================

export const companyFactStatusSchema = z.enum([
  'hypothesis',
  'public_fact',
  'customer_confirmed',
  'unknown',
])

export const companyFactSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    claim: z.string(),
    sourceUrl: z.string().nullable(),
    observedAt: z.string().datetime(),
    authorId: z.string().uuid().nullable(),
    authorName: z.string().nullable(),
    runId: z.string().nullable(),
    status: companyFactStatusSchema,
    basis: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict()

export const createCompanyFactRequestSchema = z
  .object({
    claim: z.string().trim().min(3).max(2000),
    sourceUrl: nullableTrimmed(500).optional(),
    observedAt: datetimeWithOffset,
    runId: nullableTrimmed(120).optional(),
    /// Агент не может ставить customer_confirmed (AGENT-03-AC02).
    status: companyFactStatusSchema.optional(),
    basis: nullableTrimmed(1000).optional(),
  })
  .strict()

export const companyFactsResponseSchema = z
  .object({ items: z.array(companyFactSchema) })
  .strict()

export const partnerAgreementSchema = z
  .object({
    id: z.string().uuid(),
    dealId: z.string().uuid(),
    partnerCompanyId: z.string().uuid(),
    partnerCompanyName: z.string().nullable(),
    partnerContactId: z.string().uuid().nullable(),
    /// proposed | agreed
    status: z.string(),
    /// Ставка в сотых долях процента (3000 = 30,00%); null — не обсуждалась.
    rateBps: z.number().int().nullable(),
    calculationBase: z.string().nullable(),
    periodNotes: z.string().nullable(),
    payoutTrigger: z.string().nullable(),
    documentRef: z.string().nullable(),
    ownerId: z.string().uuid().nullable(),
    ownerName: z.string().nullable(),
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const partnerAgreementUpsertRequestSchema = z
  .object({
    partnerCompanyId: z.string().uuid(),
    partnerContactId: z.string().uuid().nullable().optional(),
    status: z.enum(['proposed', 'agreed']).optional(),
    rateBps: z.number().int().min(0).max(1_000_000).nullable().optional(),
    calculationBase: nullableTrimmed(500).optional(),
    periodNotes: nullableTrimmed(1000).optional(),
    payoutTrigger: nullableTrimmed(500).optional(),
    documentRef: nullableTrimmed(500).optional(),
    ownerId: z.string().uuid().nullable().optional(),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict()

export const partnerAgreementResponseSchema = z
  .object({ partner: partnerAgreementSchema.nullable() })
  .strict()

export const draftDeliveredRequestSchema = z
  .object({
    deliveredAt: datetimeWithOffset.optional(),
    /// Доказательство: ID сообщения/ссылка/ответ клиента — обязательно.
    proof: z.string().trim().min(3).max(500),
  })
  .strict()

export const receiptReverseRequestSchema = z
  .object({
    reason: z.string().trim().min(3).max(1000),
    reversalDate: dateOnlySchema.optional(),
  })
  .strict()

export const receiptReverseResponseSchema = z
  .object({
    reversalTxnId: z.string().uuid(),
    expectedPaymentId: z.string().uuid(),
    reversedTxnId: z.string().uuid(),
    receivedAmount: z.number().int(),
    remainingAmount: z.number().int(),
    status: z.string(),
  })
  .strict()

export const idempotencyResultResponseSchema = z
  .object({
    found: z.boolean(),
    requestHash: z.string().optional(),
    result: z.unknown().optional(),
    completed: z.boolean().optional(),
  })
  .strict()

export const companiesExportResponseSchema = z
  .object({
    exportedAt: z.string().datetime(),
    companies: z.array(
      z.object({ id: z.string().uuid(), name: z.string(), domain: z.string().nullable() }).strict(),
    ),
    contacts: z.array(
      z
        .object({
          id: z.string().uuid(),
          companyId: z.string().uuid(),
          name: z.string().nullable(),
          doNotContact: z.boolean(),
        })
        .strict(),
    ),
    tasks: z.array(
      z
        .object({
          id: z.string().uuid(),
          companyId: z.string().uuid().nullable(),
          goal: z.string(),
          status: z.string(),
        })
        .strict(),
    ),
    deals: z.array(
      z
        .object({
          id: z.string().uuid(),
          companyId: z.string().uuid().nullable(),
          title: z.string(),
          stageId: z.string().uuid(),
        })
        .strict(),
    ),
  })
  .strict()

export const companyEventsSchema = z
  .object({ items: z.array(companyEventSchema) })
  .strict()

export const businessUsersSchema = z
  .object({
    id: z.string().uuid(),
    displayName: z.string().nullable(),
    email: z.string(),
    role: z.string(),
  })
  .strict()

export const businessUsersResponseSchema = z
  .object({ items: z.array(businessUsersSchema) })
  .strict()

export const activityResponseSchema = z.object({ activity: activitySchema }).strict()

export const salesTaskResponseSchema = z.object({ task: salesTaskSchema }).strict()

export const claimResponseSchema = dealClaimSchema

export const pilotResponseSchema = z.object({ pilot: pilotSchema.nullable() }).strict()

export const proposalDraftsResponseSchema = z
  .object({ items: z.array(proposalDraftSchema), total: z.number().int() })
  .strict()

export const dealLaunchResponseSchema = z
  .object({ launch: dealLaunchSchema.nullable() })
  .strict()

/// Полная карточка сделки (GET /deals/{id}): квалификация, роли, черновики, пилот, запуск, деньги.
/// Канбан-карточка остаётся лёгкой — раздельная загрузка без перегрузки первоначального ввода.
export const dealDetailSchema = dealSchema.extend({
  direction: z.string().nullable(),
  scenario: z.string().nullable(),
  currentProcess: z.string().nullable(),
  problemStatement: z.string().nullable(),
  consequences: z.string().nullable(),
  baseline: z.string().nullable(),
  measurementMethod: z.string().nullable(),
  assumptions: z.string().nullable(),
  desiredOutcome: z.string().nullable(),
  priority: z.string().nullable(),
  priorityEvent: z.string().nullable(),
  economicBuyerStatus: z.string().nullable(),
  selectionCriteria: z.string().nullable(),
  decisionProcess: z.string().nullable(),
  techConstraints: z.string().nullable(),
  priceAnchor: z.number().int().nullable(),
  priceReaction: z.string().nullable(),
  nextAgreedStep: z.string().nullable(),
  pausedReason: z.string().nullable(),
  resumeCondition: z.string().nullable(),
  resumeOn: dateOnlySchema.nullable(),
  wonAt: z.string().datetime().nullable(),
  wonBasis: z.string().nullable(),
  signedAt: dateOnlySchema.nullable(),
  implementationStartPlan: dateOnlySchema.nullable(),
  implementationStartFact: dateOnlySchema.nullable(),
  activationAt: z.string().datetime().nullable(),
  subStartsOn: dateOnlySchema.nullable(),
  subEndsOn: dateOnlySchema.nullable(),
  claims: z.array(dealClaimSchema),
  contactRoles: z.array(dealContactRoleSchema),
  drafts: z.array(proposalDraftSchema),
  pilot: pilotSchema.nullable(),
  launch: dealLaunchSchema.nullable(),
  /// Ожидаемые поступления (обязательства) по сделке с состоянием исполнения.
  expectedPayments: z.array(expectedPaymentSchema),
  /// Подтверждённые поступления по сделке (факты денег, а не прогноз).
  receivedTotal: z.number().int(),
  /// Вклад = поступления − прямые расходы запуска − часы поддержки × ставка.
  contribution: z.number().int().nullable(),
})

export const dealDetailResponseSchema = z.object({ deal: dealDetailSchema }).strict()

// =============================================================================
// Типы
// =============================================================================

export type CrmStage = z.infer<typeof crmStageSchema>
export type Deal = z.infer<typeof dealSchema>
export type DealDetail = z.infer<typeof dealDetailSchema>
export type DealComment = z.infer<typeof dealCommentSchema>
export type CrmBoardResponse = z.infer<typeof crmBoardResponseSchema>
export type CreateDealRequest = z.infer<typeof createDealRequestSchema>
export type UpdateDealRequest = z.infer<typeof updateDealRequestSchema>
export type MoveDealRequest = z.infer<typeof moveDealRequestSchema>
export type ContactChannel = z.infer<typeof contactChannelSchema>
export type Contact = z.infer<typeof contactSchema>
export type CreateContactRequest = z.infer<typeof createContactRequestSchema>
export type UpdateContactRequest = z.infer<typeof updateContactRequestSchema>
export type CreateContactChannelRequest = z.infer<typeof createContactChannelRequestSchema>
export type UpdateContactChannelRequest = z.infer<typeof updateContactChannelRequestSchema>
export type DealContactRole = z.infer<typeof dealContactRoleSchema>
export type SaveDealContactRoleRequest = z.infer<typeof saveDealContactRoleRequestSchema>
export type DealClaim = z.infer<typeof dealClaimSchema>
export type SaveDealClaimRequest = z.infer<typeof saveDealClaimRequestSchema>
export type Activity = z.infer<typeof activitySchema>
export type CreateActivityRequest = z.infer<typeof createActivityRequestSchema>
export type SalesTask = z.infer<typeof salesTaskSchema>
export type CreateSalesTaskRequest = z.infer<typeof createSalesTaskRequestSchema>
export type UpdateSalesTaskRequest = z.infer<typeof updateSalesTaskRequestSchema>
export type ProposalDraft = z.infer<typeof proposalDraftSchema>
export type CreateDraftRequest = z.infer<typeof createDraftRequestSchema>
export type UpdateDraftRequest = z.infer<typeof updateDraftRequestSchema>
export type DraftTerms = z.infer<typeof draftTermsSchema>
export type PilotCriterion = z.infer<typeof pilotCriterionSchema>
export type PilotMilestone = z.infer<typeof pilotMilestoneSchema>
export type PilotEvaluation = z.infer<typeof pilotSchema>
export type PilotUpsertRequest = z.infer<typeof pilotUpsertRequestSchema>
export type PilotDecisionRequest = z.infer<typeof pilotDecisionRequestSchema>
export type DealLaunch = z.infer<typeof dealLaunchSchema>
export type DealLaunchUpsertRequest = z.infer<typeof dealLaunchUpsertRequestSchema>
export type DealSubscriptionRequest = z.infer<typeof dealSubscriptionRequestSchema>
export type PaymentReceiptRequest = z.infer<typeof paymentReceiptRequestSchema>
export type PaymentReceipt = z.infer<typeof paymentReceiptSchema>
export type CompanyFact = z.infer<typeof companyFactSchema>
export type CreateCompanyFactRequest = z.infer<typeof createCompanyFactRequestSchema>
export type PartnerAgreement = z.infer<typeof partnerAgreementSchema>
export type PartnerAgreementUpsertRequest = z.infer<typeof partnerAgreementUpsertRequestSchema>
export type ReceiptReverseRequest = z.infer<typeof receiptReverseRequestSchema>
export type TodayLaunchControlItem = z.infer<typeof todayLaunchControlItemSchema>
export type CompaniesExportResponse = z.infer<typeof companiesExportResponseSchema>
export type TodayResponse = z.infer<typeof todayResponseSchema>
export type CrmFunnelReportResponse = z.infer<typeof crmFunnelReportResponseSchema>
export type CrmFunnelReportQuery = z.infer<typeof crmFunnelReportQuerySchema>
export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>
export type ImportApplyRequest = z.infer<typeof importApplyRequestSchema>
export type ImportApplyResponse = z.infer<typeof importApplyResponseSchema>
export type CompaniesQuery = z.infer<typeof companiesQuerySchema>
export type UpdateCompanyRequest = z.infer<typeof updateCompanyRequestSchema>
export type CompanyEvent = z.infer<typeof companyEventSchema>
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
export type DealHistoryEntry = z.infer<typeof dealHistoryEntrySchema>
export type CrmReport = z.infer<typeof crmReportResponseSchema>
export type MrrMovement = z.infer<typeof mrrMovementResponseSchema>
export type CashflowHistory = z.infer<typeof cashflowHistoryResponseSchema>
export type ExpectedPayment = z.infer<typeof expectedPaymentSchema>
export type Sprint = z.infer<typeof sprintSchema>
export type Company = z.infer<typeof companySchema>
export type CreateCompanyRequest = z.infer<typeof createCompanyRequestSchema>
export type Notifications = z.infer<typeof notificationsResponseSchema>
export type CreateSprintRequest = z.infer<typeof createSprintRequestSchema>
export type CreateExpectedPaymentRequest = z.infer<typeof createExpectedPaymentRequestSchema>
export type UpdateExpectedPaymentRequest = z.infer<typeof updateExpectedPaymentRequestSchema>
export type FinanceSummary = z.infer<typeof financeSummaryResponseSchema>
export type ForecastMonth = z.infer<typeof forecastMonthSchema>
export type ForecastResponse = z.infer<typeof forecastResponseSchema>
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>
