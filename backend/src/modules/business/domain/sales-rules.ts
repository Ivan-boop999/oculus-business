import type {
  Deal,
  DealClaim,
  PilotEvaluation,
  ProposalDraft,
} from '@oculus-business/contracts'

/// Чистые правила B2B-продаж (ТЗ от 17.10.2026): переходы стадий, запреты контакта,
/// сопоставление импорта, расчёт воронки. Без ввода-вывода — тестируются unit-тестами.

import { BusinessFailure } from './errors'

// ---------------------------------------------------------------------------
// Домены и дубли (CRM-01, §8.1)
// ---------------------------------------------------------------------------

/// Нормализация сайта в домен: нижний регистр, без схемы, www и пути.
/// Домен — сигнал дубля, но не разрешение сливать разные юрлица.
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase()
  if (trimmed === '') return null
  const withoutScheme = trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '')
  const host = withoutScheme.split(/[/?#]/)[0] ?? ''
  if (host === '') return null
  return host.endsWith('.') ? host.slice(0, -1) : host
}

export type CompanyLike = {
  id: string
  name: string
  domain: string | null
  inn: string | null
  externalId: string | null
}

export type ImportMatch = {
  companyId: string | null
  matchedBy: 'external_id' | 'domain' | 'name' | 'none'
  conflicts: Array<{ field: string; existing: string | null; incoming: string | null }>
}

/// Сопоставление кандидата импорта с существующими компаниями.
/// Порядок ключей: внешний идентификатор → проверенный ИНН → домен → точное имя.
/// Один домен у разных юрлиц — не слияние: при конфликте ИНН компания не матчится по домену.
export function matchImportCandidate(
  candidate: { externalId: string | null; name: string; domain: string | null; inn: string | null },
  existing: ReadonlyArray<CompanyLike>,
): ImportMatch {
  const conflicts: ImportMatch['conflicts'] = []
  if (candidate.externalId !== null) {
    const byExternal = existing.find((company) => company.externalId === candidate.externalId)
    if (byExternal) {
      return { companyId: byExternal.id, matchedBy: 'external_id', conflicts }
    }
  }
  if (candidate.inn !== null && candidate.inn.trim() !== '') {
    const byInn = existing.find((company) => company.inn === candidate.inn)
    if (byInn) {
      if (byInn.domain !== null && candidate.domain !== null && byInn.domain !== candidate.domain) {
        conflicts.push({ field: 'domain', existing: byInn.domain, incoming: candidate.domain })
      }
      return { companyId: byInn.id, matchedBy: 'domain', conflicts }
    }
  }
  if (candidate.domain !== null) {
    const sameDomain = existing.filter((company) => company.domain === candidate.domain)
    const withoutInnConflict = sameDomain.filter(
      (company) =>
        company.inn === null ||
        candidate.inn === null ||
        company.inn === candidate.inn,
    )
    // Площадки/юрлица одной группы не объединяются: домен с конфликтом ИНН — не матч.
    if (withoutInnConflict.length > 0) {
      const byDomain = withoutInnConflict[0]!
      if (byDomain.name !== candidate.name) {
        conflicts.push({ field: 'name', existing: byDomain.name, incoming: candidate.name })
      }
      return { companyId: byDomain.id, matchedBy: 'domain', conflicts }
    }
    if (sameDomain.length > 0) {
      conflicts.push({
        field: 'inn',
        existing: sameDomain[0]!.inn,
        incoming: candidate.inn,
      })
    }
  }
  const byName = existing.find((company) => company.name === candidate.name)
  if (byName) {
    if (byName.domain !== null && candidate.domain !== null && byName.domain !== candidate.domain) {
      conflicts.push({ field: 'domain', existing: byName.domain, incoming: candidate.domain })
    }
    return { companyId: byName.id, matchedBy: 'name', conflicts }
  }
  return { companyId: null, matchedBy: 'none', conflicts }
}

// ---------------------------------------------------------------------------
// Запреты на контакт (CRM-04, §8.5)
// ---------------------------------------------------------------------------

export type DncState = {
  doNotContact: boolean
  dncScope: string
  dncReason: string | null
}

/// Коммерческое касание блокируется запретом компании (любая область) или контакта.
/// scope=all блокирует и задачи, и черновики; scope=commercial — только коммерческие КП
/// (техническая переписка по действующему договору идёт вне коммерческих касаний).
export function assertCommercialTouchAllowed(params: {
  company: DncState | null
  contact: DncState | null
  kind: 'draft' | 'task'
}): void {
  const { company, contact, kind } = params
  const scopeCovers = (state: DncState | null, kind: 'draft' | 'task'): boolean => {
    if (state === null || !state.doNotContact) return false
    if (state.dncScope === 'all') return true
    return state.dncScope === 'commercial' && kind === 'draft'
  }
  if (scopeCovers(company, kind) || scopeCovers(contact, kind)) {
    throw new BusinessFailure(
      'forbidden',
      kind === 'draft'
        ? 'Компании или контакту запрещён коммерческий контакт — отправка КП заблокирована'
        : 'Запрет на контакт (область: все касания) — постановка задачи заблокирована',
    )
  }
}

/// Назначение задачи определяет область DNC (FIX-06-AC02):
/// internal не касается клиента и не блокируется; commercial блокируется при scope
/// commercial и all; service — только при scope all (техписьма по действующему договору
/// идут отдельно от коммерческих касаний, но не при полном запрете).
export function assertTaskAllowed(params: {
  company: DncState | null
  contact: DncState | null
  kind: 'commercial' | 'service' | 'internal'
}): void {
  const { company, contact, kind } = params
  if (kind === 'internal') return
  const blocked = (state: DncState | null): boolean => {
    if (state === null || !state.doNotContact) return false
    if (state.dncScope === 'all') return true
    return state.dncScope === 'commercial' && kind === 'commercial'
  }
  if (blocked(company) || blocked(contact)) {
    const scope = [company, contact].find((state) => state !== null && state.doNotContact)?.dncScope
    throw new BusinessFailure(
      'forbidden',
      kind === 'commercial'
        ? `Запрет на контакт (область: ${scope}) — коммерческая задача заблокирована`
        : `Запрет на контакт (область: все касания) — сервисная задача заблокирована`,
    )
  }
}

/// Нормализация получателя для DNC-проверки адреса (FIX-06-AC01):
/// email — нижний регистр; телефон — только цифры и ведущий +; telegram — @нижний регистр.
export function normalizeRecipient(channel: string, recipient: string): string {
  const value = recipient.trim()
  if (value === '') return ''
  if (channel === 'email') return value.toLowerCase()
  if (channel === 'phone') {
    const digits = value.replace(/[^0-9]/g, '')
    return digits === '' ? value : (value.trim().startsWith('+') ? '+' : '') + digits
  }
  if (channel === 'telegram') {
    const noAt = value.replace(/^@/, '')
    return noAt === '' ? value : '@' + noAt.toLowerCase()
  }
  return value
}

/// UTC-момент полуночи выбранного часового пояса для заданной даты (OWNER-02-AC02).
/// Вычисляет смещение зоны через Intl, без внешних библиотек.
export function zonedDayRangeUtc(timezone: string, now: Date): { start: Date; end: Date } {
  const dayInZone = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  for (const hourGuess of [12, 0, 18]) {
    const candidate = new Date(`${dayInZone}T${String(hourGuess).padStart(2, '0')}:00:00Z`)
    const candidateDay = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(candidate)
    if (candidateDay !== dayInZone) continue
    // Полночь зоны = кандидат минус его зоновой составляющая времени.
    const zoneTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(candidate)
    const [zoneHour, zoneMinute] = zoneTime.split(':').map(Number)
    const midnightZoneMs =
      candidate.getTime() - (zoneHour * 60 + zoneMinute) * 60_000
    const start = new Date(midnightZoneMs)
    const startDay = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(start)
    if (startDay === dayInZone) {
      return { start, end: new Date(midnightZoneMs + 86_400_000) }
    }
  }
  throw new BusinessFailure('validation', `Неизвестный часовой пояс: ${timezone}`)
}

// ---------------------------------------------------------------------------
// Единый переход стадий (CRM-06, §6, §8.2)
// ---------------------------------------------------------------------------

export const STAGE_SEMANTIC_TYPES = [
  'intake',
  'research',
  'dialogue',
  'qualified',
  'solution_check',
  'proposal',
  'contract',
  'won',
  'lost',
  'paused',
  'other',
] as const

export type StageSemantic = (typeof STAGE_SEMANTIC_TYPES)[number]

export const MILESTONE_SEMANTICS: ReadonlySet<string> = new Set([
  'qualified',
  'solution_check',
  'proposal',
  'contract',
  'won',
])

export type StageForTransition = {
  id: string
  title: string
  position: number
  semanticType: string
  isWon: boolean
  isLost: boolean
}

export type TransitionCheckInput = {
  deal: Pick<Deal, 'id' | 'stageId' | 'lostReason'> & {
    wonBasis?: string | null
    pausedReason?: string | null
    resumeCondition?: string | null
    resumeOn?: string | null
    wonAt?: string | null
    problemStatement?: string | null
    consequences?: string | null
    nextAgreedStep?: string | null
  }
  fromStage: StageForTransition
  toStage: StageForTransition
  /// Причина перехода из запроса (move.reason / update.lostReason).
  reason?: string | null
  lostReasonInRequest?: string | null
  pausedReason?: string | null
  resumeCondition?: string | null
  resumeOn?: string | null
  wonBasis?: string | null
  overrideReason?: string | null
  claims: ReadonlyArray<Pick<DealClaim, 'fieldKey' | 'status'>>
  hasProcessOwnerRole: boolean
  hasApprovedOrSentDraft: boolean
  actorIsAgent: boolean
}

export type TransitionViolation = { rule: string; message: string }

/// Серверные правила перехода по семантике этапа. UI — не единственное место проверки:
/// та же функция выполняется для create/PATCH stageId/move.
export function evaluateTransition(input: TransitionCheckInput): TransitionViolation[] {
  const violations: TransitionViolation[] = []
  const { toStage, overrideReason } = input
  const overridden = (rule: string, message: string): TransitionViolation | null =>
    overrideReason !== null && overrideReason !== undefined && overrideReason.trim() !== ''
      ? null
      : { rule, message }

  if (toStage.isLost || toStage.semanticType === 'lost') {
    const lostReason = input.lostReasonInRequest ?? input.deal.lostReason ?? input.reason ?? null
    if (lostReason === null || lostReason.trim() === '') {
      violations.push({ rule: 'lost.reason', message: 'Отказ требует причину' })
    }
  }

  if (toStage.semanticType === 'paused') {
    const pausedReason = input.pausedReason ?? input.deal.pausedReason ?? null
    if (pausedReason === null || pausedReason.trim() === '') {
      violations.push({ rule: 'paused.reason', message: 'Пауза требует причину' })
    }
    const resume =
      input.resumeOn ??
      input.resumeCondition ??
      input.deal.resumeCondition ??
      input.deal.resumeOn ??
      null
    if (resume === null || String(resume).trim() === '') {
      violations.push({
        rule: 'paused.resume',
        message: 'Пауза требует дату или событие возврата',
      })
    }
  }

  const needsQualification = MILESTONE_SEMANTICS.has(toStage.semanticType) || toStage.isWon
  if (needsQualification && toStage.semanticType !== 'won') {
    const confirmed = (key: string) =>
      input.claims.some(
        (claim) => claim.fieldKey === key && (claim.status === 'customer_confirmed' || claim.status === 'tested'),
      )
    if (!confirmed('problem')) {
      const violation = overridden(
        'qualified.problem',
        'Подтверждённый пример задачи обязателен (статус утверждения problem — customer_confirmed/tested)',
      )
      if (violation) violations.push(violation)
    }
    if (!confirmed('consequences')) {
      const violation = overridden(
        'qualified.consequences',
        'Подтверждённые последствия или ценность изменения обязательны',
      )
      if (violation) violations.push(violation)
    }
    // FIX-02-AC02 (R-09): подтверждённая задача требует реального содержания, а не отметок.
    const hasText = (value: string | null | undefined): boolean =>
      typeof value === 'string' && value.trim() !== ''
    if (!hasText(input.deal.problemStatement)) {
      const violation = overridden(
        'qualified.content.problem',
        'Описание задачи словами клиента не заполнено',
      )
      if (violation) violations.push(violation)
    }
    if (!hasText(input.deal.consequences)) {
      const violation = overridden(
        'qualified.content.consequences',
        'Последствия или ожидаемая ценность не заполнены',
      )
      if (violation) violations.push(violation)
    }
    if (!hasText(input.deal.nextAgreedStep)) {
      const violation = overridden(
        'qualified.content.step',
        'Следующий согласованный шаг не заполнен',
      )
      if (violation) violations.push(violation)
    }
    if (!input.hasProcessOwnerRole) {
      const violation = overridden(
        'qualified.owner',
        'Владелец процесса не связан со сделкой',
      )
      if (violation) violations.push(violation)
    }
  }

  if (toStage.semanticType === 'proposal' || toStage.semanticType === 'contract') {
    if (!input.hasApprovedOrSentDraft) {
      const violation = overridden(
        'proposal.version',
        'Нужна согласованная (approved/sent) версия предложения по сделке',
      )
      if (violation) violations.push(violation)
    }
  }

  if (toStage.isWon || toStage.semanticType === 'won') {
    const basis = input.wonBasis ?? input.deal.wonBasis ?? null
    if (basis === null || basis.trim() === '') {
      const violation = overridden('won.basis', 'Выигрыш требует основание коммерческого решения')
      if (violation) violations.push(violation)
    }
    // Право агента на won проверяет сервис (отдельно выданная возможность), не домен.
  }

  return violations
}

// ---------------------------------------------------------------------------
// Воронка и продвижение (CRM-07, §8.3)
// ---------------------------------------------------------------------------

export type FunnelEvent = {
  dealId: string
  fromStageId: string | null
  toStageId: string
  event: string
  movedAt: string
  legacy: boolean
}

export type FunnelDealState = {
  id: string
  stageId: string
  companyId: string | null
  ownerId: string | null
  source: string | null
  createdAt: string
}

export type FunnelCompany = {
  id: string
  cohortVersion: string | null
  segment: string | null
  researchSource: string | null
  contactSource: string | null
}

export type FunnelFilters = {
  from?: string | undefined
  to?: string | undefined
  cohort?: string | undefined
  segment?: string | undefined
  source?: string | undefined
  ownerId?: string | undefined
  channel?: string | undefined
  offerVersion?: string | undefined
}

export type FunnelDealExtras = {
  /// Каналы взаимодействий сделки (для фильтра «канал», §8.3).
  channelsByDeal?: ReadonlyMap<string, ReadonlySet<string>>
  /// Версии утверждений/офферов по сделке (productClaimsVersion черновиков).
  offerVersionsByDeal?: ReadonlyMap<string, ReadonlySet<string>>
}

export type FunnelStats = {
  opportunities: number
  /// Уникальные возможности с ≥1 переходом в периоде — знаменатель событиевых долей.
  activeInPeriod: number
  exits: { n: number; total: number; pct: number | null }
  advanced: { n: number; total: number; pct: number | null }
  lost: { n: number; total: number; pct: number | null }
  paused: { n: number }
  openOpportunities: number
  legacyEventsExcluded: number
  reliableFrom: string | null
  byStage: Array<{
    stageId: string
    title: string
    semanticType: string
    entered: number
    exitedAny: number
    advancedToNext: number
    lostFrom: number
  }>
}

const pct = (n: number, total: number): number | null => (total > 0 ? Math.round((n / total) * 100) : null)

/// Уникальные объекты: возвраты и повторные касания не создают второго покупателя.
/// Считаются только достоверные события (stageId есть, legacy=false); числитель и
/// знаменатель возвращаются рядом с процентом.
export function computeFunnelStats(params: {
  events: ReadonlyArray<FunnelEvent>
  deals: ReadonlyArray<FunnelDealState>
  companies: ReadonlyArray<FunnelCompany>
  stages: ReadonlyArray<StageForTransition>
  filters: FunnelFilters
  now: string
  extras?: FunnelDealExtras
}): FunnelStats {
  const { events, deals, companies, stages, filters, now } = params
  const channelsByDeal = params.extras?.channelsByDeal
  const offerVersionsByDeal = params.extras?.offerVersionsByDeal
  const stageById = new Map(stages.map((stage) => [stage.id, stage]))
  const companyById = new Map(companies.map((company) => [company.id, company]))
  const dealById = new Map(deals.map((deal) => [deal.id, deal]))

  const inPeriod = (iso: string): boolean => {
    const date = iso.slice(0, 10)
    if (filters.from !== undefined && date < filters.from) return false
    if (filters.to !== undefined && date > filters.to) return false
    return true
  }

  const dealAllowed = (dealId: string): boolean => {
    const deal = dealById.get(dealId)
    if (deal === undefined) return false
    if (filters.ownerId !== undefined && deal.ownerId !== filters.ownerId) return false
    if (filters.source !== undefined) {
      const company = deal.companyId !== null ? companyById.get(deal.companyId) : undefined
      const sources = [deal.source, company?.researchSource, company?.contactSource]
      if (!sources.some((value) => value !== null && value !== undefined && value === filters.source)) {
        return false
      }
    }
    if (filters.cohort !== undefined || filters.segment !== undefined) {
      const company = deal.companyId !== null ? companyById.get(deal.companyId) : undefined
      if (company === undefined) return false
      if (filters.cohort !== undefined && company.cohortVersion !== filters.cohort) return false
      if (filters.segment !== undefined && company.segment !== filters.segment) return false
    }
    if (filters.channel !== undefined) {
      const channels = channelsByDeal?.get(dealId)
      if (channels === undefined || !channels.has(filters.channel)) return false
    }
    if (filters.offerVersion !== undefined) {
      const versions = offerVersionsByDeal?.get(dealId)
      if (versions === undefined || !versions.has(filters.offerVersion)) return false
    }
    return true
  }

  const reliable = events.filter((event) => !event.legacy)
  const legacyEventsExcluded = events.length - reliable.length
  const reliableFrom =
    reliable.length > 0
      ? reliable.reduce((min, event) => (event.movedAt < min ? event.movedAt : min), reliable[0]!.movedAt)
      : null

  const enteredDealIds = new Set(
    reliable
      .filter((event) => event.event === 'initial_entry' && inPeriod(event.movedAt))
      .map((event) => event.dealId)
      .filter(dealAllowed),
  )
  const opportunities = enteredDealIds.size

  const moves = reliable.filter((event) => event.event === 'moved' && inPeriod(event.movedAt))
  const exitDeals = new Set<string>()
  const advancedDeals = new Set<string>()
  const lostDeals = new Set<string>()
  const pausedDeals = new Set<string>()
  for (const move of moves) {
    if (!dealAllowed(move.dealId)) continue
    exitDeals.add(move.dealId)
    const target = stageById.get(move.toStageId)
    const source = move.fromStageId !== null ? stageById.get(move.fromStageId) : undefined
    if (target === undefined) continue
    // OWNER-04-AC02 (аудит R-14): продвижение — только движение вперёд к milestone/won;
    // возврат proposal → qualified продвижением не считается.
    const forward = source === undefined || target.position > source.position
    if (forward && (MILESTONE_SEMANTICS.has(target.semanticType) || target.isWon)) {
      advancedDeals.add(move.dealId)
    }
    if (target.isLost || target.semanticType === 'lost') lostDeals.add(move.dealId)
    if (target.semanticType === 'paused') pausedDeals.add(move.dealId)
  }
  // Модель знаменателя (OWNER-04-AC03): событиевые доли — от уникальных возможностей,
  // двигавшихся в периоде (activeInPeriod). Старые возможности, перешедшие сейчас,
  // не дают искусственных >100%; opportunities (новые входы) — отдельный показатель.
  const activeInPeriod = exitDeals.size

  const openNow = deals.filter((deal) => {
    const stage = stageById.get(deal.stageId)
    if (stage === undefined) return false
    if (stage.isWon || stage.isLost) return false
    return dealAllowed(deal.id)
  }).length

  const byStageMap = new Map<
    string,
    { entered: Set<string>; exitedAny: Set<string>; advancedToNext: Set<string>; lostFrom: Set<string> }
  >()
  const stageBucket = (stageId: string) => {
    let bucket = byStageMap.get(stageId)
    if (bucket === undefined) {
      bucket = { entered: new Set(), exitedAny: new Set(), advancedToNext: new Set(), lostFrom: new Set() }
      byStageMap.set(stageId, bucket)
    }
    return bucket
  }
  for (const event of reliable) {
    if (!inPeriod(event.movedAt) || !dealAllowed(event.dealId)) continue
    if (event.event === 'initial_entry' && event.toStageId !== null) {
      stageBucket(event.toStageId).entered.add(event.dealId)
    }
    if (event.event === 'moved') {
      if (event.fromStageId !== null) {
        const bucket = stageBucket(event.fromStageId)
        bucket.exitedAny.add(event.dealId)
        const target = stageById.get(event.toStageId)
        const from = stageById.get(event.fromStageId)
        if (target !== undefined && from !== undefined && target.position > from.position) {
          bucket.advancedToNext.add(event.dealId)
        }
        if (target !== undefined && (target.isLost || target.semanticType === 'lost')) {
          bucket.lostFrom.add(event.dealId)
        }
      }
      if (event.toStageId !== null) stageBucket(event.toStageId).entered.add(event.dealId)
    }
  }

  return {
    opportunities,
    activeInPeriod,
    exits: { n: exitDeals.size, total: activeInPeriod, pct: pct(exitDeals.size, activeInPeriod) },
    advanced: { n: advancedDeals.size, total: activeInPeriod, pct: pct(advancedDeals.size, activeInPeriod) },
    lost: { n: lostDeals.size, total: activeInPeriod, pct: pct(lostDeals.size, activeInPeriod) },
    paused: { n: pausedDeals.size },
    openOpportunities: openNow,
    legacyEventsExcluded,
    reliableFrom,
    byStage: [...stages]
      .sort((a, b) => a.position - b.position)
      .map((stage) => {
        const bucket = byStageMap.get(stage.id)
        return {
          stageId: stage.id,
          title: stage.title,
          semanticType: stage.semanticType,
          entered: bucket?.entered.size ?? 0,
          exitedAny: bucket?.exitedAny.size ?? 0,
          advancedToNext: bucket?.advancedToNext.size ?? 0,
          lostFrom: bucket?.lostFrom.size ?? 0,
        }
      }),
  }
}

// ---------------------------------------------------------------------------
// Пилот, запуск, вклад (CRM-09, CRM-12)
// ---------------------------------------------------------------------------

export type PilotForActivation = Pick<
  PilotEvaluation,
  'ordixOwnerId' | 'clientOwnerContactId' | 'clientOwnerName' | 'sourceData' | 'decisionDueOn'
> & {
  activeCriteriaCount: number
  goal: string | null
  paidNextStep: string | null
  usersOverview: string | null
  /// Все активные критерии согласованы (agreedAt) и имеют метод сверки.
  criteriaAgreedAndMethoded: boolean
}

/// Пилот не активируется без владельцев, данных, цели, пользователей, согласованных
/// критериев с методом, платного продолжения и даты решения (CRM-09-AC01, FIX-02-AC02, аудит R-10).
export function pilotActivationBlockers(pilot: PilotForActivation): string[] {
  const blockers: string[] = []
  if (pilot.ordixOwnerId === null) blockers.push('Не назначен владелец пилота от ОРДИКС')
  if (pilot.clientOwnerContactId === null && (pilot.clientOwnerName ?? '').trim() === '') {
    blockers.push('Не назначен владелец пилота от клиента')
  }
  if ((pilot.sourceData ?? '').trim() === '') blockers.push('Не описаны исходные данные пилота')
  if ((pilot.goal ?? '').trim() === '') blockers.push('Не сформулирована цель пилота')
  if ((pilot.usersOverview ?? '').trim() === '') blockers.push('Не описаны пользователи пилота')
  if (pilot.activeCriteriaCount < 1) blockers.push('Нужен хотя бы один активный критерий')
  if (!pilot.criteriaAgreedAndMethoded) {
    blockers.push('Каждый активный критерий должен быть согласован и иметь метод сверки')
  }
  if ((pilot.paidNextStep ?? '').trim() === '') {
    blockers.push('Не описан платный следующий шаг после пилота')
  }
  if (pilot.decisionDueOn === null) blockers.push('Не задана дата итогового решения')
  return blockers
}

/// Вклад запуска: поступления − прямые расходы − часы поддержки × ставку (CRM-12-AC04).
export function computeContribution(params: {
  receivedTotal: number
  directCosts: number
  supportHours: number
  laborHourRate: number
}): number {
  return params.receivedTotal - params.directCosts - params.supportHours * params.laborHourRate
}

/// Клиент с оплаченной, но неиспользуемой системой — риск (CRM-12-AC02).
export function isUnusedPayingCustomer(params: {
  receivedTotal: number
  firstScenarioAcceptedOn: string | null
  valueCheckOverdue: boolean
}): boolean {
  return params.receivedTotal > 0 && params.firstScenarioAcceptedOn === null && params.valueCheckOverdue
}

// ---------------------------------------------------------------------------
// Черновики (CRM-10, §8.5)
// ---------------------------------------------------------------------------

/// Хэш содержания версии: изменение текста или адресата делает прежнее одобрение
/// неприменимым к новой версии.
export function draftContentHash(draft: {
  recipient: string
  subject: string | null
  body: string
  terms: unknown
}): string {
  const payload = JSON.stringify({
    recipient: draft.recipient,
    subject: draft.subject,
    body: draft.body,
    terms: draft.terms ?? null,
  })
  let hash = 0x811c9dc5
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `fnv1a-${hash.toString(16)}-${payload.length}`
}

export type DraftForSend = {
  status: string
  recipient: string
  contentHash: string | null
  groupId: string
}

/// Отправка — только ручная фиксация факта уполномоченным человеком по одобренной версии.
export function assertDraftSendable(draft: DraftForSend): void {
  if (draft.status !== 'approved') {
    throw new BusinessFailure(
      'conflict',
      'Фиксировать отправку можно только для одобренной версии черновика',
    )
  }
  if ((draft.recipient ?? '').trim() === '') {
    throw new BusinessFailure('validation', 'У версии не задан точный получатель')
  }
}

/// Ближайшая открытая задача — сводка nextAction не расходится с очередью (§5 ТЗ).
export function nextActionFromOpenTasks(
  tasks: ReadonlyArray<{ goal: string; action: string | null; dueAt: string; status: string }>,
): { nextAction: string | null; nextActionAt: string | null } {
  const open = tasks
    .filter((task) => task.status === 'open')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const first = open[0]
  if (first === undefined) return { nextAction: null, nextActionAt: null }
  return {
    nextAction: first.action !== null && first.action !== '' ? first.action : first.goal,
    nextActionAt: first.dueAt.slice(0, 10),
  }
}
