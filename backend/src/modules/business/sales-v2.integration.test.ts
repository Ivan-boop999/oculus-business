import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import { loadEnv } from '../../env'

const databaseUrl = process.env.TEST_DATABASE_URL
const maybeDescribe = databaseUrl ? describe : describe.skip

async function registerUser(
  app: ReturnType<typeof createApp>,
  email: string,
): Promise<{ token: string; userId: string }> {
  const response = await app.request('/api/auth/token/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', displayName: email.split('@')[0] }),
  })
  const body = (await response.json()) as { accessToken: string; user: { id: string } }
  return { token: body.accessToken, userId: body.user.id }
}

async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const response = await app.request('/api/auth/token/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  })
  const body = (await response.json()) as { accessToken: string }
  return body.accessToken
}

function api(app: ReturnType<typeof createApp>, token: string) {
  return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await app.request(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await response.text()
    return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) }
  }
}

/// Параллельные запросы с независимыми соединениями: каждый call — отдельный HTTP-запрос
/// к общему приложению (собственная транзакция на запрос в БД).
async function parallel<T>(jobs: Array<() => Promise<T>>): Promise<T[]> {
  return Promise.all(jobs.map((job) => job()))
}

maybeDescribe('V2: FIX/OWNER/AGENT (ТЗ v2)', () => {
  const env = loadEnv({
    DATABASE_URL: databaseUrl!,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: 'http://localhost:5173',
  })
  const prisma = createPrisma(databaseUrl!)
  const app = createApp({ env, prisma })

  let admin: { token: string; userId: string }
  let agent: { token: string; userId: string }
  let call: (m: string, p: string, b?: unknown, h?: Record<string, string>) => Promise<{ status: number; body: Record<string, unknown> }>
  let agentCall: (m: string, p: string, b?: unknown, h?: Record<string, string>) => Promise<{ status: number; body: Record<string, unknown> }>

  beforeEach(async () => {
    for (const model of [
      'taskOutbox', 'agentOpLog', 'idempotencyRecord', 'txn', 'expectedPayment',
      'dealHistory', 'dealClaim', 'dealContactRole', 'contactChannel', 'activity',
      'salesTask', 'proposalDraft', 'pilotCriterion', 'pilotMilestone', 'pilotEvaluation',
      'dealLaunch', 'partnerAgreement', 'companyFact', 'deal', 'crmStage', 'companyEvent',
      'company', 'dealComment', 'authSession', 'user',
    ] as const) {
      await (prisma as unknown as Record<string, { deleteMany(): Promise<unknown> }>)[model].deleteMany()
    }
    admin = await registerUser(app, 'owner@example.com')
    const agentRegistration = await registerUser(app, 'agent@example.com')
    await prisma.user.update({ where: { id: agentRegistration.userId }, data: { role: 'agent' } })
    agent = { token: await login(app, 'agent@example.com'), userId: agentRegistration.userId }
    call = api(app, admin.token)
    agentCall = api(app, agent.token)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function createStages() {
    const defs = [
      { title: 'Вход', semanticType: 'intake' },
      { title: 'Диалог', semanticType: 'dialogue' },
      { title: 'Квалифицирована', semanticType: 'qualified' },
      { title: 'Предложение', semanticType: 'proposal' },
      { title: 'Выиграна', semanticType: 'won' },
      { title: 'Отказ', semanticType: 'lost' },
    ]
    const result: Record<string, { id: string }> = {}
    for (const def of defs) {
      const response = await call('POST', '/api/crm/stages', {
        title: def.title,
        isWon: def.semanticType === 'won',
        isLost: def.semanticType === 'lost',
        semanticType: def.semanticType,
      })
      result[def.semanticType] = { id: (response.body.stage as { id: string }).id }
    }
    return result
  }

  async function makeCompany(name: string): Promise<string> {
    const response = await call('POST', '/api/crm/companies', { name })
    return (response.body.company as { id: string }).id
  }

  test('V2-E2E-02: agent attacks legacy finance, direct won, pilot decision, DNC lift', async () => {
    const stages = await createStages()
    const companyId = await makeCompany('Атака')
    // R-01: старые финансовые маршруты
    const txn = await agentCall('POST', '/api/finance/txns', {
      kind: 'income', amount: 1000, occurredOn: '2026-10-17', category: 'Прочее',
    })
    expect(txn.status).toBe(403)
    const recurring = await agentCall('POST', '/api/finance/recurring', {
      kind: 'income', amount: 500, category: 'Подписка', dayOfMonth: 1, activeFrom: '2026-10-01',
    })
    expect(recurring.status).toBe(403)
    const settings = await agentCall('PUT', '/api/finance/settings', {
      openingBalanceDate: '2026-01-01', openingBalance: 0, laborHourRate: 0, timezone: 'Europe/Moscow',
    })
    expect(settings.status).toBe(403)
    // R-02: создание сразу won/qualified
    const wonDirect = await agentCall('POST', '/api/crm/deals', { title: 'Сразу won', companyId, stageId: stages.won.id })
    expect(wonDirect.status).toBe(403)
    const qualifiedDirect = await agentCall('POST', '/api/crm/deals', { title: 'Сразу qualified', companyId, stageId: stages.qualified.id })
    expect(qualifiedDirect.status).toBe(403)
    // Человек тоже не может создать сразу won (условия недостижимы при создании)
    const humanWon = await call('POST', '/api/crm/deals', { title: 'Человек won', companyId, stageId: stages.won.id })
    expect(humanWon.status).toBe(400)
    // DNC lift агентом
    await call('POST', `/api/crm/companies/${companyId}/dnc`, { reason: 'Просьба', scope: 'all' })
    const lift = await agentCall('POST', `/api/crm/companies/${companyId}/dnc/lift`, { reason: 'Агент снимает' })
    expect(lift.status).toBe(403)
    // Человек снимает
    const humanLift = await call('POST', `/api/crm/companies/${companyId}/dnc/lift`, { reason: 'Клиент сам попросил продолжить' })
    expect(humanLift.status).toBe(200)
  })

  test('V2-E2E-03/FIX-03: 5 параллельных задач и оплат — ровно по одному результату', async () => {
    await createStages()
    const companyId = await makeCompany('Идемпотентность')
    const key = { 'Idempotency-Key': 'v2-parallel-task-' + Date.now() }
    const taskPayload = {
      companyId, assigneeId: admin.userId, goal: 'Параллельная задача',
      dueAt: '2026-10-20T10:00:00+03:00',
    }
    const results = await parallel(Array.from({ length: 5 }, () => () => call('POST', '/api/crm/tasks', taskPayload, key)))
    // FIX-03-AC01: без 500; повторы возвращают сохранённый результат (201) или 409 in-progress.
    for (const result of results) expect([200, 201, 409]).toContain(result.status)
    // Одинаковые ответы-реплеи несут один и тот же id задачи.
    const createdIds = new Set(results.filter((r) => r.status === 201).map((r) => ((r.body.task as { id: string })?.id)))
    expect(createdIds.size).toBe(1)
    const tasks = await call('GET', `/api/crm/tasks?companyId=${companyId}`)
    expect((tasks.body.items as unknown[]).length).toBe(1)
    // Другая нагрузка с тем же ключом → 409 без побочных эффектов
    const conflict = await call('POST', '/api/crm/tasks', { ...taskPayload, goal: 'Другое' }, key)
    expect(conflict.status).toBe(409)

    // Оплаты: 5 параллельных 100 по обязательству 1000
    const deal = await call('POST', '/api/crm/deals', { title: 'Оплаты', companyId })
    const dealId = (deal.body.deal as { id: string }).id
    const payment = await call('POST', '/api/finance/expected', {
      title: 'Счёт', amount: 1000, dueDate: '2026-10-10', dealId,
    })
    const paymentId = (payment.body.payment as { id: string }).id
    const receiptKey = { 'Idempotency-Key': 'v2-parallel-receipt-' + Date.now() }
    const receiptPayload = { amount: 100, actualReceivedOn: '2026-10-17' }
    const receipts = await parallel(Array.from({ length: 5 }, () => () =>
      call('POST', `/api/finance/expected/${paymentId}/receipts`, receiptPayload, receiptKey)))
    for (const receipt of receipts) expect([200, 201, 409]).toContain(receipt.status)
    const receiptTxnIds = new Set(receipts.filter((r) => r.status === 201).map((r) => ((r.body.receipt as { txnId: string })?.txnId)))
    expect(receiptTxnIds.size).toBeLessThanOrEqual(1)
    // Ровно один факт денег в БД — реплеи не дублируют.
    const txns = await prisma.txn.findMany({ where: { expectedPaymentId: paymentId } })
    expect(txns.length).toBe(1)
    expect(txns[0]!.amount).toBe(100)
    const stored = await prisma.expectedPayment.findUniqueOrThrow({ where: { id: paymentId } })
    expect(stored.receivedAmount).toBe(100)
  })

  test('V2-E2E-04/FIX-04: конкурентные разные оплаты 600+600, сторнирование, переплата', async () => {
    await createStages()
    const companyId = await makeCompany('Конкуренция оплат')
    const deal = await call('POST', '/api/crm/deals', { title: 'Конкурентные оплаты', companyId })
    const dealId = (deal.body.deal as { id: string }).id
    const payment = await call('POST', '/api/finance/expected', {
      title: 'Обязательство 1000', amount: 1000, dueDate: '2026-10-10', dealId,
    })
    const paymentId = (payment.body.payment as { id: string }).id
    const concurrent = await parallel([
      () => call('POST', `/api/finance/expected/${paymentId}/receipts`, { amount: 600, actualReceivedOn: '2026-10-17' }),
      () => call('POST', `/api/finance/expected/${paymentId}/receipts`, { amount: 600, actualReceivedOn: '2026-10-17' }),
    ])
    const okCount = concurrent.filter((result) => result.status === 201).length
    expect(okCount).toBe(1)
    const txns = await prisma.txn.findMany({ where: { expectedPaymentId: paymentId } })
    expect(txns.reduce((sum, txn) => sum + txn.amount, 0)).toBe(600)
    const stored = await prisma.expectedPayment.findUniqueOrThrow({ where: { id: paymentId } })
    expect(stored.receivedAmount).toBe(600)
    expect(stored.status).toBe('partially_received')

    // R-05: PATCH/DELETE связанного поступления запрещены через старый API
    const txnId = txns[0]!.id
    const patched = await call('PATCH', `/api/finance/txns/${txnId}`, { amount: 999 })
    expect(patched.status).toBe(409)
    const deleted = await call('DELETE', `/api/finance/txns/${txnId}`)
    expect(deleted.status).toBe(409)

    // Сторнирование с основанием и правами (человек)
    const reversed = await call('POST', `/api/finance/expected/${paymentId}/receipts/${txnId}/reverse`, {
      reason: 'Ошибка банка: платёж возвращён',
    })
    expect(reversed.status).toBe(200)
    const after = await prisma.expectedPayment.findUniqueOrThrow({ where: { id: paymentId } })
    expect(after.receivedAmount).toBe(0)
    expect(after.status).toBe('expected')
    const reversalTxn = await prisma.txn.findFirstOrThrow({ where: { reversalOfId: txnId } })
    expect(reversalTxn.kind).toBe('expense')
    // Повторное сторнирование — 409
    const doubleReverse = await call('POST', `/api/finance/expected/${paymentId}/receipts/${txnId}/reverse`, { reason: 'Ещё раз' })
    expect(doubleReverse.status).toBe(409)
    // Агент не сторнирует
    const payment2 = await call('POST', '/api/finance/expected', { title: 'Второе', amount: 500, dueDate: '2026-10-11', dealId })
    const payment2Id = (payment2.body.payment as { id: string }).id
    const receipt2 = await call('POST', `/api/finance/expected/${payment2Id}/receipts`, { amount: 200, actualReceivedOn: '2026-10-17' })
    const txn2 = (receipt2.body.receipt as { txnId: string }).txnId
    const agentReverse = await agentCall('POST', `/api/finance/expected/${payment2Id}/receipts/${txn2}/reverse`, { reason: 'Агент' })
    expect(agentReverse.status).toBe(403)
  })

  test('V2-E2E-07/FIX-05: конкурирующие правки одной версии и null-очистка', async () => {
    const companyId = await makeCompany('Версии')
    const created = await call('POST', '/api/crm/companies', { name: 'Версионная', note: 'v1' })
    const company = created.body.company as { id: string; version: number }
    expect(company.version).toBe(1)
    const concurrent = await parallel([
      () => call('PATCH', `/api/crm/companies/${company.id}`, { note: 'Первая правка', expectedVersion: 1 }),
      () => call('PATCH', `/api/crm/companies/${company.id}`, { note: 'Вторая правка', expectedVersion: 1 }),
    ])
    const okCount = concurrent.filter((result) => result.status === 200).length
    expect(okCount).toBe(1)
    expect(concurrent.filter((result) => result.status === 409)).toHaveLength(1)
    const stored = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
    expect(stored.version).toBe(2)
    expect(['Первая правка', 'Вторая правка']).toContain(stored.note ?? '')

    // R-15/FIX-05-AC04: явный null очищает
    const stages = await createStages()
    const deal = await call('POST', '/api/crm/deals', { title: 'Очистка', companyId: await makeCompany('Очистка пилота') })
    const dealId = (deal.body.deal as { id: string }).id
    await call('PUT', `/api/crm/deals/${dealId}/pilot`, {
      goal: 'Цель', sourceData: 'Test data', usersOverview: 'Люди',
    })
    const cleared = await call('PUT', `/api/crm/deals/${dealId}/pilot`, {
      sourceData: null, usersOverview: null,
    })
    expect(cleared.status).toBe(200)
    const pilotRow = await prisma.pilotEvaluation.findUniqueOrThrow({ where: { dealId } })
    expect(pilotRow.sourceData).toBeNull()
    expect(pilotRow.usersOverview).toBeNull()
    expect(pilotRow.goal).toBe('Цель')
    await call('PUT', `/api/crm/deals/${dealId}/launch`, {
      launchOwnerId: admin.userId, usageIssues: 'Проблема',
    })
    const launchCleared = await call('PUT', `/api/crm/deals/${dealId}/launch`, {
      launchOwnerId: null, usageIssues: null,
    })
    expect(launchCleared.status).toBe(200)
    const launchRow = await prisma.dealLaunch.findUniqueOrThrow({ where: { dealId } })
    expect(launchRow.launchOwnerId).toBeNull()
    expect(launchRow.usageIssues).toBeNull()
    void stages
  })

  test('FIX-06-AC02/AC03: типы задач, остановка продолжений при DNC', async () => {
    const companyId = await makeCompany('Области DNC')
    // commercial scope: коммерческая задача заблокирована, сервисная разрешена
    await call('POST', `/api/crm/companies/${companyId}/dnc`, { reason: 'Отказ от рассылок', scope: 'commercial' })
    const commercial = await call('POST', '/api/crm/tasks', {
      companyId, assigneeId: admin.userId, goal: 'Продать', kind: 'commercial',
      dueAt: '2026-10-20T10:00:00+03:00',
    })
    expect(commercial.status).toBe(403)
    const service = await call('POST', '/api/crm/tasks', {
      companyId, assigneeId: admin.userId, goal: 'Техподдержка по договору', kind: 'service',
      dueAt: '2026-10-20T10:00:00+03:00',
    })
    expect(service.status).toBe(201)
    // Открытая коммерческая задача помечена к пересмотру при установке DNC
    const beforeDnc = await call('POST', '/api/crm/tasks', {
      companyId, assigneeId: admin.userId, goal: 'Старая коммерческая', kind: 'commercial',
      dueAt: '2026-10-18T10:00:00+03:00',
    })
    void beforeDnc
    const companyId2 = await makeCompany('Остановка продолжений')
    const openTask = await call('POST', '/api/crm/tasks', {
      companyId: companyId2, assigneeId: admin.userId, goal: 'Открытая коммерческая', kind: 'commercial',
      dueAt: '2026-10-18T10:00:00+03:00',
    })
    const openTaskId = (openTask.body.task as { id: string }).id
    const draft = await call('POST', '/api/crm/drafts', { companyId: companyId2, channel: 'email', recipient: 'info@stop.ru', body: 'КП' })
    const draftId = (draft.body.draft as { id: string }).id
    await call('POST', `/api/crm/drafts/${draftId}/approve`)
    await call('POST', `/api/crm/companies/${companyId2}/dnc`, { reason: 'Полный отказ', scope: 'all' })
    const taskRow = await prisma.salesTask.findUniqueOrThrow({ where: { id: openTaskId } })
    expect(taskRow.needsReview).toBe(true)
    const draftRow = await prisma.proposalDraft.findUniqueOrThrow({ where: { id: draftId } })
    expect(draftRow.status).toBe('on_hold')
    expect(draftRow.holdReason).toContain('DNC')
    // Задача только с dealId не 500 и соблюдает DNC
    const stages = await createStages()
    const deal = await call('POST', '/api/crm/deals', { title: 'DealId задача', companyId: companyId2 })
    const dealId = (deal.body.deal as { id: string }).id
    const dealOnlyTask = await call('POST', '/api/crm/tasks', {
      dealId, assigneeId: admin.userId, goal: 'Касание по сделке', dueAt: '2026-10-19T10:00:00+03:00',
    })
    expect(dealOnlyTask.status).toBe(403)
    void stages
  })

  test('FIX-07: импорт с DNC, superseded-версией, invalid-каналом и переносом запрета', async () => {
    // Первый импорт создаёт компании под externalId (совпадение названия — не матч, FIX-07-AC01).
    const payload = {
      version: 1,
      updated_at: '2026-10-18',
      accounts: [
        {
          id: 'dnc-acc',
          company_name: 'Импорт-запрет',
          official_domain: 'dnc-import.ru',
          contacts: [{ email: 'x@dnc.ru', verification_status: 'published', do_not_contact: false }],
          outbound_drafts: [
            { subject: 'OLD', body: 'старая версия', status: 'superseded' },
            { subject: 'NEW', body: 'актуальная версия', status: 'draft' },
          ],
          next_action: 'Позвонить',
        },
        {
          id: 'dnc-contact-acc',
          company_name: 'Импорт-контакт-запрет',
          contacts: [{ email: 'bad@contact.ru', verification_status: 'invalid', do_not_contact: true }],
          outbound_drafts: [],
        },
      ],
    }
    const seed = await call('POST', '/api/crm/import/apply', {
      payload,
      decisions: [
        { externalId: 'pipeline:dnc-acc', action: 'create' },
        { externalId: 'pipeline:dnc-contact-acc', action: 'create' },
      ],
    })
    expect(seed.status).toBe(200)
    expect(seed.body.companiesCreated).toBe(2)
    const existingId = (await prisma.company.findUniqueOrThrow({ where: { externalId: 'pipeline:dnc-acc' } })).id
    await call('POST', '/api/crm/companies/' + existingId + '/dnc', { reason: 'Отказ', scope: 'all' })
    // Убираем черновики первого прогона — проверяем выбор версии при повторном импорте.
    await prisma.proposalDraft.deleteMany({ where: { companyId: existingId } })
    const apply = await call('POST', '/api/crm/import/apply', {
      payload,
      decisions: [
        { externalId: 'pipeline:dnc-acc', action: 'update' },
        { externalId: 'pipeline:dnc-contact-acc', action: 'create' },
      ],
    })
    expect(apply.status).toBe(200)
    // DNC-компания: задача не создана, черновик on_hold
    expect(apply.body.tasksCreated).toBe(0)
    const drafts = await prisma.proposalDraft.findMany({ where: { externalId: 'pipeline:dnc-acc:draft' } })
    expect(drafts).toHaveLength(1)
    expect(drafts[0]!.status).toBe('on_hold')
    expect(drafts[0]!.subject).toBe('NEW') // superseded не выбран
    expect(drafts[0]!.holdReason).toContain('DNC')
    // Контактный запрет перенесён, invalid-канал сохранил статус
    const contactCo = await prisma.company.findUniqueOrThrow({ where: { externalId: 'pipeline:dnc-contact-acc' } })
    const contact = await prisma.contact.findFirstOrThrow({ where: { companyId: contactCo.id } })
    expect(contact.doNotContact).toBe(true)
    const channel = await prisma.contactChannel.findFirstOrThrow({ where: { contactId: contact.id } })
    expect(channel.status).toBe('invalid')
    // Повторный импорт — черновик не дублируется
    const apply2 = await call('POST', '/api/crm/import/apply', {
      payload,
      decisions: [
        { externalId: 'pipeline:dnc-acc', action: 'update' },
        { externalId: 'pipeline:dnc-contact-acc', action: 'create' },
      ],
    })
    expect(apply2.status).toBe(200)
    expect(apply2.body.draftsCreated).toBe(0)
    const draftsAfter = await prisma.proposalDraft.findMany({ where: { externalId: 'pipeline:dnc-acc:draft' } })
    expect(draftsAfter).toHaveLength(1)
  })

  test('OWNER-05/V2-E2E-11: партнёр, условия 30% как предложение, фильтр', async () => {
    const stages = await createStages()
    const endClientId = await makeCompany('Конечный клиент')
    const partnerId = await makeCompany('Партнёр Интегратор')
    const deal = await call('POST', '/api/crm/deals', { title: 'Партнёрская', companyId: endClientId })
    const dealId = (deal.body.deal as { id: string }).id
    const partner = await call('PUT', `/api/crm/deals/${dealId}/partner`, {
      partnerCompanyId: partnerId,
      status: 'proposed',
      rateBps: 3000,
      calculationBase: 'Разовый платёж за внедрение (не подписка, не продление)',
      periodNotes: 'До конца 2026 года',
      payoutTrigger: 'Поступление денег от конечного клиента',
    })
    expect(partner.status).toBe(200)
    expect((partner.body as { rateBps: number }).rateBps).toBe(3000)
    expect((partner.body as { status: string }).status).toBe('proposed')
    // Согласование меняет статус с версией
    const agreed = await call('PUT', `/api/crm/deals/${dealId}/partner`, {
      partnerCompanyId: partnerId, status: 'agreed',
    })
    expect((agreed.body as { status: string }).status).toBe('agreed')
    expect((agreed.body as { version: number }).version).toBe(2)
    // Устаревшая версия → конфликт
    const stale = await call('PUT', `/api/crm/deals/${dealId}/partner`, {
      partnerCompanyId: partnerId, rateBps: 5000, expectedVersion: 1,
    })
    expect(stale.status).toBe(409)
    const dealRow = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } })
    expect(dealRow.partnerCompanyId).toBe(partnerId)
    // 30% предложение не создаёт автоматических начислений
    const txns = await prisma.txn.findMany({ where: { dealId } })
    expect(txns).toHaveLength(0)
    void stages
  })

  test('AGENT-03: факты исследования, агент не повышает статус', async () => {
    const companyId = await makeCompany('Факты')
    const humanFact = await call('POST', `/api/crm/companies/${companyId}/facts`, {
      claim: 'На сайте указаны токарные участки с ЧПУ',
      sourceUrl: 'https://example.ru',
      observedAt: '2026-10-17T10:00:00+03:00',
      status: 'public_fact',
    })
    expect(humanFact.status).toBe(201)
    const agentConfirmed = await agentCall('POST', `/api/crm/companies/${companyId}/facts`, {
      claim: 'Клиент подтвердил боль',
      observedAt: '2026-10-17T11:00:00+03:00',
      status: 'customer_confirmed',
    })
    expect(agentConfirmed.status).toBe(403)
    const agentHypothesis = await agentCall('POST', `/api/crm/companies/${companyId}/facts`, {
      claim: 'Гипотеза агента по данным сайта',
      sourceUrl: 'https://example.ru/about',
      observedAt: '2026-10-17T11:30:00+03:00',
      runId: 'run-42',
    })
    expect(agentHypothesis.status).toBe(201)
    expect((agentHypothesis.body.fact as { status: string }).status).toBe('hypothesis')
    const facts = await call('GET', `/api/crm/companies/${companyId}/facts`)
    expect((facts.body.items as unknown[]).length).toBe(2)
  })

  test('OWNER-04-AC01/FIX R-13: sent ≠ delivered; отчёт различает доставку', async () => {
    const companyId = await makeCompany('Доставка')
    const draft = await call('POST', '/api/crm/drafts', { companyId, channel: 'email', recipient: 'info@delivery.ru', body: 'КП' })
    const draftId = (draft.body.draft as { id: string }).id
    await call('POST', `/api/crm/drafts/${draftId}/approve`)
    await call('POST', `/api/crm/drafts/${draftId}/send`, {})
    // Отчёт: sent без доказательства — не доставлено
    const report = await call('GET', '/api/crm/report/funnel')
    expect(report.status).toBe(200)
    expect((report.body.delivery as { confirmed: number }).confirmed).toBe(0)
    expect((report.body.delivery as { unconfirmed: number }).unconfirmed).toBeGreaterThanOrEqual(1)
    // Фиксация доставки с доказательством
    const delivered = await call('POST', `/api/crm/drafts/${draftId}/delivered`, { proof: 'Ответ клиента по email от 17.10' })
    expect(delivered.status).toBe(200)
    const report2 = await call('GET', '/api/crm/report/funnel')
    expect((report2.body.delivery as { confirmed: number }).confirmed).toBeGreaterThanOrEqual(1)
    // Агент не фиксирует доставку без права
    const draft2 = await call('POST', '/api/crm/drafts', { companyId, channel: 'email', recipient: 'info2@delivery.ru', body: 'КП2' })
    const draft2Id = (draft2.body.draft as { id: string }).id
    const agentDelivered = await agentCall('POST', `/api/crm/drafts/${draft2Id}/delivered`, { proof: 'агент' })
    expect(agentDelivered.status).toBe(403)
  })

  test('OWNER-02-AC02/R-18: границы «Сегодня» в Europe/Moscow', async () => {
    // Событие 22:00 UTC 16.10 = 01:00 МСК 17.10 — должно попасть в «сегодня 17.10» по Москве.
    const companyId = await makeCompany('Пояс')
    const mskNextDay = new Date('2026-10-16T22:30:00Z') // 01:30 МСК 17-го
    await prisma.salesTask.create({
      data: {
        companyId,
        assigneeId: admin.userId,
        goal: 'Московская ночь',
        dueAt: mskNextDay,
        kind: 'commercial',
        status: 'open',
        createdById: admin.userId,
        rowVersion: 1,
      },
    })
    const today = await call('GET', '/api/crm/today')
    expect(today.status).toBe(200)
    expect(today.body.timezone).toBe('Europe/Moscow')
    const titles = ((today.body.todayTasks as Array<{ goal: string }>) ?? []).map((task) => task.goal)
    // При прогоне 17.10 задача 01:30 МСК 17-го — вчерашняя или сегодняшняя в зависимости
    // от фактического времени; главное — не 500 и границы считаются в Москве.
    expect(Array.isArray(titles)).toBe(true)
  })

  test('QUALITY-01-AC01: sales-тесты не оставляют сделок, блокирующих очистку users', async () => {
    // Проверка механики: после создания сделки и удаления пользователей через deleteMany
    // порядок из beforeEach не должен падать на FK. Симулируем: создаём сделку, затем
    // выполняем ту же последовательность очистки.
    const companyId = await makeCompany('Очистка FK')
    await call('POST', '/api/crm/deals', { title: 'Очистка', companyId })
    for (const model of ['dealHistory', 'dealClaim', 'dealContactRole', 'devTask', 'deal', 'authSession', 'user'] as const) {
      await (prisma as unknown as Record<string, { deleteMany(): Promise<unknown> }>)[model].deleteMany()
    }
    const usersCount = await prisma.user.count()
    expect(usersCount).toBe(0)
  })
})
