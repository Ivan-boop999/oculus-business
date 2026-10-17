import type {
  CompanyFact,
  CreateCompanyFactRequest,
  PartnerAgreement,
  PartnerAgreementUpsertRequest,
  Activity,
  Company,
  CompaniesQuery,
  Contact,
  CrmFunnelReportQuery,
  CrmFunnelReportResponse,
  CreateCompanyRequest,
  CreateContactRequest,
  CreateSalesTaskRequest,
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
  PilotEvaluation,
  ProposalDraft,
  SaveDealClaimRequest,
  SaveDealContactRoleRequest,
  SalesTask,
  TodayResponse,
  UpdateCompanyRequest,
  UpdateContactRequest,
  UpdateSalesTaskRequest,
  CreateDraftRequest,
  CreateActivityRequest,
  CreateContactChannelRequest,
  UpdateContactChannelRequest,
  UpdateDraftRequest,
  MoveDealRequest,
  CreateDealRequest,
  UpdateDealRequest,
} from '@oculus-business/contracts'

import { BusinessFailure } from '../domain/errors'
import { ensureCapability, ROUTE_POLICY } from './permissions'
import {
  assertCommercialTouchAllowed,
  assertDraftSendable,
  assertTaskAllowed,
  draftContentHash,
  evaluateTransition,
  nextActionFromOpenTasks,
  normalizeDomain,
  normalizeRecipient,
  pilotActivationBlockers,
} from '../domain/sales-rules'
import type { Clock } from './ports'
import type { SalesRepository } from './sales-ports'

/// Сценарии B2B-продаж: компании/контакты/взаимодействия/задачи, единый переход стадий,
/// черновики, пилоты, запуск, подписка и поступления, права агента и идемпотентность.
export type ActorContext = {
  userId: string
  role: 'user' | 'admin' | 'agent'
  runId: string | null
  idempotencyKey: string | null
}

type SalesServiceOptions = {
  clock: Clock
  repository: SalesRepository
  notifier?: { notify(message: string): Promise<void> }
}

const CAP = {
  financeConfirm: 'finance.confirm',
  wonConfirm: 'won.confirm',
  dealDelete: 'deal.delete',
  subscriptionManage: 'subscription.manage',
  pricingChange: 'pricing.change',
  claimConfirm: 'claim.confirm',
  draftApprove: 'draft.approve',
  pilotDecide: 'pilot.decide',
  caseAllow: 'case.allow',
} as const

function requestHashOf(payload: unknown): string {
  return Bun.hash(JSON.stringify(payload ?? null)).toString(36)
}

export class SalesService {
  private readonly clock: Clock
  private readonly repository: SalesRepository
  private readonly notifier: { notify(message: string): Promise<void> } | undefined

  constructor({ clock, repository, notifier }: SalesServiceOptions) {
    this.clock = clock
    this.repository = repository
    this.notifier = notifier
  }

  /// Права агента проверяются на сервере (FIX-01): единая политика permissions.ts,
  /// отказ — объяснимый 403. Права читаются из БД на каждую чувствительную операцию,
  /// поэтому отзыв действует сразу после коммита изменения agentPermissions.
  private async assertCapability(
    actor: ActorContext,
    capability: string,
    operation: string,
    adminOnly = false,
  ): Promise<void> {
    if (actor.role === 'user' && !adminOnly) return
    const user = await this.repository.getUserForAgentCheck(actor.userId)
    const principal = {
      userId: actor.userId,
      role: actor.role,
      agentPermissions: Array.isArray(user?.agentPermissions)
        ? (user?.agentPermissions as string[])
        : user?.role === actor.role
          ? []
          : null,
    }
    try {
      ensureCapability(principal, capability as never, { adminOnly })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'отказано'
      await this.logAgentOp(actor, operation, null, false, message)
      throw error
    }
  }

  /// FIX-01-AC03: действие только для человека (user/admin); агенту — объяснимый 403.
  private assertHumanOnly(actor: ActorContext, operation: string): void {
    if (this.isAgent(actor)) {
      void this.logAgentOp(actor, operation, null, false, 'только человек')
      throw new BusinessFailure('forbidden', 'Действие доступно только уполномоченному человеку — агентский доступ его не включает')
    }
  }
  private isAgent(actor: ActorContext): boolean {
    return actor.role === 'agent'
  }

  private async logAgentOp(
    actor: ActorContext,
    operation: string,
    entityId: string | null,
    ok: boolean,
    error: string | null,
  ): Promise<void> {
    if (actor.role !== 'agent' && actor.runId === null) return
    await this.repository.logAgentOp({
      actorId: actor.userId,
      runId: actor.runId,
      operation,
      entityId,
      ok,
      error,
    })
  }

  /// Атомарная идемпотентность (FIX-03): резерв ключа → операция → фиксация результата.
  /// Параллельные повторы одного ключа дают один результат; чужая нагрузка — 409;
  /// сбой освобождает резерв; зависший резерв старше 60 с перехватывается повтором.
  private async withIdempotency<T>(
    actor: ActorContext,
    operation: string,
    payload: unknown,
    run: () => Promise<T>,
  ): Promise<T> {
    if (actor.idempotencyKey === null) return run()
    const requestHash = requestHashOf(payload)
    const reserve = await this.repository.reserveIdempotency(
      actor.userId,
      operation,
      actor.idempotencyKey,
      requestHash,
    )
    if (reserve.kind === 'completed') {
      if (reserve.requestHash !== requestHash) {
        throw new BusinessFailure(
          'conflict',
          'Идемпотентный ключ уже использован с другой нагрузкой (operationId: ' +
            actor.idempotencyKey +
            ')',
        )
      }
      return reserve.result as T
    }
    if (reserve.kind === 'in_progress') {
      throw new BusinessFailure(
        'conflict',
        'Операция с этим Idempotency-Key уже выполняется — результат будет доступен по operationId; повторите запрос позже',
      )
    }
    try {
      const result = await run()
      // V2-R03: попытаться зафиксировать результат; при сбое фиксации НЕ освобождать
      // резерв — мутация уже выполнена, и повтор без резерва создал бы дубль.
      try {
        await this.repository.completeIdempotency(
          actor.userId,
          operation,
          actor.idempotencyKey,
          requestHash,
          result,
        )
      } catch (completionError) {
        // Фиксация результата не удалась, но мутация уже в БД.
        // Помечаем резерв как «результат неизвестен»: повтор увидит completed
        // с маркером и вернёт структурированный unknown-результат, не дублируя мутацию.
        try {
          await this.repository.completeIdempotency(
            actor.userId,
            operation,
            actor.idempotencyKey,
            requestHash,
            { outcome: 'result_unknown', reason: 'completion failed after mutation' },
          )
        } catch {
          // Даже маркер не записался — резерв остаётся reserved; 60-секундный
          // takeover в reserveIdempotency предотвратит немедленный дубль.
        }
        // Клиент получает успех или управляемую ошибку; итог доступен по operationId.
        void completionError
      }
      return result
    } catch (error) {
      // Мутация НЕ выполнена — резерв можно снять, повтор корректен.
      await this.repository.releaseIdempotency(actor.userId, operation, actor.idempotencyKey)
      throw error
    }
  }

