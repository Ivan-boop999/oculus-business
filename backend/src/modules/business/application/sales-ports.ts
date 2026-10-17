import type {
  CompaniesExportResponse,
  CompanyFact,
  CreateCompanyFactRequest,
  PartnerAgreement,
  PartnerAgreementUpsertRequest,
  Activity,
  Company,  CompanyEvent,
  Contact,
  ContactChannel,
  CreateActivityRequest,
  CreateContactChannelRequest,
  UpdateContactChannelRequest,
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
  PaymentReceiptRequest,
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

/// Порт репозитория B2B-продаж: единственная точка доступа к хранилищу для SalesService.
/// Возвращает контрактные DTO — слои выше не знают о Prisma.
export type SalesRepositoryBase = {
  // Участники и права
  listBusinessUsers(): Promise<Array<{ id: string; displayName: string | null; email: string; role: string }>>
  getUserForAgentCheck(userId: string): Promise<{ role: string; agentPermissions: unknown } | null>

  // Компании (CRM-01, CRM-04)
  listCompanies(query: CompaniesQuery): Promise<{ items: Company[]; total: number }>
  findCompanyDto(id: string): Promise<Company | null>
  createCompany(input: CreateCompanyRequest & { domain: string | null }): Promise<Company>
  updateCompany(
    id: string,
    input: UpdateCompanyRequest & { domain?: string | null },
  ): Promise<Company>
  setCompanyDnc(
    id: string,
    input: { reason: string; scope: 'all' | 'commercial'; source: string | null },
    actorId: string,
    at: Date,
  ): Promise<Company>
  liftCompanyDnc(id: string, reason: string, actorId: string, at: Date): Promise<Company>
  listCompanyEvents(companyId: string): Promise<CompanyEvent[]>

  // Контакты и каналы (CRM-02)
  listContacts(companyId: string): Promise<Contact[]>
  findContactDto(id: string): Promise<Contact | null>
  createContact(input: CreateContactRequest): Promise<Contact>
  updateContact(id: string, input: UpdateContactRequest): Promise<Contact>
  setContactDnc(
    id: string,
    input: { reason: string; scope: 'all' | 'commercial'; source: string | null },
    actorId: string,
    at: Date,
  ): Promise<Contact>
  liftContactDnc(id: string, reason: string, actorId: string, at: Date): Promise<Contact>
  createChannel(contactId: string, input: CreateContactChannelRequest): Promise<ContactChannel>
  updateChannel(id: string, input: UpdateContactChannelRequest): Promise<ContactChannel>
  findChannelInCompany(
    companyId: string,
    kind: string,
    value: string,
  ): Promise<{ contactId: string } | null>

  // Сделка: детали, квалификация, переходы (CRM-03, CRM-05, CRM-06)
  getDealDetail(id: string): Promise<DealDetail | null>
  createDealWithInitialEntry(
    input: CreateDealInput,
    createdById: string,
    stageId: string,
    history: { toStageId: string; actorId: string; actorKind: 'human' | 'agent' },
  ): Promise<Deal>
  deleteDealBySales(id: string): Promise<void>
  listStagesLight(): Promise<
    Array<{
      id: string
      title: string
      position: number
      semanticType: string
      isWon: boolean
      isLost: boolean
    }>
  >
  updateDealFields(
    id: string,
    data: Record<string, unknown>,
    expectedVersion: number | undefined,
  ): Promise<Deal>
  transitionDealTx(args: {
    dealId: string
    toStageId: string
    position: number
    history: {
      fromStageId: string | null
      fromStageTitle: string | null
      toStageId: string
      toStageTitle: string
      event: 'moved'
      actorKind: 'human' | 'agent'
      actorId: string
      reason: string | null
      overrideReason: string | null
      idempotencyKey: string | null
      monthlyAmountSnapshot: number | null
    }
    dealSideEffects: Record<string, unknown>
  }): Promise<Deal>
  findDealInternal(id: string): Promise<DealInternal | null>
  listDealClaims(dealId: string): Promise<DealClaim[]>
  upsertDealClaim(
    dealId: string,
    input: SaveDealClaimRequest,
    recordedById: string,
  ): Promise<DealClaim>
  listDealContactRoles(dealId: string): Promise<DealContactRole[]>
  upsertDealContactRole(
    dealId: string,
    input: SaveDealContactRoleRequest,
  ): Promise<DealContactRole>
  deleteDealContactRole(id: string): Promise<void>

  // Активности и задачи (CRM-03)
  createActivity(input: CreateActivityRequest, authorId: string): Promise<Activity>
  listActivities(query: {
    companyId?: string | undefined
    dealId?: string | undefined
    direction?: 'inbound' | 'outbound' | undefined
    unprocessedOnly?: boolean | undefined
    limit: number
    offset: number
  }): Promise<{ items: Activity[]; total: number }>
  markActivityProcessed(id: string, at: Date): Promise<void>
  markTemplatedTasksNeedsReview(companyId: string): Promise<number>
  createSalesTask(input: CreateSalesTaskRequest, createdById: string): Promise<SalesTask>
  updateSalesTask(id: string, input: UpdateSalesTaskRequest, actorId: string): Promise<SalesTask>
  listSalesTasks(query: {
    status?: 'open' | 'done' | 'cancelled' | undefined
    assigneeId?: string | undefined
    companyId?: string | undefined
    dealId?: string | undefined
    dueBefore?: string | undefined
    limit: number
    offset: number
  }): Promise<{ items: SalesTask[]; total: number }>
  listOpenTasksForDeal(dealId: string): Promise<
    Array<{ goal: string; action: string | null; dueAt: Date | null; status: string }>
  >
  setDealNextActionSummary(
    dealId: string,
    summary: { nextAction: string | null; nextActionAt: string | null },
  ): Promise<void>

  // Черновики (CRM-10)
  createDraft(input: CreateDraftRequest, createdById: string): Promise<ProposalDraft>
  findDraftDto(id: string): Promise<ProposalDraft | null>
  findDraftInternal(id: string): Promise<DraftInternal | null>
  updateDraftRow(id: string, data: Record<string, unknown>): Promise<ProposalDraft>
  setDraftStatus(
    id: string,
    patch: Record<string, unknown>,
    expectedRowVersion: number | undefined,
  ): Promise<ProposalDraft>
  createDraftNewVersion(
    id: string,
    changes: Record<string, unknown>,
  ): Promise<ProposalDraft>
  listDrafts(query: {
    status?: string | undefined
    companyId?: string | undefined
    dealId?: string | undefined
    limit: number
    offset: number
  }): Promise<{ items: ProposalDraft[]; total: number }>
  listDraftVersions(groupId: string): Promise<ProposalDraft[]>

  // Пилот (CRM-09)
  upsertPilot(dealId: string, input: PilotUpsertRequest): Promise<PilotEvaluation>
  findPilotDto(dealId: string): Promise<PilotEvaluation | null>
  findPilotInternal(dealId: string): Promise<PilotInternal | null>
  setPilotStatus(id: string, status: 'draft' | 'running'): Promise<PilotEvaluation>
  setPilotDecision(
    id: string,
    outcome: 'accepted' | 'revise' | 'stop',
    note: string | null,
    at: Date,
  ): Promise<PilotEvaluation>
  createPilotCriterion(
    pilotId: string,
    input: { statement: string; method: string | null },
  ): Promise<PilotCriterion>
  newPilotCriterionVersion(
    criterionId: string,
    input: { statement: string; method: string | null },
  ): Promise<PilotCriterion>
  agreePilotCriterion(id: string, actorId: string, at: Date): Promise<PilotCriterion>
  createPilotMilestone(
    pilotId: string,
    input: { side: 'client' | 'ordix'; commitment: string; ownerId: string | null; dueOn: string | null },
  ): Promise<PilotMilestone>
  updatePilotMilestone(
    id: string,
    input: { commitment?: string; ownerId?: string | null; dueOn?: string | null; proof?: string | null; done?: boolean },
  ): Promise<PilotMilestone>

  // Запуск (CRM-12)
  upsertLaunch(dealId: string, input: DealLaunchUpsertRequest): Promise<DealLaunch>
  findLaunchDto(dealId: string): Promise<DealLaunch | null>

  // Подписка и поступления (CRM-11)
  setDealSubscription(
    dealId: string,
    input: { status: 'active' | 'paused' | 'ended'; startsOn: string; endsOn: string | null; activationAt: Date | null },
  ): Promise<Deal>
  applyReceipt(args: {
    paymentId: string
    amount: number
    actualReceivedOn: string
    comment: string | null
    actorId: string
    allowOverpayment?: boolean
  }): Promise<PaymentReceipt>
  findExpectedPaymentInternal(id: string): Promise<ExpectedPaymentInternal | null>
  listReceiptsForDeal(dealId: string): Promise<PaymentReceipt[]>

  // Отчёт, импорт, сегодня (CRM-07, §8.1, экран 2)
  funnelReport(query: CrmFunnelReportQuery, now: Date): Promise<CrmFunnelReportResponse>
  importPreview(payload: unknown): Promise<ImportPreviewResponse>
  importApply(request: ImportApplyRequest, actorId: string): Promise<ImportApplyResponse>
  today(now: Date): Promise<TodayResponse>

  // Идемпотентность и журнал агента (CRM-08)
  findIdempotencyRecord(
    actorId: string,
    operation: string,
    key: string,
  ): Promise<{ requestHash: string; result: unknown } | null>
  createIdempotencyRecord(
    actorId: string,
    operation: string,
    key: string,
    requestHash: string,
    result: unknown,
  ): Promise<void>
  logAgentOp(input: {
    actorId: string
    runId: string | null
    operation: string
    entityId: string | null
    ok: boolean
    error: string | null
  }): Promise<void>
  listAgentOps(query: { limit: number; offset: number }): Promise<{
    items: Array<{
      id: string
      actorId: string
      runId: string | null
      operation: string
      entityId: string | null
      ok: boolean
      error: string | null
      createdAt: string
    }>
    total: number
  }>
}

/// Внутреннее представление сделки для серверных правил (не покидает модуль).
export type DealInternal = {
  id: string
  stageId: string
  title: string
  lostReason: string | null
  pausedReason: string | null
  resumeCondition: string | null
  resumeOn: string | null
  wonAt: string | null
  wonBasis: string | null
  problemStatement: string | null
  consequences: string | null
  nextAgreedStep: string | null
  partnerCompanyId: string | null
  monthlyAmount: number
  oneTimeAmount: number
  ownerId: string | null
  companyId: string | null
  version: number
  stage: {
    id: string
    title: string
    position: number
    semanticType: string
    isWon: boolean
    isLost: boolean
  }
  company: { doNotContact: boolean; dncScope: string; dncReason: string | null } | null
}

export type DraftInternal = {
  id: string
  groupId: string
  version: number
  status: string
  rowVersion: number
  recipient: string
  contentHash: string | null
  companyId: string
  company: { doNotContact: boolean; dncScope: string; dncReason: string | null } | null
}

export type PilotInternal = {
  id: string
  status: string
  outcome: string | null
  ordixOwnerId: string | null
  clientOwnerContactId: string | null
  clientOwnerName: string | null
  sourceData: string | null
  decisionDueOn: string | null
  goal: string | null
  paidNextStep: string | null
  usersOverview: string | null
  activeCriteriaCount: number
  criteriaAgreedAndMethoded: boolean
}

export type ExpectedPaymentInternal = {
  id: string
  amount: number
  receivedAmount: number
  status: string
  dealId: string | null
  title: string
}

export type CreateDealInput = Record<string, unknown> & { title: string; ownerId?: string | null }

/// V2-расширения порта (FIX-01…07, OWNER, AGENT). Реализуются тем же Prisma-репозиторием.
export type V2SalesRepositoryExtensions = {
  // FIX-03: атомарная идемпотентность
  reserveIdempotency(
    actorId: string,
    operation: string,
    key: string,
    requestHash: string,
  ): Promise<
    | { kind: 'reserved' }
    | { kind: 'completed'; requestHash: string; result: unknown }
    | { kind: 'in_progress' }
  >
  completeIdempotency(
    actorId: string,
    operation: string,
    key: string,
    requestHash: string,
    result: unknown,
  ): Promise<void>
  releaseIdempotency(actorId: string, operation: string, key: string): Promise<void>

  // FIX-06: остановка продолжений при запрете
  stopContinuationsForDnc(companyId: string, scope: 'all' | 'commercial', reason: string): Promise<void>
  stopContinuationsForContactDnc(contactId: string, scope: 'all' | 'commercial', reason: string): Promise<void>

  // FIX-04: сторнирование связанного поступления
  reverseReceipt(args: {
    paymentId: string
    txnId: string
    reason: string
    reversalDate: string
    actorId: string
  }): Promise<{
    reversalTxnId: string
    expectedPaymentId: string
    reversedTxnId: string
    receivedAmount: number
    remainingAmount: number
    status: string
  }>
  findLinkedReceipts(txnId: string): Promise<Array<{ id: string; expectedPaymentId: string | null }>>

  // AGENT-03: факты исследования
  listCompanyFacts(companyId: string): Promise<CompanyFact[]>
  createCompanyFact(
    companyId: string,
    input: CreateCompanyFactRequest,
    authorId: string,
  ): Promise<CompanyFact>

  // OWNER-05: партнёрские условия
  findPartnerAgreement(dealId: string): Promise<PartnerAgreement | null>
  upsertPartnerAgreement(dealId: string, input: PartnerAgreementUpsertRequest): Promise<PartnerAgreement>
  setDealPartner(dealId: string, partnerCompanyId: string | null): Promise<void>

  // OWNER-05: экспорт своих данных с ID и связями
  exportCompanies(): Promise<CompaniesExportResponse>

  // OWNER-02: часовой пояс «Сегодня»
  getTimezone(): Promise<string>
}


/// Полный порт: базовая поверхность + V2-расширения.
export type SalesRepository = SalesRepositoryBase & V2SalesRepositoryExtensions