  /// OWNER-04-AC01 (R-13): ручная фиксация отправки — не доставка.
  /// Доставка подтверждается отдельным доказательством.
  async deliveredDraft(
    id: string,
    input: { deliveredAt?: string | undefined; proof: string },
    actor: ActorContext,
  ): Promise<ProposalDraft> {
    await this.assertCapability(actor, CAP.draftApprove, 'draft.delivered')
    const dto = await this.repository.findDraftDto(id)
    if (dto === null) throw new BusinessFailure('not_found', 'Черновик не найден')
    if (dto.status !== 'sent' && dto.status !== 'delivered') {
      throw new BusinessFailure('conflict', 'Доставку можно подтвердить только для зафиксированной отправки')
    }
    return this.repository.setDraftStatus(id, {
      status: 'delivered',
      deliveredAt: input.deliveredAt ? new Date(input.deliveredAt) : this.clock.now(),
      deliveryProof: input.proof,
    }, undefined)
  }

  /// FIX-04-AC03: явное сторнирование связанного поступления с основанием и правом.
  async reverseReceipt(
    paymentId: string,
    txnId: string,
    input: { reason: string; reversalDate?: string | undefined },
    actor: ActorContext,
  ) {
    await this.assertCapability(actor, CAP.financeConfirm, 'receipt.reverse')
    const reversalDate = input.reversalDate ?? this.clock.now().toISOString().slice(0, 10)
    const result = await this.repository.reverseReceipt({
      paymentId,
      txnId,
      reason: input.reason,
      reversalDate,
      actorId: actor.userId,
    })
    await this.logAgentOp(actor, 'receipt.reverse', paymentId, true, null)
    return result
  }

  // --------------------------------------------------- Факты исследования (AGENT-03)

  async companyFacts(companyId: string) {
    return { items: await this.repository.listCompanyFacts(companyId) }
  }

  async addCompanyFact(
    companyId: string,
    input: CreateCompanyFactRequest,
    actor: ActorContext,
  ): Promise<CompanyFact> {
    if (this.isAgent(actor) && (input.status ?? 'hypothesis') === 'customer_confirmed') {
      const message = 'Агент не может фиксировать статус customer_confirmed — только человек'
      await this.logAgentOp(actor, 'company.fact.create', companyId, false, message)
      throw new BusinessFailure('forbidden', message)
    }
    const fact = await this.repository.createCompanyFact(companyId, input, actor.userId)
    await this.logAgentOp(actor, 'company.fact.create', fact.id, true, null)
    return fact
  }

  // --------------------------------------------------- Партнёры (OWNER-05)

  async partnerAgreement(dealId: string) {
    return { partner: await this.repository.findPartnerAgreement(dealId) }
  }

  async upsertPartnerAgreement(
    dealId: string,
    input: PartnerAgreementUpsertRequest,
    actor: ActorContext,
  ): Promise<PartnerAgreement> {
    const deal = await this.repository.findDealInternal(dealId)
    if (deal === null) throw new BusinessFailure('not_found', 'Сделка не найдена')
    await this.repository.setDealPartner(dealId, input.partnerCompanyId)
    const partner = await this.repository.upsertPartnerAgreement(dealId, input)
    await this.logAgentOp(actor, 'partner.upsert', dealId, true, null)
    return partner
  }

  // --------------------------------------------------- Экспорт и часовой пояс

  async exportCompanies() {
    return this.repository.exportCompanies()
  }

  async workspaceTimezone(): Promise<string> {
    return this.repository.getTimezone()
  }

  /// Итог операции по operationId после потери ответа (FIX-03-AC03).
  async idempotencyResult(actor: ActorContext, operation: string, key: string) {
    const record = await this.repository.findIdempotencyRecord(actor.userId, operation, key)
    if (record === null) return { found: false as const }
    return {
      found: true as const,
      requestHash: record.requestHash,
      result: record.result,
      completed: true,
    }
  }

  // ------------------------------------------------------------- Участники

  async businessUsers() {
    return this.repository.listBusinessUsers()
  }

  /// FIX-01: серверная проверка прав по единой таблице маршрутов (ROUTE_POLICY).
  /// Вызывается транспортом для каждого изменяющего маршрута; агент получает 403
  /// с объяснением, человек — проходит (или 403 для admin-only действий).
  async assertRouteAllowed(
    actor: ActorContext,
    area: string,
    method: string,
  ): Promise<void> {
    const rule = ROUTE_POLICY.find((entry) => entry.area === area && entry.method === method)
    if (rule === undefined || rule.agentAccess === 'any') return
    if (actor.role === 'admin') return
    if (actor.role === 'user') {
      if (rule.agentAccess === 'admin') {
        throw new BusinessFailure('forbidden', 'Действие доступно только администратору')
      }
      return
    }
    if (rule.agentAccess === 'human' || rule.agentAccess === 'admin') {
      const message =
        'Действие доступно только уполномоченному человеку — агентский доступ его не включает'
      await this.logAgentOp(actor, area + '.' + method.toLowerCase(), null, false, message)
      throw new BusinessFailure('forbidden', message)
    }
    await this.assertCapability(actor, rule.agentAccess, area + '.' + method.toLowerCase())
  }

  // ------------------------------------------------------------- Компании (CRM-01)

  async companies(query: CompaniesQuery) {
    return this.repository.listCompanies(query)
  }

  async company(id: string): Promise<Company> {
    const company = await this.repository.findCompanyDto(id)
    if (company === null) throw new BusinessFailure('not_found', 'Контрагент не найден')
    return company
  }

  async companyEvents(companyId: string) {
    return { items: await this.repository.listCompanyEvents(companyId) }
  }

  async createCompany(input: CreateCompanyRequest, actor: ActorContext): Promise<Company> {
    const created = await this.withIdempotency(actor, 'company.create', input, async () => {
      const domain = input.website ? normalizeDomain(input.website) : null
      if (domain !== null && input.allowDomainDuplicate !== true) {
        // Домен — сигнал дубля (CRM-01). Разные проверенные ИНН = разные юрлица группы,
        // создаём без вопросов; если ИНН не отличает записи — требуем явного подтверждения.
        const existing = await this.repository.listCompanies({ limit: 200, offset: 0 })
        const sameDomain = existing.items.find((item) => {
          if (item.domain !== domain) return false
          const differentLegalEntities =
            input.inn !== null && input.inn !== undefined && item.inn !== null && item.inn !== input.inn
          return !differentLegalEntities
        })
        if (sameDomain !== undefined) {
          throw new BusinessFailure(
            'conflict',
            `Домен ${domain} уже связан с «${sameDomain.name}». Если это другое юрлицо той же группы — подтвердите создание (allowDomainDuplicate), иначе выберите существующую компанию.`,
          )
        }
      }
      return this.repository.createCompany({ ...input, domain })
    })
    await this.logAgentOp(actor, 'company.create', created.id, true, null)
    return created
  }

  async updateCompany(id: string, input: UpdateCompanyRequest, actor: ActorContext): Promise<Company> {
    const updated = await this.withIdempotency(actor, 'company.update', { id, input }, async () => {
      if (input.relationStatus === 'excluded' && (input.exclusionReason ?? '').trim() === '') {
        throw new BusinessFailure('validation', 'Исключение компании требует причину')
      }
      // FIX-01-AC03: статус «исключена» меняет область DNC — решение человека.
      if (input.relationStatus !== undefined) {
        this.assertHumanOnly(actor, 'company.update.excluded')
      }
      const domain = input.website !== undefined && input.website !== null
        ? normalizeDomain(input.website)
        : undefined
      return this.repository.updateCompany(id, { ...input, domain })
    })
    await this.logAgentOp(actor, 'company.update', updated.id, true, null)
    return updated
  }

  async setCompanyDnc(
    id: string,
    input: { reason: string; scope: 'all' | 'commercial'; source: string | null },
    actor: ActorContext,
  ): Promise<Company> {
    // Установка запрета безопасна (сужает действия) и доступна агенту; снятие — нет.
    const company = await this.repository.setCompanyDnc(id, input, actor.userId, this.clock.now())
    // FIX-06-AC03: открытые коммерческие/сервисные задачи → к пересмотру; одобренные
    // черновики → on_hold с причиной.
    await this.repository.stopContinuationsForDnc(id, input.scope, input.reason)
    return company
  }

  async liftCompanyDnc(id: string, reason: string, actor: ActorContext): Promise<Company> {
    // FIX-01-AC03: агент не снимает запреты — только человек с новым основанием.
    this.assertHumanOnly(actor, 'company.dnc.lift')
    if (reason.trim().length < 3) {
      throw new BusinessFailure('validation', 'Снятие запрета требует явного нового основания')
    }
    return this.repository.liftCompanyDnc(id, reason, actor.userId, this.clock.now())
  }

  // ------------------------------------------------------------- Контакты (CRM-02)

  async contacts(companyId: string) {
    return { items: await this.repository.listContacts(companyId) }
  }

  async createContact(input: CreateContactRequest, actor: ActorContext): Promise<Contact> {
    // V2-R05: чувствительные поля блокируются при создании тоже, не только при update.
    if (this.isAgent(actor)) {
      if (input.status === 'confirmed' || input.directRoleConfirmed === true) {
        const message =
          'Агент не может создавать контакты с подтверждённым статусом или подтверждённой ролью — только человек'
        await this.logAgentOp(actor, 'contact.create', null, false, message)
        throw new BusinessFailure('forbidden', message)
      }
      for (const channel of input.channels ?? []) {
        if (channel.status === 'confirmed') {
          const message = 'Агент не может создавать каналы с подтверждённым статусом'
          await this.logAgentOp(actor, 'contact.create', null, false, message)
          throw new BusinessFailure('forbidden', message)
        }
      }
    }
    const created = await this.withIdempotency(actor, 'contact.create', input, () =>
      this.repository.createContact(input),
    )
    await this.logAgentOp(actor, 'contact.create', created.id, true, null)
    return created
  }

  async updateContact(id: string, input: UpdateContactRequest, actor: ActorContext): Promise<Contact> {
    if (this.isAgent(actor) && input.status === 'confirmed') {
      await this.assertCapability(actor, CAP.claimConfirm, 'contact.update')
    }
    return this.repository.updateContact(id, input)
  }

  async setContactDnc(
    id: string,
    input: { reason: string; scope: 'all' | 'commercial'; source: string | null },
    actor: ActorContext,
  ): Promise<Contact> {
    const contact = await this.repository.setContactDnc(id, input, actor.userId, this.clock.now())
    await this.repository.stopContinuationsForContactDnc(id, input.scope, input.reason)
    return contact
  }

  async liftContactDnc(id: string, reason: string, actor: ActorContext): Promise<Contact> {
    this.assertHumanOnly(actor, 'contact.dnc.lift')
    if (reason.trim().length < 3) {
      throw new BusinessFailure('validation', 'Снятие запрета требует явного нового основания')
    }
    return this.repository.liftContactDnc(id, reason, actor.userId, this.clock.now())
  }

  async createChannel(contactId: string, input: CreateContactChannelRequest, actor: ActorContext) {
    if (this.isAgent(actor) && input.status === 'confirmed') {
      await this.assertCapability(actor, CAP.claimConfirm, 'channel.create')
    }
    return this.repository.createChannel(contactId, input)
  }

  async updateChannel(id: string, input: UpdateContactChannelRequest, actor: ActorContext) {
    if (this.isAgent(actor) && input.status === 'confirmed') {
      await this.assertCapability(actor, CAP.claimConfirm, 'channel.update')
    }
    return this.repository.updateChannel(id, input)
  }

  // ------------------------------------------------------------- Сделка: детали и квалификация (CRM-05)

  async dealDetail(id: string): Promise<DealDetail> {
    const deal = await this.repository.getDealDetail(id)
    if (deal === null) throw new BusinessFailure('not_found', 'Сделка не найдена')
    return deal
  }

  async dealClaims(dealId: string): Promise<DealClaim[]> {
    return this.repository.listDealClaims(dealId)
  }

  async saveDealClaim(dealId: string, input: SaveDealClaimRequest, actor: ActorContext): Promise<DealClaim> {
    if (
      this.isAgent(actor) &&
      (input.status === 'customer_confirmed' || input.status === 'tested')
    ) {
      // Факт клиента не подтверждается одним выводом модели (§8.6).
      await this.assertCapability(actor, CAP.claimConfirm, 'deal.claim.save')
    }
    // FIX-02-AC02: подтверждение требует основания — кто, когда и на чём подтвердил.
    if (
      (input.status === 'customer_confirmed' || input.status === 'tested') &&
      (input.source ?? '').trim() === '' &&
      (input.sourceActivityId ?? null) === null
    ) {
      throw new BusinessFailure(
        'validation',
        'Подтверждённый статус требует источник: ссылку на взаимодействие (sourceActivityId) или описание основания (source)',
      )
    }
    const claim = await this.repository.upsertDealClaim(dealId, input, actor.userId)
    await this.logAgentOp(actor, 'deal.claim.save', claim.id, true, null)
    return claim
  }

  async dealContactRoles(dealId: string): Promise<DealContactRole[]> {
    return this.repository.listDealContactRoles(dealId)
  }

  async saveDealContactRole(
    dealId: string,
    input: SaveDealContactRoleRequest,
    actor: ActorContext,
  ): Promise<DealContactRole> {
    if (this.isAgent(actor) && (input.confirmed ?? false)) {
      await this.assertCapability(actor, CAP.claimConfirm, 'deal.role.save')
    }
    return this.repository.upsertDealContactRole(dealId, input)
  }

  async deleteDealContactRole(id: string): Promise<void> {
    await this.repository.deleteDealContactRole(id)
  }

  /// PATCH сделки: квалификация и обычные поля. stageId проходит через единый переход;
  /// при смене этапа поля и переход применяются одной транзакцией (§8.2).
  async updateDeal(id: string, input: UpdateDealRequest, actor: ActorContext): Promise<Deal> {
    const internal = await this.repository.findDealInternal(id)
    if (internal === null) throw new BusinessFailure('not_found', 'Сделка не найдена')
    if (this.isAgent(actor)) {
      const priceTouched =
        input.oneTimeAmount !== undefined || input.monthlyAmount !== undefined || input.priceAnchor !== undefined
      if (priceTouched) {
        const drafts = await this.repository.listDrafts({ dealId: id, limit: 200, offset: 0 })
        const approvedExists = drafts.items.some(
          (draft) => draft.status === 'approved' || draft.status === 'sent',
        )
        if (approvedExists) {
          await this.assertCapability(actor, CAP.pricingChange, 'deal.update')
        }
      }
    }
    const { stageId, expectedVersion, lostReason, ...rest } = input
    void expectedVersion
    const data = this.dealFieldPatch(rest)
    if (lostReason !== undefined) data.lostReason = lostReason ?? null
    if (stageId !== undefined && stageId !== null && stageId !== internal.stageId) {
      // Единая транзакция: поля + переход + история; при отклонённом переходе поля не сохраняются.
      return this.transition(
        id,
        {
          stageId,
          position: 10_000,
          reason: typeof lostReason === 'string' ? lostReason : null,
          overrideReason: null,
        },
        actor,
        input.expectedVersion,
        data,
      )
    }
    const deal = await this.repository.updateDealFields(id, data, input.expectedVersion)
    await this.logAgentOp(actor, 'deal.update', deal.id, true, null)
    return deal
  }

  private dealFieldPatch(rest: Partial<UpdateDealRequest>): Record<string, unknown> {
    const columnMap: Array<[keyof UpdateDealRequest, string]> = [
      ['title', 'title'],
      ['contactName', 'contactName'],
      ['contactPhone', 'contactPhone'],
      ['contactTelegram', 'contactTelegram'],
      ['source', 'source'],
      ['oneTimeAmount', 'oneTimeAmount'],
      ['monthlyAmount', 'monthlyAmount'],
      ['note', 'note'],
      ['nextAction', 'nextAction'],
      ['ownerId', 'ownerId'],
      ['direction', 'direction'],
      ['scenario', 'scenario'],
      ['currentProcess', 'currentProcess'],
      ['problemStatement', 'problemStatement'],
      ['consequences', 'consequences'],
      ['baseline', 'baseline'],
      ['measurementMethod', 'measurementMethod'],
      ['assumptions', 'assumptions'],
      ['desiredOutcome', 'desiredOutcome'],
      ['priority', 'priority'],
      ['priorityEvent', 'priorityEvent'],
      ['economicBuyerStatus', 'economicBuyerStatus'],
      ['selectionCriteria', 'selectionCriteria'],
      ['decisionProcess', 'decisionProcess'],
      ['techConstraints', 'techConstraints'],
      ['priceReaction', 'priceReaction'],
      ['nextAgreedStep', 'nextAgreedStep'],
      ['pausedReason', 'pausedReason'],
      ['resumeCondition', 'resumeCondition'],
      ['wonBasis', 'wonBasis'],
    ]
    const data: Record<string, unknown> = {}
    for (const [key, column] of columnMap) {
      if (key in rest) {
        ;(data as Record<string, unknown>)[column] = (rest as Record<string, unknown>)[key] ?? null
      }
    }
    if ('nextActionAt' in rest && rest.nextActionAt !== undefined) {
      data.nextActionAt = rest.nextActionAt ? new Date(`${rest.nextActionAt}T00:00:00.000Z`) : null
    }
    if ('priceAnchor' in rest && rest.priceAnchor !== undefined) {
      data.priceAnchor = rest.priceAnchor
    }
    if ('resumeOn' in rest && rest.resumeOn !== undefined) {
      data.resumeOn = rest.resumeOn ? new Date(`${rest.resumeOn}T00:00:00.000Z`) : null
    }
    if ('signedAt' in rest && rest.signedAt !== undefined) {
      data.signedAt = rest.signedAt ? new Date(`${rest.signedAt}T00:00:00.000Z`) : null
    }
    if ('implementationStartPlan' in rest && rest.implementationStartPlan !== undefined) {
      data.implementationStartPlan = rest.implementationStartPlan
        ? new Date(`${rest.implementationStartPlan}T00:00:00.000Z`)
        : null
    }
    if ('implementationStartFact' in rest && rest.implementationStartFact !== undefined) {
      data.implementationStartFact = rest.implementationStartFact
        ? new Date(`${rest.implementationStartFact}T00:00:00.000Z`)
        : null
    }
    if ('companyId' in rest) {
      data.companyId = rest.companyId ?? null
    }
    return data
  }

  // ------------------------------------------------------------- Единый переход (CRM-06)

  async createDeal(input: CreateDealRequest, actor: ActorContext): Promise<Deal> {
    const stages = await this.repository.listStagesLight()
    const defaultStageId = stages.length > 0 ? stages[0].id : null
    const stageId = input.stageId ?? defaultStageId
    if (stageId === undefined || stageId === null) {
      throw new BusinessFailure('conflict', 'Сначала создайте хотя бы один этап воронки')
    }
    // FIX-02-AC01: создание применяет те же правила перехода, что PATCH stageId и move.
    // У новой сделки нет утверждений/ролей/КП, поэтому этапы, требующие квалификации
    // (qualified/proposal/contract/won), недостижимы при создании без override человеком.
    const targetStage = stages.find((stage) => stage.id === stageId)
    if (targetStage === undefined) {
      throw new BusinessFailure('not_found', 'Этап не найден')
    }
    const emptyDeal = {
      id: '',
      stageId: '',
      lostReason: input.lostReason ?? null,
      pausedReason: null,
      resumeCondition: null,
      resumeOn: null,
      wonAt: null,
      wonBasis: input.wonBasis ?? null,
    }
    const violations = evaluateTransition({
      deal: emptyDeal as never,
      fromStage: targetStage,
      toStage: targetStage,
      lostReasonInRequest: input.lostReason ?? null,
      overrideReason: input.overrideReason ?? null,
      claims: [],
      hasProcessOwnerRole: false,
      hasApprovedOrSentDraft: false,
      actorIsAgent: this.isAgent(actor),
    })
    const blocking = violations.filter((violation) => violation.rule !== 'lost.reason')
    if (blocking.length > 0) {
      const message = blocking.map((violation) => violation.message).join('; ')
      // FIX-01-AC02: агенту — объяснимый 403, человеку — 400 с причиной нарушенных условий.
      await this.logAgentOp(actor, 'deal.create', null, false, message)
      throw new BusinessFailure(
        this.isAgent(actor) ? 'forbidden' : 'validation',
        `Создание сразу на этапе «${targetStage.title}» невозможно: ${message}. Создайте сделку в начале воронки и пройдите переходы.`,
      )
    }
    if (violations.length > 0) {
      const message = violations.map((violation) => violation.message).join('; ')
      throw new BusinessFailure('validation', `Создание отклонено: ${message}`)
    }
    if (this.isAgent(actor) && (input.overrideReason ?? '').trim() !== '') {
      const message = 'Агент не может обходить обязательные условия при создании сделки'
      await this.logAgentOp(actor, 'deal.create', null, false, message)
      throw new BusinessFailure('forbidden', message)
    }
    const created = await this.withIdempotency(actor, 'deal.create', input, async () =>
      this.repository.createDealWithInitialEntry(
        {
          title: input.title,
          contactName: input.contactName ?? null,
          contactPhone: input.contactPhone ?? null,
          contactTelegram: input.contactTelegram ?? null,
          source: input.source ?? null,
          oneTimeAmount: input.oneTimeAmount,
          monthlyAmount: input.monthlyAmount,
          note: input.note ?? null,
          nextActionAt: input.nextActionAt ? new Date(`${input.nextActionAt}T00:00:00.000Z`) : null,
          nextAction: input.nextAction ?? null,
          lostReason: input.lostReason ?? null,
          companyId: input.companyId ?? null,
          ownerId: input.ownerId ?? actor.userId,
          wonAt: targetStage.isWon ? this.clock.now() : null,
          wonById: targetStage.isWon ? actor.userId : null,
        },
        actor.userId,
        stageId,
        { toStageId: stageId, actorId: actor.userId, actorKind: this.actorKind(actor) },
      ),
    )
    await this.logAgentOp(actor, 'deal.create', created.id, true, null)
    void this.notifier
      ?.notify('🆕 Новая сделка: ' + created.title)
      .catch(() => undefined)
    return created
  }

  async deleteDeal(id: string, actor: ActorContext): Promise<void> {
    await this.assertCapability(actor, CAP.dealDelete, 'deal.delete')
    const internal = await this.repository.findDealInternal(id)
    if (internal === null) throw new BusinessFailure('not_found', 'Сделка не найдена')
    await this.repository.deleteDealBySales(id)
    await this.logAgentOp(actor, 'deal.delete', id, true, null)
  }

  /// Единая серверная операция перехода для create/PATCH stageId/move (§8.2).
  async transition(
    dealId: string,
    input: { stageId: string; position: number; reason?: string | null; overrideReason?: string | null },
    actor: ActorContext,
    expectedVersion?: number,
    extraDealData?: Record<string, unknown>,
  ): Promise<Deal> {
    return this.withIdempotency(actor, 'deal.transition', { dealId, ...input }, async () => {
      const internal = await this.repository.findDealInternal(dealId)
      if (internal === null) throw new BusinessFailure('not_found', 'Сделка не найдена')
      if (expectedVersion !== undefined && expectedVersion !== internal.version) {
        throw new BusinessFailure('conflict', 'Сделка изменена другим пользователем — обновите и повторите')
      }
      // Тот же этап — только порядок, без события истории (идемпотентность без потери реальной истории).
      if (internal.stageId === input.stageId) {
        return this.repository.transitionDealTx({
          dealId,
          toStageId: input.stageId,
          position: input.position,
          history: {
            fromStageId: internal.stageId,
            fromStageTitle: internal.stage.title,
            toStageId: input.stageId,
            toStageTitle: internal.stage.title,
            event: 'moved',
            actorKind: this.actorKind(actor),
            actorId: actor.userId,
            reason: input.reason ?? null,
            overrideReason: input.overrideReason ?? null,
            idempotencyKey: null,
            monthlyAmountSnapshot: internal.monthlyAmount,
          },
          dealSideEffects: {},
        })
      }
      const stages = await this.repository.listStagesLight()
      const toStage = stages.find((stage) => stage.id === input.stageId)
      if (toStage === undefined) throw new BusinessFailure('not_found', 'Этап не найден')
      const claims = await this.repository.listDealClaims(dealId)
      const roles = await this.repository.listDealContactRoles(dealId)
      const drafts = await this.repository.listDrafts({ dealId, limit: 200, offset: 0 })
      // Override обязательных условий — только уполномоченный человек (§6, §8.6): агенту запрещён.
      if (this.isAgent(actor) && (input.overrideReason ?? '').trim() !== '') {
        const message = 'Агент не может обходить обязательные условия перехода'
        await this.logAgentOp(actor, 'deal.transition', dealId, false, message)
        throw new BusinessFailure('forbidden', message)
      }
      const violations = evaluateTransition({
        deal: internal,
        fromStage: internal.stage,
        toStage,
        reason: input.reason ?? null,
        lostReasonInRequest: input.reason ?? null,
        overrideReason: input.overrideReason ?? null,
        claims,
        hasProcessOwnerRole: roles.some((role) => role.role === 'process_owner'),
        hasApprovedOrSentDraft: drafts.items.some(
          (draft) => draft.status === 'approved' || draft.status === 'sent',
        ),
        actorIsAgent: this.isAgent(actor),
      })
      if (violations.length > 0) {
        const message = violations.map((violation) => violation.message).join('; ')
        await this.logAgentOp(actor, 'deal.transition', dealId, false, message)
        throw new BusinessFailure('validation', `Переход отклонён: ${message}`)
      }
      if (toStage.isWon || toStage.semanticType === 'won') {
        await this.assertCapability(actor, CAP.wonConfirm, 'deal.transition.won')
      }
      const dealSideEffects: Record<string, unknown> = { ...(extraDealData ?? {}) }
      if (toStage.isWon || toStage.semanticType === 'won') {
        dealSideEffects.wonAt = this.clock.now()
        dealSideEffects.wonById = actor.userId
      }
      const deal = await this.repository.transitionDealTx({
        dealId,
        toStageId: toStage.id,
        position: input.position,
        history: {
          fromStageId: internal.stageId,
          fromStageTitle: internal.stage.title,
          toStageId: toStage.id,
          toStageTitle: toStage.title,
          event: 'moved',
          actorKind: this.actorKind(actor),
          actorId: actor.userId,
          reason: input.reason ?? null,
          overrideReason: input.overrideReason ?? null,
          idempotencyKey: actor.idempotencyKey,
          monthlyAmountSnapshot: internal.monthlyAmount,
        },
        dealSideEffects,
      })
      if (toStage.isWon) {
        void this.notifier
          ?.notify(
            '🎉 Сделка выиграна: ' + deal.title +
              (deal.monthlyAmount > 0 ? ' (+' + deal.monthlyAmount + ' ₽/мес)' : ''),
          )
          .catch(() => undefined)
      }
      await this.logAgentOp(actor, 'deal.transition', dealId, true, null)
      return deal
    })
  }

  private actorKind(actor: ActorContext): 'human' | 'agent' {
    return this.isAgent(actor) ? 'agent' : 'human'
  }

  // ------------------------------------------------------------- Активности и задачи (CRM-03)

  async createActivity(input: CreateActivityRequest, actor: ActorContext): Promise<Activity> {
    const activity = await this.withIdempotency(actor, 'activity.create', input, async () => {
      const deal =
        input.dealId !== undefined && input.dealId !== null
          ? await this.repository.findDealInternal(input.dealId)
          : null
      if (deal !== null && deal.companyId !== null && input.companyId !== deal.companyId) {
        throw new BusinessFailure('validation', 'Сделка принадлежит другой компании')
      }
      if (input.direction === 'inbound') {
        // Ответ клиента отменяет запланированные шаблонные продолжения до разбора (§8.5).
        await this.repository.markTemplatedTasksNeedsReview(input.companyId)
      }
      return this.repository.createActivity(input, actor.userId)
    })
    await this.logAgentOp(actor, 'activity.create', activity.id, true, null)
    return activity
  }

  async activities(query: {
    companyId?: string | undefined
    dealId?: string | undefined
    direction?: 'inbound' | 'outbound' | undefined
    unprocessedOnly?: boolean | undefined
    limit: number
    offset: number
  }) {
    return this.repository.listActivities(query)
  }

  async markActivityProcessed(id: string, actor: ActorContext): Promise<void> {
    await this.repository.markActivityProcessed(id, this.clock.now())
    await this.logAgentOp(actor, 'activity.processed', id, true, null)
  }

  async createTask(input: CreateSalesTaskRequest, actor: ActorContext): Promise<SalesTask> {
    const task = await this.withIdempotency(actor, 'task.create', input, async () => {
      const contact = input.contactId !== undefined && input.contactId !== null
        ? await this.repository.findContactDto(input.contactId)
        : null
      // FIX-06-AC03: задача только с dealId больше не 500 — компания выводится из сделки.
      let companyId = input.companyId ?? null
      if (companyId === null && input.dealId !== undefined && input.dealId !== null) {
        const deal = await this.repository.findDealInternal(input.dealId)
        if (deal === null) throw new BusinessFailure('not_found', 'Сделка не найдена')
        companyId = deal.companyId
      }
      const company = companyId === null ? null : await this.repository.findCompanyDto(companyId)
      if (companyId !== null && company === null) {
        throw new BusinessFailure('not_found', 'Компания не найдена')
      }
      if (input.contactId !== undefined && input.contactId !== null && contact === null) {
        throw new BusinessFailure('not_found', 'Контакт не найден')
      }
      if (contact !== null && contact.companyId !== companyId) {
        throw new BusinessFailure('validation', 'Контакт принадлежит другой компании')
      }
      // FIX-06-AC02: область действия DNC зависит от назначения задачи.
      const kind = input.kind ?? 'commercial'
      assertTaskAllowed({
        company: company === null
          ? null
          : { doNotContact: company.doNotContact, dncScope: company.dncScope, dncReason: company.dncReason },
        contact: contact === null
          ? null
          : { doNotContact: contact.doNotContact, dncScope: contact.dncScope, dncReason: contact.dncReason },
        kind,
      })
      if (kind !== 'commercial' && input.templated === true) {
        throw new BusinessFailure('validation', 'Шаблонным может быть только коммерческая задача')
      }
      return this.repository.createSalesTask({ ...input, kind, companyId }, actor.userId)
    })
    if (input.dealId !== undefined && input.dealId !== null) {
      await this.syncDealNextAction(input.dealId)
    }
    await this.logAgentOp(actor, 'task.create', task.id, true, null)
    return task
  }

  async updateTask(id: string, input: UpdateSalesTaskRequest, actor: ActorContext): Promise<SalesTask> {
    const task = await this.repository.updateSalesTask(id, input, actor.userId)
    if (task.dealId !== null) await this.syncDealNextAction(task.dealId)
    return task
  }

  async tasks(query: {
    status?: 'open' | 'done' | 'cancelled' | undefined
    assigneeId?: string | undefined
    companyId?: string | undefined
    dealId?: string | undefined
    dueBefore?: string | undefined
    limit: number
    offset: number
  }) {
    return this.repository.listSalesTasks(query)
  }

  /// Сводка nextAction не расходится с ближайшей открытой задачей (§5 ТЗ).
  private async syncDealNextAction(dealId: string): Promise<void> {
    const open = await this.repository.listOpenTasksForDeal(dealId)
    // Срок может быть неизвестен (FIX-07-AC04): сводку строит ближайшая датированная задача.
    const dated = open.filter((task) => task.dueAt !== null)
    const summary = nextActionFromOpenTasks(
      dated.map((task) => ({
        goal: task.goal,
        action: task.action,
        dueAt: (task.dueAt as Date).toISOString(),
        status: task.status,
      })),
    )
    await this.repository.setDealNextActionSummary(dealId, summary)
  }

  async today(): Promise<TodayResponse> {
    return this.repository.today(this.clock.now())
  }

  // ------------------------------------------------------------- Черновики (CRM-10)

  async createDraft(input: CreateDraftRequest, actor: ActorContext): Promise<ProposalDraft> {
    const draft = await this.withIdempotency(actor, 'draft.create', input, async () => {
      const company = await this.repository.findCompanyDto(input.companyId)
      if (company === null) throw new BusinessFailure('not_found', 'Компания не найдена')
      // Отбор черновиков тоже проверяет действующие запреты (CRM-04).
      const contact = input.contactId !== undefined && input.contactId !== null
        ? await this.repository.findContactDto(input.contactId)
        : null
      if (contact !== null && contact.companyId !== input.companyId) {
        throw new BusinessFailure('validation', 'Контакт принадлежит другой компании')
      }
      // FIX-06-AC01: фактический нормализованный получатель сверяется с каналами:
      // нельзя указать contactId незапрещённого B, если адрес принадлежит контакту A.
      const normalized = normalizeRecipient(input.channel, input.recipient)
      const recipientOwner = await this.repository.findChannelInCompany(
        input.companyId,
        input.channel,
        normalized,
      )
      if (recipientOwner !== null && contact !== null && recipientOwner.contactId !== contact.id) {
        throw new BusinessFailure(
          'validation',
          'Получатель принадлежит другому контакту компании — исправьте contactId или адресата',
        )
      }
      const ownerContact = recipientOwner !== null
        ? await this.repository.findContactDto(recipientOwner.contactId)
        : null
      const contactForDnc = contact ?? ownerContact
      assertCommercialTouchAllowed({
        company: { doNotContact: company.doNotContact, dncScope: company.dncScope, dncReason: company.dncReason },
        contact: contactForDnc === null
          ? null
          : { doNotContact: contactForDnc.doNotContact, dncScope: contactForDnc.dncScope, dncReason: contactForDnc.dncReason },
        kind: 'draft',
      })
      if (input.dealId !== undefined && input.dealId !== null) {
        const deal = await this.repository.findDealInternal(input.dealId)
        if (deal === null) throw new BusinessFailure('not_found', 'Сделка не найдена')
        if (deal.companyId !== null && deal.companyId !== input.companyId) {
          throw new BusinessFailure('validation', 'Сделка принадлежит другой компании')
        }
      }
      return this.repository.createDraft(input, actor.userId)
    })
    await this.logAgentOp(actor, 'draft.create', draft.id, true, null)
    return draft
  }

  async drafts(query: {
    status?: string | undefined
    companyId?: string | undefined
    dealId?: string | undefined
    limit: number
    offset: number
  }) {
    return this.repository.listDrafts(query)
  }

  async draftVersions(groupId: string) {
    const items = await this.repository.listDraftVersions(groupId)
    return { items, total: items.length }
  }

  /// Редактирование: черновик/reviewed меняется на месте (правка сбрасывает статусы review);
  /// одобренная/отправленная версия неизменяема — правка создаёт новую версию (CRM-10-AC01/AC05).
  async updateDraft(id: string, input: UpdateDraftRequest, actor: ActorContext): Promise<ProposalDraft> {
    const internal = await this.repository.findDraftInternal(id)
    if (internal === null) throw new BusinessFailure('not_found', 'Черновик не найден')
    if (input.expectedVersion !== undefined && input.expectedVersion !== internal.rowVersion) {
      throw new BusinessFailure('conflict', 'Черновик изменён другим пользователем — обновите и повторите')
    }
    if (internal.status === 'approved' || internal.status === 'sent' || internal.status === 'cancelled') {
      const changes: Record<string, unknown> = {}
      if (input.recipient !== undefined) changes.recipient = input.recipient
      if (input.channel !== undefined) changes.channel = input.channel
      if (input.subject !== undefined) changes.subject = input.subject ?? null
      if (input.body !== undefined) changes.body = input.body
      if (input.terms !== undefined) changes.terms = input.terms ?? undefined
      if (input.dealId !== undefined) changes.dealId = input.dealId
      if (input.contactId !== undefined) changes.contactId = input.contactId
      if (input.productClaimsVersion !== undefined) changes.productClaimsVersion = input.productClaimsVersion
      const previous = await this.repository.findDraftDto(id)
      if (previous === null) throw new BusinessFailure('not_found', 'Черновик не найден')
      const newVersion = await this.repository.createDraftNewVersion(id, changes)
      await this.logAgentOp(actor, 'draft.new-version', newVersion.id, true, null)
      return newVersion
    }
    const data: Record<string, unknown> = {}
    if (input.recipient !== undefined) data.recipient = input.recipient
    if (input.channel !== undefined) data.channel = input.channel
    if (input.subject !== undefined) data.subject = input.subject ?? null
    if (input.body !== undefined) data.body = input.body
    if (input.terms !== undefined) data.terms = input.terms ?? undefined
    if (input.dealId !== undefined) data.dealId = input.dealId
    if (input.contactId !== undefined) data.contactId = input.contactId
    if (input.productClaimsVersion !== undefined) data.productClaimsVersion = input.productClaimsVersion
    // Изменение содержания сбрасывает прежний review/approval статус до draft.
    const contentChanged =
      input.recipient !== undefined || input.body !== undefined || input.subject !== undefined ||
      input.terms !== undefined
    if (contentChanged) {
      data.status = 'draft'
      data.reviewedAt = null
      data.reviewedById = null
    }
    const updated = await this.repository.updateDraftRow(id, data)
    return updated
  }

  async reviewDraft(id: string, actor: ActorContext): Promise<ProposalDraft> {
    await this.assertCapability(actor, CAP.draftApprove, 'draft.review')
    return this.repository.setDraftStatus(id, {
      status: 'reviewed',
      reviewedAt: this.clock.now(),
      reviewedById: actor.userId,
    }, undefined)
  }

  async approveDraft(id: string, actor: ActorContext): Promise<ProposalDraft> {
    await this.assertCapability(actor, CAP.draftApprove, 'draft.approve')
    const dto = await this.repository.findDraftDto(id)
    if (dto === null) throw new BusinessFailure('not_found', 'Черновик не найден')
    if (dto.status !== 'reviewed' && dto.status !== 'draft') {
      throw new BusinessFailure('conflict', 'Одобрить можно только черновик или проверенную версию')
    }
    return this.repository.setDraftStatus(id, {
      status: 'approved',
      approvedAt: this.clock.now(),
      approvedById: actor.userId,
      contentHash: draftContentHash(dto),
    }, undefined)
  }

  /// Ручная фиксация реально выполненной отправки уполномоченным человеком (§8.5):
  /// фиктивный send не создаётся; перед фиксацией повторно проверяются получатель и DNC.
  async sendDraft(
    id: string,
    input: { sentAt?: string | undefined; externalMessageId?: string | null | undefined },
    actor: ActorContext,
  ): Promise<ProposalDraft> {
    await this.assertCapability(actor, CAP.draftApprove, 'draft.send')
    const internal = await this.repository.findDraftInternal(id)
    if (internal === null) throw new BusinessFailure('not_found', 'Черновик не найден')
    assertDraftSendable(internal)
    const company = await this.repository.findCompanyDto(internal.companyId)
    const draftDto = await this.repository.findDraftDto(id)
    const linkedContact = draftDto !== null && draftDto.contactId !== null
      ? await this.repository.findContactDto(draftDto.contactId)
      : null
    // FIX-06-AC01 (аудит R-07): получатель ВСЕГДА сверяется с каналами по
    // нормализованному значению — указание contactId чужого контакта не отменяет
    // запрет фактического адресата.
    const normalized = draftDto !== null ? normalizeRecipient(draftDto.channel, draftDto.recipient) : ''
    const channelOwner = draftDto !== null
      ? await this.repository.findChannelInCompany(draftDto.companyId, draftDto.channel, normalized)
      : null
    if (
      channelOwner !== null &&
      linkedContact !== null &&
      channelOwner.contactId !== linkedContact.id
    ) {
      throw new BusinessFailure(
        'validation',
        'Получатель черновика принадлежит другому контакту — исправьте contactId или адресата до фиксации отправки',
      )
    }
    const channelContact = channelOwner !== null
      ? await this.repository.findContactDto(channelOwner.contactId)
      : null
    const contact = linkedContact ?? channelContact
    assertCommercialTouchAllowed({
      company: company === null
        ? null
        : { doNotContact: company.doNotContact, dncScope: company.dncScope, dncReason: company.dncReason },
      contact: contact === null
        ? null
        : { doNotContact: contact.doNotContact, dncScope: contact.dncScope, dncReason: contact.dncReason },
      kind: 'draft',
    })
    return this.repository.setDraftStatus(id, {
      status: 'sent',
      sentAt: input.sentAt ? new Date(input.sentAt) : this.clock.now(),
      sentById: actor.userId,
      externalMessageId: input.externalMessageId ?? null,
    }, undefined)
  }

  async cancelDraft(id: string, reason: string): Promise<ProposalDraft> {
    const dto = await this.repository.findDraftDto(id)
    if (dto === null) throw new BusinessFailure('not_found', 'Черновик не найден')
    if (dto.status === 'sent') {
      throw new BusinessFailure('conflict', 'Отправленная версия не отменяется — создайте новую')
    }
    return this.repository.setDraftStatus(id, {
      status: 'cancelled',
      cancelledAt: this.clock.now(),
      cancelReason: reason,
    }, undefined)
  }

  // ------------------------------------------------------------- Пилот (CRM-09)

  async upsertPilot(dealId: string, input: Parameters<SalesRepository['upsertPilot']>[1]) {
    return this.repository.upsertPilot(dealId, input)
  }

  async pilot(dealId: string): Promise<PilotEvaluation | null> {
    return this.repository.findPilotDto(dealId)
  }

  async activatePilot(dealId: string, actor: ActorContext): Promise<PilotEvaluation> {
    const internal = await this.repository.findPilotInternal(dealId)
    if (internal === null) throw new BusinessFailure('not_found', 'Пилот не найден')
    if (internal.outcome !== null) {
      throw new BusinessFailure('conflict', 'По пилоту уже есть решение — новый запуск требует нового пилота')
    }
    const blockers = pilotActivationBlockers(internal)
    if (blockers.length > 0) {
      throw new BusinessFailure('validation', `Пилот не готов к запуску: ${blockers.join('; ')}`)
    }
    const pilot = await this.repository.setPilotStatus(internal.id, 'running')
    await this.logAgentOp(actor, 'pilot.activate', internal.id, true, null)
    return pilot
  }

  async decidePilot(
    dealId: string,
    input: { outcome: 'accepted' | 'revise' | 'stop'; note?: string | null },
    actor: ActorContext,
  ): Promise<PilotEvaluation> {
    // Итог пилота — факт клиента: только человек или явное полномочие pilot.decide (FIX-01-AC02).
    await this.assertCapability(actor, CAP.pilotDecide, 'pilot.decide')
    const internal = await this.repository.findPilotInternal(dealId)
    if (internal === null) throw new BusinessFailure('not_found', 'Пилот не найден')
    if (internal.status !== 'running') {
      throw new BusinessFailure('conflict', 'Решение фиксируется только по запущенному пилоту')
    }
    const pilot = await this.repository.setPilotDecision(
      internal.id,
      input.outcome,
      input.note ?? null,
      this.clock.now(),
    )
    await this.logAgentOp(actor, 'pilot.decide', internal.id, true, null)
    return pilot
  }

  async addPilotCriterion(
    dealId: string,
    input: { statement: string; method: string | null },
  ) {
    const internal = await this.repository.findPilotInternal(dealId)
    if (internal === null) throw new BusinessFailure('not_found', 'Пилот не найден')
    return this.repository.createPilotCriterion(internal.id, input)
  }

  /// Изменение критерия — новая версия: задним числом критерий не меняется (CRM-09-AC04).
  async updatePilotCriterion(
    criterionId: string,
    input: { statement: string; method: string | null },
  ) {
    return this.repository.newPilotCriterionVersion(criterionId, input)
  }

  async agreePilotCriterion(criterionId: string, actor: ActorContext) {
    return this.repository.agreePilotCriterion(criterionId, actor.userId, this.clock.now())
  }

  async addPilotMilestone(
    dealId: string,
    input: { side: 'client' | 'ordix'; commitment: string; ownerId: string | null; dueOn: string | null },
  ) {
    const internal = await this.repository.findPilotInternal(dealId)
    if (internal === null) throw new BusinessFailure('not_found', 'Пилот не найден')
    return this.repository.createPilotMilestone(internal.id, input)
  }

  async updatePilotMilestone(
    id: string,
    input: { commitment?: string; ownerId?: string | null; dueOn?: string | null; proof?: string | null; done?: boolean },
  ) {
    return this.repository.updatePilotMilestone(id, input)
  }

  // ------------------------------------------------------------- Запуск (CRM-12)

  async upsertLaunch(
    dealId: string,
    input: DealLaunchUpsertRequest,
    actor: ActorContext,
  ): Promise<DealLaunch> {
    const internal = await this.repository.findDealInternal(dealId)
    if (internal === null) throw new BusinessFailure('not_found', 'Сделка не найдена')
    // Разрешение на публичный кейс — отдельное полномочие (AGENT-03-AC02).
    if (input.caseStudyAllowed === true) {
      await this.assertCapability(actor, CAP.caseAllow, 'launch.caseStudy')
    }
    // V2-R05: принятие первого сценария — факт клиента, агенту запрещено без права.
    if (this.isAgent(actor) && input.firstScenarioAcceptedOn !== undefined && input.firstScenarioAcceptedOn !== null) {
      const message = 'Агент не может фиксировать принятие первого сценария запуска — только человек'
      await this.logAgentOp(actor, 'launch.accept', dealId, false, message)
      throw new BusinessFailure('forbidden', message)
    }
    return this.repository.upsertLaunch(dealId, input)
  }

  async launch(dealId: string): Promise<DealLaunch | null> {
    return this.repository.findLaunchDto(dealId)
  }

  /// Расширение — отдельная сделка под новую подтверждённую задачу (CRM-12-AC03).
  async createExtensionDeal(
    parentDealId: string,
    input: { title: string; monthlyAmount: number; oneTimeAmount: number; basis: string },
    actor: ActorContext,
  ): Promise<Deal> {
    const parent = await this.repository.findDealInternal(parentDealId)
    if (parent === null) throw new BusinessFailure('not_found', 'Родительская сделка не найдена')
    if ((input.basis ?? '').trim() === '') {
      throw new BusinessFailure('validation', 'Расширение требует подтверждённой задачи (основание)')
    }
    return this.createDeal(
      {
        title: input.title,
        companyId: parent.companyId,
        source: `расширение:${parentDealId}`,
        oneTimeAmount: input.oneTimeAmount,
        monthlyAmount: input.monthlyAmount,
        note: `Расширение сделки ${parent.title}. Основание: ${input.basis}`,
      },
      actor,
    )
  }

  /// Легаси-кнопка «Получено»: закрывает остаток обязательства поступлением с сегодня.
  async receiveRemaining(paymentId: string, actor: ActorContext): Promise<void> {
    const payment = await this.repository.findExpectedPaymentInternal(paymentId)
    if (payment === null) {
      throw new BusinessFailure('not_found', 'Ожидаемое поступление не найдено')
    }
    const remaining = Math.max(0, payment.amount - payment.receivedAmount)
    if (remaining === 0 || payment.status === 'cancelled') return
    await this.confirmReceipt(
      paymentId,
      {
        amount: remaining,
        actualReceivedOn: this.clock.now().toISOString().slice(0, 10),
        comment: null,
        allowOverpayment: false,
      },
      actor,
    )
  }

  // ------------------------------------------------------------- Подписка и поступления (CRM-11)

  async setSubscription(
    dealId: string,
    input: { status: 'active' | 'paused' | 'ended'; startsOn: string; endsOn?: string | null; overrideReason?: string | null },
    actor: ActorContext,
  ): Promise<Deal> {
    await this.assertCapability(actor, CAP.subscriptionManage, 'subscription.set')
    const internal = await this.repository.findDealInternal(dealId)
    if (internal === null) throw new BusinessFailure('not_found', 'Сделка не найдена')
    if (input.status === 'active' && internal.wonAt === null) {
      if ((input.overrideReason ?? '').trim() === '') {
        throw new BusinessFailure(
          'validation',
          'Активация подписки требует зафиксированного выигрыша (wonAt) либо явного основания-override',
        )
      }
    }
    return this.repository.setDealSubscription(dealId, {
      status: input.status,
      startsOn: input.startsOn,
      endsOn: input.endsOn ?? null,
      activationAt: input.status === 'active' ? this.clock.now() : null,
    })
  }

  async confirmReceipt(
    paymentId: string,
    input: PaymentReceiptRequest,
    actor: ActorContext,
  ): Promise<PaymentReceipt> {
    await this.assertCapability(actor, CAP.financeConfirm, 'payment.receipt')
    const receipt = await this.withIdempotency(
      actor,
      'payment.receipt',
      { paymentId, ...input },
      async () => {
        const payment = await this.repository.findExpectedPaymentInternal(paymentId)
        if (payment === null) {
          throw new BusinessFailure('not_found', 'Ожидаемое поступление не найдено')
        }
        if (payment.status === 'received' && !input.allowOverpayment) {
          // Повторное подтверждение не удваивает доход: уже закрытое обязательство — no-op.
          return {
            txnId: 'already-received',
            expectedPaymentId: payment.id,
            amount: 0,
            occurredOn: input.actualReceivedOn,
            dealId: payment.dealId,
            receivedAmount: payment.receivedAmount,
            remainingAmount: payment.amount - payment.receivedAmount,
            status: 'received' as const,
          }
        }
        return this.repository.applyReceipt({
          paymentId,
          amount: input.amount,
          actualReceivedOn: input.actualReceivedOn,
          comment: input.comment ?? null,
          actorId: actor.userId,
          allowOverpayment: input.allowOverpayment ?? false,
        })
      },
    )
    await this.logAgentOp(actor, 'payment.receipt', paymentId, true, null)
    return receipt
  }

  // ------------------------------------------------------------- Отчёт и импорт (CRM-07, §8.1)

  async funnelReport(query: CrmFunnelReportQuery): Promise<CrmFunnelReportResponse> {
    return this.repository.funnelReport(query, this.clock.now())
  }

  async importPreview(payload: unknown): Promise<ImportPreviewResponse> {
    return this.repository.importPreview(payload)
  }

  async importApply(request: ImportApplyRequest, actor: ActorContext): Promise<ImportApplyResponse> {
    const result = await this.withIdempotency(actor, 'import.apply', request, () =>
      this.repository.importApply(request, actor.userId),
    )
    await this.logAgentOp(actor, 'import.apply', null, true, null)
    return result
  }

  async draft(id: string): Promise<ProposalDraft> {
    const draft = await this.repository.findDraftDto(id)
    if (draft === null) throw new BusinessFailure('not_found', 'Черновик не найден')
    return draft
  }

  /// Очередь агентских операций: ошибки записи видны, попытка не выдаётся за факт (CRM-08-AC04).
  async agentOps(query: { limit: number; offset: number }) {
    return this.repository.listAgentOps(query)
  }
}
