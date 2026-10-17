import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import { disabledEmailDelivery } from '../../email'
import { loadEnv } from '../../env'
import { migrateLegacyCrmData } from '../../../scripts/crm-sales-legacy'

/// Независимые проверки агента B (ТЗ 17.10.2026). Дополняют sales.integration.test.ts
/// тем, что исполнитель не проверил: обход правил PATCH stageId в поздние этапы,
/// идемпотентность move по ключу, override и его аудит, полную матрицу прав агента
/// (включая выдачу прав), переплату/остаток, легаси «Получено», send без approve,
/// незатирание ручных данных импортом, домен группы с разными ИНН, негативные сценарии
/// и расширенную миграцию legacy-данных.

const databaseUrl = process.env.TEST_DATABASE_URL
const maybeDescribe = databaseUrl ? describe : describe.skip

type Ctx = { token: string; userId: string }

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
  return async (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
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
    const parsed = text === '' ? {} : (JSON.parse(text) as Record<string, unknown>)
    return { status: response.status, body: parsed }
  }
}

const RANDOM_UUID = '00000000-0000-4000-8000-000000000000'

maybeDescribe('sales CRM extra checks (agent B, ТЗ 17.10.2026)', () => {
  const env = loadEnv({
    DATABASE_URL: databaseUrl!,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: 'http://localhost:5173',
  })
  const prisma = createPrisma(databaseUrl!)
  const app = createApp({ env, prisma, emailDelivery: disabledEmailDelivery })

  let admin: Ctx
  let agent: Ctx
  let call: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: Record<string, unknown> }>
  let agentCall: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: Record<string, unknown> }>

  beforeEach(async () => {
    await prisma.taskOutbox.deleteMany()
    await prisma.agentOpLog.deleteMany()
    await prisma.idempotencyRecord.deleteMany()
    await prisma.txn.deleteMany()
    await prisma.expectedPayment.deleteMany()
    await prisma.dealHistory.deleteMany()
    await prisma.dealClaim.deleteMany()
    await prisma.dealContactRole.deleteMany()
    await prisma.contactChannel.deleteMany()
    await prisma.activity.deleteMany()
    await prisma.salesTask.deleteMany()
    await prisma.proposalDraft.deleteMany()
    await prisma.pilotCriterion.deleteMany()
    await prisma.pilotMilestone.deleteMany()
    await prisma.pilotEvaluation.deleteMany()
    await prisma.dealLaunch.deleteMany()
    await prisma.companyEvent.deleteMany()
    await prisma.deal.deleteMany()
    await prisma.crmStage.deleteMany()
    await prisma.company.deleteMany()
    await prisma.dealComment.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()

    admin = await registerUser(app, 'owner@example.com')
    const agentRegistration = await registerUser(app, 'agent@example.com')
    await prisma.user.update({
      where: { id: agentRegistration.userId },
      data: { role: 'agent', agentPermissions: [] },
    })
    agent = { token: await login(app, 'agent@example.com'), userId: agentRegistration.userId }
    call = api(app, admin.token)
    agentCall = api(app, agent.token)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function grantAgent(...permissions: string[]) {
    await prisma.user.update({ where: { id: agent.userId }, data: { agentPermissions: permissions } })
  }

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

  async function createCompany(name: string, extra: Record<string, unknown> = {}) {
    const response = await call('POST', '/api/crm/companies', { name, ...extra })
    return (response.body.company as { id: string }).id
  }

  async function createDeal(companyId: string | null, extra: Record<string, unknown> = {}) {
    const response = await call('POST', '/api/crm/deals', { title: 'Сделка B', companyId, ...extra })
    return (response.body.deal as { id: string }).id
  }

  async function historyEntries(dealId: string) {
    const response = await call('GET', `/api/crm/deals/${dealId}/history`)
    return response.body.entries as Array<{
      event: string
      toStageId: string | null
      fromStageId: string | null
      reason: string | null
      overrideReason: string | null
      actorKind: string
      legacy: boolean
    }>
  }

  // --------------------------------------------------------------------------- CRM-06

  test('CRM-06-AC01 extra: PATCH stageId cannot bypass rules for qualified/proposal/won', async () => {
    const stages = await createStages()
    const companyId = await createCompany('Обход PATCH')
    const dealId = await createDeal(companyId, { stageId: stages.intake.id })

    const toQualified = await call('PATCH', `/api/crm/deals/${dealId}`, { stageId: stages.qualified.id })
    expect(toQualified.status).toBe(400)

    const toProposal = await call('PATCH', `/api/crm/deals/${dealId}`, { stageId: stages.proposal.id })
    expect(toProposal.status).toBe(400)

    const toWon = await call('PATCH', `/api/crm/deals/${dealId}`, { stageId: stages.won.id })
    expect(toWon.status).toBe(400)

    const detail = await call('GET', `/api/crm/deals/${dealId}`)
    expect((detail.body.deal as { stageId: string }).stageId).toBe(stages.intake.id)
    // Ни одного события истории при отклонённых обходах.
    const entries = await historyEntries(dealId)
    expect(entries.filter((entry) => entry.event === 'moved').length).toBe(0)
  })

  test('CRM-06/8.2: move idempotency by key — same payload replays, different payload conflicts', async () => {
    const stages = await createStages()
    const companyId = await createCompany('Идемпотентность move')
    const dealId = await createDeal(companyId, { stageId: stages.intake.id })
    const key = { 'Idempotency-Key': 'move-b-1' }
    const payload = { stageId: stages.dialogue.id, position: 0 }

    const first = await call('POST', `/api/crm/deals/${dealId}/move`, payload, key)
    expect(first.status).toBe(200)
    const second = await call('POST', `/api/crm/deals/${dealId}/move`, payload, key)
    expect(second.status).toBe(200)
    expect((second.body.deal as { id: string }).id).toBe((first.body.deal as { id: string }).id)

    const moved = (await historyEntries(dealId)).filter(
      (entry) => entry.event === 'moved' && entry.toStageId === stages.dialogue.id,
    )
    expect(moved.length).toBe(1)

    // Тот же ключ с другой нагрузкой — конфликт, а не вторая запись.
    const conflict = await call('POST', `/api/crm/deals/${dealId}/move`, {
      stageId: stages.dialogue.id,
      position: 3,
    }, key)
    expect(conflict.status).toBe(409)
  })

  test('CRM-06: human override with reason passes and is audited in history', async () => {
    const stages = await createStages()
    const companyId = await createCompany('Override человеком')
    const dealId = await createDeal(companyId, { stageId: stages.intake.id })

    const overridden = await call('POST', `/api/crm/deals/${dealId}/move`, {
      stageId: stages.qualified.id,
      position: 0,
      overrideReason: 'Владелец процесса подтвердил задачу лично вне CRM',
    })
    expect(overridden.status).toBe(200)
    const entry = (await historyEntries(dealId)).find(
      (item) => item.event === 'moved' && item.toStageId === stages.qualified.id,
    )
    expect(entry).toBeDefined()
    expect(entry!.overrideReason).toBe('Владелец процесса подтвердил задачу лично вне CRM')
  })

  test('CRM-06/8.6: agent cannot override mandatory transition conditions (TZ §6: только уполномоченный человек)', async () => {
    const stages = await createStages()
    const companyId = await createCompany('Override агентом')
    const dealId = await createDeal(companyId, { stageId: stages.intake.id })

    const agentOverride = await agentCall('POST', `/api/crm/deals/${dealId}/move`, {
      stageId: stages.qualified.id,
      position: 0,
      overrideReason: 'Модель считает задачу подтверждённой',
    })
    // ТЗ v2 FIX-01-AC02: агентский override — 403 (гейт до проверки условий).
    expect([400, 403]).toContain(agentOverride.status)
    const detail = await call('GET', `/api/crm/deals/${dealId}`)
    expect((detail.body.deal as { stageId: string }).stageId).toBe(stages.intake.id)
  })

  test('CRM-06/8.2: stale expectedVersion on move does not lose fresh data', async () => {
    const stages = await createStages()
    const companyId = await createCompany('Версия на move')
    const dealId = await createDeal(companyId, { stageId: stages.intake.id })
    await call('PATCH', `/api/crm/deals/${dealId}`, { note: 'Свежая заметка' })
    const stale = await call('POST', `/api/crm/deals/${dealId}/move`, {
      stageId: stages.dialogue.id,
      position: 0,
      expectedVersion: 1,
    })
    expect(stale.status).toBe(409)
    const detail = await call('GET', `/api/crm/deals/${dealId}`)
    expect((detail.body.deal as { note: string | null }).note).toBe('Свежая заметка')
    expect((detail.body.deal as { stageId: string }).stageId).toBe(stages.intake.id)
  })

  // --------------------------------------------------------------------------- CRM-08

  test('CRM-08-AC03 extra: agent pricing/subscription/draft-approve/channel-confirm all refused without permissions', async () => {
    const stages = await createStages()
    const companyId = await createCompany('Права агента B')
    const dealId = await createDeal(companyId, { monthlyAmount: 10_000 })

    // Черновик по сделке: агент не может его одобрить (draft.approve).
    const draft = await call('POST', '/api/crm/drafts', {
      companyId,
      dealId,
      channel: 'email',
      recipient: 'b@b.ru',
      subject: 'КП',
      body: 'Условия',
    })
    const draftId = (draft.body.draft as { id: string }).id
    const agentApprove = await agentCall('POST', `/api/crm/drafts/${draftId}/approve`)
    expect(agentApprove.status).toBe(403)

    // Цена утверждена человеком (draft approved) — теперь изменение цены агентом
    // без права pricing.change — отказ.
    await call('POST', `/api/crm/drafts/${draftId}/review`)
    await call('POST', `/api/crm/drafts/${draftId}/approve`)

    // Изменение утверждённой цены агентом — отказ (pricing.change).
    const priceChange = await agentCall('PATCH', `/api/crm/deals/${dealId}`, { monthlyAmount: 99_000 })
    expect(priceChange.status).toBe(403)

    // Фиксация отправки агентом — отказ.
    const agentSend = await agentCall('POST', `/api/crm/drafts/${draftId}/send`)
    expect(agentSend.status).toBe(403)

    // Управление подпиской агентом — отказ (subscription.manage).
    const agentSubscription = await agentCall('POST', `/api/finance/deals/${dealId}/subscription`, {
      status: 'active',
      startsOn: '2026-10-01',
      overrideReason: 'Агент активировал сам',
    })
    expect(agentSubscription.status).toBe(403)

    // Подтверждение канала контакта агентом — отказ (claim.confirm).
    const contact = await call('POST', '/api/crm/contacts', { companyId, name: 'Контакт' })
    const contactId = (contact.body.contact as { id: string }).id
    const agentChannel = await agentCall('POST', `/api/crm/contacts/${contactId}/channels`, {
      kind: 'email',
      value: 'x@y.ru',
      status: 'confirmed',
    })
    expect(agentChannel.status).toBe(403)

    // Удаление сделки агентом — отказ (deal.delete) — повтор независимой проверкой.
    const agentDelete = await agentCall('DELETE', `/api/crm/deals/${dealId}`)
    expect(agentDelete.status).toBe(403)

    void stages
  })

  test('CRM-08: granting agentPermissions removes the refusal for that operation only', async () => {
    const stages = await createStages()
    const companyId = await createCompany('Выдача прав')
    const contact = await call('POST', '/api/crm/contacts', { companyId, name: 'Владелец' })
    const contactId = (contact.body.contact as { id: string }).id
    const dealId = await createDeal(companyId, { monthlyAmount: 5_000 })

    // claim.confirm: до выдачи — отказ, после — успех.
    const before = await agentCall('PUT', `/api/crm/deals/${dealId}/claims`, {
      fieldKey: 'problem',
      status: 'customer_confirmed',
      source: 'звонок',
    })
    expect(before.status).toBe(403)
    await grantAgent('claim.confirm')
    const after = await agentCall('PUT', `/api/crm/deals/${dealId}/claims`, {
      fieldKey: 'problem',
      status: 'customer_confirmed',
      source: 'звонок',
    })
    expect(after.status).toBe(200)

    // Право не шире выданного: won без won.confirm — всё ещё отказ.
    await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'consequences', status: 'customer_confirmed' })
    await call('PUT', `/api/crm/deals/${dealId}/contact-roles`, { contactId, role: 'process_owner' })
    await call('PATCH', `/api/crm/deals/${dealId}`, { wonBasis: 'Договор' })
    const wonRefused = await agentCall('POST', `/api/crm/deals/${dealId}/move`, {
      stageId: stages.won.id,
      position: 0,
    })
    expect(wonRefused.status).toBe(403)

    await grantAgent('claim.confirm', 'won.confirm')
    const wonAllowed = await agentCall('POST', `/api/crm/deals/${dealId}/move`, {
      stageId: stages.won.id,
      position: 0,
    })
    expect(wonAllowed.status).toBe(200)

    // finance.confirm: поступление агентом после выдачи права проходит.
    const expected = await call('POST', '/api/finance/expected', {
      title: 'Счёт B',
      amount: 10_000,
      dueDate: '2026-10-10',
      dealId,
    })
    const paymentId = (expected.body.payment as { id: string }).id
    const receiptRefused = await agentCall('POST', `/api/finance/expected/${paymentId}/receipts`, {
      amount: 10_000,
      actualReceivedOn: '2026-10-17',
    })
    expect(receiptRefused.status).toBe(403)
    await grantAgent('claim.confirm', 'won.confirm', 'finance.confirm')
    const receiptAllowed = await agentCall('POST', `/api/finance/expected/${paymentId}/receipts`, {
      amount: 10_000,
      actualReceivedOn: '2026-10-17',
    })
    expect(receiptAllowed.status).toBe(201)
  })

  test('CRM-08: agent pricing.change permission allows price edit with approved draft', async () => {
    await createStages()
    const companyId = await createCompany('Право pricing')
    const dealId = await createDeal(companyId, { monthlyAmount: 10_000 })
    const draft = await call('POST', '/api/crm/drafts', {
      companyId,
      dealId,
      channel: 'email',
      recipient: 'p@p.ru',
      subject: 'КП',
      body: 'Условия',
    })
    const draftId = (draft.body.draft as { id: string }).id
    await call('POST', `/api/crm/drafts/${draftId}/review`)
    await call('POST', `/api/crm/drafts/${draftId}/approve`)

    const refused = await agentCall('PATCH', `/api/crm/deals/${dealId}`, { monthlyAmount: 20_000 })
    expect(refused.status).toBe(403)
    await grantAgent('pricing.change')
    const allowed = await agentCall('PATCH', `/api/crm/deals/${dealId}`, { monthlyAmount: 20_000 })
    expect(allowed.status).toBe(200)
    expect((allowed.body.deal as { monthlyAmount: number }).monthlyAmount).toBe(20_000)
  })

  // --------------------------------------------------------------------------- CRM-10

  test('CRM-10 extra: send without approve refused; second send refused; sent not cancellable', async () => {
    await createStages()
    const companyId = await createCompany('Черновики B')
    const dealId = await createDeal(companyId)
    const draft = await call('POST', '/api/crm/drafts', {
      companyId,
      dealId,
      channel: 'email',
      recipient: 'send@test.ru',
      subject: 'Тема',
      body: 'Текст',
    })
    const draftId = (draft.body.draft as { id: string }).id

    // send без approve — отказ.
    const earlySend = await call('POST', `/api/crm/drafts/${draftId}/send`)
    expect(earlySend.status).toBe(409)

    // review → правка текста сбрасывает review до draft.
    await call('POST', `/api/crm/drafts/${draftId}/review`)
    const edited = await call('PATCH', `/api/crm/drafts/${draftId}`, { body: 'Изменённый текст' })
    expect((edited.body.draft as { status: string }).status).toBe('draft')

    // approve → send проходит один раз.
    await call('POST', `/api/crm/drafts/${draftId}/approve`)
    const sent = await call('POST', `/api/crm/drafts/${draftId}/send`, { externalMessageId: 'msg-1' })
    expect(sent.status).toBe(200)
    expect((sent.body.draft as { status: string }).status).toBe('sent')
    expect((sent.body.draft as { sentAt: string | null }).sentAt).not.toBeNull()

    // Повторная фиксация отправки той же версии — отказ (фикция отправки не создаётся).
    const secondSend = await call('POST', `/api/crm/drafts/${draftId}/send`)
    expect(secondSend.status).toBe(409)

    // Отправленная версия не отменяется.
    const cancelSent = await call('POST', `/api/crm/drafts/${draftId}/cancel`, { reason: 'Передумали' })
    expect(cancelSent.status).toBe(409)
  })

  // --------------------------------------------------------------------------- CRM-11

  test('CRM-11/8.4 extra: overpayment rejected, remainder never negative, state unchanged', async () => {
    const stages = await createStages()
    const companyId = await createCompany('Переплата')
    const dealId = await createDeal(companyId, { monthlyAmount: 1_000 })
    const expected = await call('POST', '/api/finance/expected', {
      title: 'Счёт переплата',
      amount: 100_000,
      dueDate: '2026-10-10',
      dealId,
    })
    const paymentId = (expected.body.payment as { id: string }).id

    const partial = await call('POST', `/api/finance/expected/${paymentId}/receipts`, {
      amount: 40_000,
      actualReceivedOn: '2026-10-17',
    })
    expect(partial.status).toBe(201)

    // Поступление больше остатка — отказ; остаток не уходит в минус.
    const over = await call('POST', `/api/finance/expected/${paymentId}/receipts`, {
      amount: 70_000,
      actualReceivedOn: '2026-10-18',
    })
    expect(over.status).toBe(409)

    // Флаг allowOverpayment — это и есть отдельная явная операция переплаты (§8.4,
    // починка DEFECT-B3): поступление проводится, остаток зажат в 0 (не отрицательный).
    const overWithFlag = await call('POST', `/api/finance/expected/${paymentId}/receipts`, {
      amount: 70_000,
      actualReceivedOn: '2026-10-18',
      allowOverpayment: true,
    })
    expect(overWithFlag.status).toBe(201)
    expect((overWithFlag.body.receipt as { remainingAmount: number }).remainingAmount).toBe(0)
    expect((overWithFlag.body.receipt as { status: string }).status).toBe('received')

    // Итоговое состояние: переплата зафиксирована, обязательство закрыто, остаток 0.
    const list = await call('GET', '/api/finance/expected')
    const row = (list.body.items as Array<{ id: string; receivedAmount: number; remainingAmount: number; status: string }>).find(
      (item) => item.id === paymentId,
    )
    expect(row!.receivedAmount).toBe(110_000)
    expect(row!.remainingAmount).toBe(0)
    expect(row!.status).toBe('received')
    const txns = await call('GET', '/api/finance/txns')
    const amounts = (txns.body.items as Array<{ amount: number }>).filter((item) => item.amount === 40_000 || item.amount === 70_000)
    expect(amounts.length).toBe(2)
    void stages
  })

  test('CRM-11 extra: legacy «received» endpoint closes remainder by fact date and keeps the obligation', async () => {
    await createStages()
    const companyId = await createCompany('Легаси получено')
    const dealId = await createDeal(companyId)
    const expected = await call('POST', '/api/finance/expected', {
      title: 'Счёт легаси',
      amount: 50_000,
      dueDate: '2026-10-10',
      dealId,
    })
    const paymentId = (expected.body.payment as { id: string }).id
    // Частичная оплата новым маршрутом…
    await call('POST', `/api/finance/expected/${paymentId}/receipts`, {
      amount: 20_000,
      actualReceivedOn: '2026-10-16',
    })
    // …и догашивание легаси-кнопкой «Получено».
    const legacy = await call('POST', `/api/finance/expected/${paymentId}/received`)
    expect(legacy.status).toBe(204)

    const list = await call('GET', '/api/finance/expected')
    const row = (list.body.items as Array<{ id: string; receivedAmount: number; status: string }>).find(
      (item) => item.id === paymentId,
    )
    expect(row).toBeDefined()
    expect(row!.receivedAmount).toBe(50_000)
    expect(row!.status).toBe('received')
  })

  test('CRM-11 extra: subscription activation requires won or explicit override; MRR follows subscription only', async () => {
    const stages = await createStages()
    const companyId = await createCompany('Подписка B')
    const dealId = await createDeal(companyId, { monthlyAmount: 7_000 })

    // Без won активация требует явное основание.
    const noBasis = await call('POST', `/api/finance/deals/${dealId}/subscription`, {
      status: 'active',
      startsOn: '2026-10-01',
    })
    expect(noBasis.status).toBe(400)
    const withOverride = await call('POST', `/api/finance/deals/${dealId}/subscription`, {
      status: 'active',
      startsOn: '2026-10-01',
      overrideReason: 'Договор действовал до внедрения CRM',
    })
    expect(withOverride.status).toBe(200)

    let summary = await call('GET', '/api/finance/summary')
    expect(summary.body.mrr).toBe(7_000)

    // Выигрыш сам по себе не включает MRR: вторая сделка на won без активации.
    const deal2 = await createDeal(companyId, { monthlyAmount: 9_000 })
    const contact = await call('POST', '/api/crm/contacts', { companyId, name: 'Владелец' })
    await call('PUT', `/api/crm/deals/${deal2}/claims`, { fieldKey: 'problem', status: 'customer_confirmed' })
    await call('PUT', `/api/crm/deals/${deal2}/claims`, { fieldKey: 'consequences', status: 'customer_confirmed' })
    await call('PUT', `/api/crm/deals/${deal2}/contact-roles`, {
      contactId: (contact.body.contact as { id: string }).id,
      role: 'process_owner',
    })
    await call('PATCH', `/api/crm/deals/${deal2}`, { wonBasis: 'Договор' })
    const won = await call('POST', `/api/crm/deals/${deal2}/move`, { stageId: stages.won.id, position: 0 })
    expect(won.status).toBe(200)
    summary = await call('GET', '/api/finance/summary')
    expect(summary.body.mrr).toBe(7_000)
  })

  // --------------------------------------------------------------------------- CRM-01 / 8.1

  test('8.1 extra: import update does not overwrite manual values (region asserted)', async () => {
    const payload = {
      version: 1,
      updated_at: '2026-10-17',
      accounts: [
        {
          id: 'b-manual',
          company_name: 'Ручное значение',
          official_domain: 'manual.ru',
          region: 'Импортный регион',
          segment_hypothesis: 'Сегмент из импорта',
          contacts: [],
          outbound_drafts: [],
        },
      ],
    }
    await call('POST', '/api/crm/import/apply', {
      payload,
      decisions: [{ externalId: 'pipeline:b-manual', action: 'create' }],
    })
    const companies = await call('GET', '/api/crm/companies?limit=100')
    const created = (companies.body.items as Array<{ id: string; name: string }>).find(
      (item) => item.name === 'Ручное значение',
    )!
    // Ручная правка после импорта.
    await call('PATCH', `/api/crm/companies/${created.id}`, { region: 'Свой регион' })

    // Повторный импорт с update: ручное region не затирается импортным.
    const update = await call('POST', '/api/crm/import/apply', {
      payload,
      decisions: [{ externalId: 'pipeline:b-manual', action: 'update' }],
    })
    expect(update.status).toBe(200)
    const after = await call('GET', `/api/crm/companies/${created.id}`)
    expect((after.body.company as { region: string | null }).region).toBe('Свой регион')
    // Дубликата нет.
    const list = await call('GET', '/api/crm/companies?limit=100')
    const sameName = (list.body.items as Array<{ name: string }>).filter((item) => item.name === 'Ручное значение')
    expect(sameName.length).toBe(1)
  })

  test('CRM-01-AC03 extra: same domain with different INNs is never silently merged by import', async () => {
    await createCompany('Юрлицо Альфа', { website: 'https://group-b.ru', inn: '1111111111' })
    await createCompany('Юрлицо Бета', { website: 'https://group-b.ru', inn: '2222222222' })

    const payload = {
      version: 1,
      updated_at: '2026-10-17',
      accounts: [
        { id: 'grp-new', company_name: 'Группа Новый', official_domain: 'group-b.ru', contacts: [], outbound_drafts: [] },
      ],
    }
    const preview = await call('POST', '/api/crm/import/preview', payload)
    expect(preview.status).toBe(200)
    const item = (preview.body.items as Array<{ externalId: string; match: { companyId: string | null } }>)[0]!

    const apply = await call('POST', '/api/crm/import/apply', {
      payload,
      decisions: [{ externalId: 'pipeline:grp-new', action: 'update' }],
    })
    expect(apply.status).toBe(200)

    // Ни одна из двух компаний не изменена и не слита: обе на месте со своими ИНН.
    const list = await call('GET', '/api/crm/companies?limit=100')
    const items = list.body.items as Array<{ name: string; inn: string | null }>
    const alpha = items.find((row) => row.name === 'Юрлицо Альфа')
    const beta = items.find((row) => row.name === 'Юрлицо Бета')
    expect(alpha).toBeDefined()
    expect(beta).toBeDefined()
    expect(alpha!.inn).toBe('1111111111')
    expect(beta!.inn).toBe('2222222222')
    expect((items).filter((row) => row.name === 'Юрлицо Альфа' || row.name === 'Юрлицо Бета').length).toBe(2)
    // Третьей компании из кандидата не появилось без явного решения create.
    expect(items.find((row) => row.name === 'Группа Новый')).toBeUndefined()
    void item
  })

  test('8.1 extra: invalid account (empty name) is reported and skipped', async () => {
    const payload = {
      version: 1,
      updated_at: '2026-10-17',
      accounts: [{ id: 'bad-1', company_name: '   ', contacts: [], outbound_drafts: [] }],
    }
    const preview = await call('POST', '/api/crm/import/preview', payload)
    expect(preview.status).toBe(200)
    expect(preview.body.summary).toMatchObject({ total: 1, invalid: 1, create: 0 })
    const apply = await call('POST', '/api/crm/import/apply', {
      payload,
      decisions: [{ externalId: 'pipeline:bad-1', action: 'create' }],
    })
    expect(apply.status).toBe(200)
    const list = await call('GET', '/api/crm/companies?limit=100')
    expect((list.body.items as unknown[]).length).toBe(0)
  })

  // --------------------------------------------------------------------------- Негативные сценарии

  test('negative: unauthorized, invalid payloads, missing ids, cross-company mismatch', async () => {
    // Без токена — 401.
    const anonymous = await app.request('/api/crm/companies')
    expect(anonymous.status).toBe(401)

    // Невалидные payload'ы — 400.
    const noName = await call('POST', '/api/crm/companies', { region: 'без названия' })
    expect(noName.status).toBe(400)
    const badAmount = await call('POST', '/api/crm/deals', { title: 'X', monthlyAmount: 'много' })
    expect(badAmount.status).toBe(400)
    const badTask = await call('POST', '/api/crm/tasks', {
      companyId: null,
      assigneeId: admin.userId,
      goal: 'Цель',
      dueAt: 'не дата',
    })
    expect(badTask.status).toBe(400)
    const badDnc = await call('POST', `/api/crm/companies/${RANDOM_UUID}/dnc`, { reason: '' })
    expect(badDnc.status).toBe(400)

    // Несуществующие ID — 404.
    const missingCompany = await call('GET', `/api/crm/companies/${RANDOM_UUID}`)
    expect(missingCompany.status).toBe(404)
    const missingDeal = await call('GET', `/api/crm/deals/${RANDOM_UUID}`)
    expect(missingDeal.status).toBe(404)
    const missingTaskCompany = await call('POST', '/api/crm/tasks', {
      companyId: RANDOM_UUID,
      assigneeId: admin.userId,
      goal: 'Цель',
      dueAt: '2026-10-20T10:00:00+03:00',
    })
    expect(missingTaskCompany.status).toBe(404)
    const missingDraftCompany = await call('POST', '/api/crm/drafts', {
      companyId: RANDOM_UUID,
      channel: 'email',
      recipient: 'a@b.ru',
      body: 'текст',
    })
    expect(missingDraftCompany.status).toBe(404)
    const missingReceipt = await call('POST', `/api/finance/expected/${RANDOM_UUID}/receipts`, {
      amount: 100,
      actualReceivedOn: '2026-10-17',
    })
    expect(missingReceipt.status).toBe(404)

    // Чужая компания: активность со сделкой другой компании — 400.
    const stages = await createStages()
    const companyA = await createCompany('Компания А')
    const companyB = await createCompany('Компания Б')
    const dealA = await createDeal(companyA, { stageId: stages.intake.id })
    const mismatch = await call('POST', '/api/crm/activities', {
      companyId: companyB,
      dealId: dealA,
      occurredAt: '2026-10-17T10:00:00+03:00',
      channel: 'call',
      actionType: 'conversation',
      direction: 'outbound',
    })
    expect(mismatch.status).toBe(400)

    // Move на несуществующий этап — 404.
    const dealB = await createDeal(companyB, { stageId: stages.intake.id })
    const missingStage = await call('POST', `/api/crm/deals/${dealB}/move`, { stageId: RANDOM_UUID, position: 0 })
    expect(missingStage.status).toBe(404)
  })

  // --------------------------------------------------------------------------- CRM-06-AC06 / 8.8 (расширение E2E-16)

  test('migration extra: deal without company gets one; new-format history is not marked legacy; idempotent rerun', async () => {
    const stage = await prisma.crmStage.create({
      data: { title: 'Старый этап', position: 0, isWon: false, isLost: false, code: '', semanticType: 'other' },
    })
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@example.com' } })
    // Сделка без компании, со строковым контактом — как до доработки.
    const deal = await prisma.deal.create({
      data: {
        title: 'Старая фирма',
        contactName: 'Пётр Старый',
        contactPhone: '+7 900 555-66-77',
        stageId: stage.id,
        position: 0,
        createdById: user.id,
        monthlyAmount: 15_000,
      },
    })
    await prisma.dealHistory.create({ data: { dealId: deal.id, fromStage: null, toStage: 'Старый этап' } })

    const first = await migrateLegacyCrmData(prisma)
    expect(first.companiesCreatedFromDeals).toBe(1)
    expect(first.dealsOwnerBackfilled).toBe(1)
    expect(first.legacyContactsCreated).toBe(1)
    expect(first.legacyChannelsCreated).toBe(1)
    expect(first.historyRowsMarkedLegacy).toBe(1)

    // Компания создана из заголовка и связана; сделка сохранила суммы и контакт-оригинал.
    const dealAfter = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })
    expect(dealAfter.companyId).not.toBeNull()
    expect(dealAfter.monthlyAmount).toBe(15_000)
    expect(dealAfter.contactName).toBe('Пётр Старый')
    const company = await prisma.company.findUniqueOrThrow({ where: { id: dealAfter.companyId! } })
    expect(company.name).toBe('Старая фирма')

    // Новый формат истории (initial_entry со stageId) не помечается legacy.
    const stages = await createStages()
    const freshCompanyId = await createCompany('Новая фирма')
    const fresh = await call('POST', '/api/crm/deals', { title: 'Новая сделка', companyId: freshCompanyId, stageId: stages.intake.id })
    const freshDealId = (fresh.body.deal as { id: string }).id
    const rerun = await migrateLegacyCrmData(prisma)
    expect(rerun.historyRowsMarkedLegacy).toBe(0)
    const freshHistory = await prisma.dealHistory.findFirstOrThrow({ where: { dealId: freshDealId } })
    expect(freshHistory.legacy).toBe(false)
    expect(freshHistory.toStageId).not.toBeNull()

    // Повторные запуски идемпотентны: второй прогон кодирует созданные между прогонами
    // новые этапы (их code пуст), третий — уже полностью пуст.
    const thirdRun = await migrateLegacyCrmData(prisma)
    expect(thirdRun.alreadyApplied).toBe(true)

    // Канал legacy-контакта не подтверждён.
    const legacyContact = await prisma.contact.findFirstOrThrow({ where: { isLegacy: true } })
    expect(legacyContact.status).toBe('published')
    const channel = await prisma.contactChannel.findFirstOrThrow({ where: { contactId: legacyContact.id } })
    expect(channel.status).not.toBe('confirmed')
  })

  // ------------------------------------------------- Цикл 3: перепроверка фиксов D2/D5/D6/D8 (агент B)

  test('D6 extra: same domain with different verified INNs creates both without the flag', async () => {
    const first = await call('POST', '/api/crm/companies', {
      name: 'Юрлицо Гамма', website: 'https://group-g.ru', inn: '7700000001',
    })
    expect(first.status).toBe(201)
    // Разные проверенные ИНН = разные юрлица группы: флаг не нужен.
    const second = await call('POST', '/api/crm/companies', {
      name: 'Юрлицо Дельта', website: 'https://group-g.ru', inn: '7700000002',
    })
    expect(second.status).toBe(201)
    const list = await call('GET', '/api/crm/companies?search=group-g')
    const items = list.body.items as Array<{ name: string; inn: string | null }>
    expect(items.length).toBe(2)
    expect(new Set(items.map((item) => item.inn))).toEqual(new Set(['7700000001', '7700000002']))

    // У существующей компании ИНН неизвестен (null): домен остаётся сигналом дубля —
    // даже при новом проверенном ИНН требуется явное подтверждение.
    const bare = await call('POST', '/api/crm/companies', { name: 'Площадка без ИНН', website: 'https://group-h.ru' })
    expect(bare.status).toBe(201)
    const unverified = await call('POST', '/api/crm/companies', {
      name: 'Новое юрлицо на том же домене', website: 'https://group-h.ru', inn: '7700000003',
    })
    expect(unverified.status).toBe(409)
  })

  test('D8 extra: successful PATCH with stageId saves fields and transition atomically', async () => {
    const stages = await createStages()
    const companyId = await createCompany('Атомарность успех')
    await call('POST', '/api/crm/deals', { title: 'Наполнение', companyId })
    const contact = await call('POST', '/api/crm/contacts', { companyId, name: 'Владелец' })
    const contactId = (contact.body.contact as { id: string }).id
    const dealId = await createDeal(companyId, { stageId: stages.intake.id })
    await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'problem', status: 'customer_confirmed', source: 'звонок' })
    await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'consequences', status: 'customer_confirmed', source: 'звонок' })
    await call('PUT', `/api/crm/deals/${dealId}/contact-roles`, { contactId, role: 'process_owner' })
    await call('PATCH', `/api/crm/deals/${dealId}`, {
      problemStatement: 'Заказ висит между участками',
      consequences: 'Срыв сроков',
      nextAgreedStep: 'Демо',
    })

    const before = await call('GET', `/api/crm/deals/${dealId}`)
    const versionBefore = (before.body.deal as { version: number }).version

    const patched = await call('PATCH', `/api/crm/deals/${dealId}`, {
      stageId: stages.qualified.id,
      note: 'Заметка вместе с переходом',
    })
    expect(patched.status).toBe(200)
    const detail = await call('GET', `/api/crm/deals/${dealId}`)
    const deal = detail.body.deal as { note: string | null; stageId: string; version: number }
    expect(deal.note).toBe('Заметка вместе с переходом')
    expect(deal.stageId).toBe(stages.qualified.id)
    // Одна транзакция: версия выросла один раз (а не отдельными правкой поля и переходом).
    expect(deal.version).toBe(versionBefore + 1)
    const moved = (await historyEntries(dealId)).filter(
      (entry) => entry.event === 'moved' && entry.toStageId === stages.qualified.id,
    )
    expect(moved.length).toBe(1)

    // Stale expectedVersion при PATCH со stageId: поля не сохраняются.
    const stale = await call('PATCH', `/api/crm/deals/${dealId}`, {
      stageId: stages.dialogue.id,
      note: 'Не должна сохраниться',
      expectedVersion: 1,
    })
    expect(stale.status).toBe(409)
    const after = await call('GET', `/api/crm/deals/${dealId}`)
    const dealAfter = after.body.deal as { note: string | null; stageId: string }
    expect(dealAfter.note).toBe('Заметка вместе с переходом')
    expect(dealAfter.stageId).toBe(stages.qualified.id)
  })

  test('D5: funnel report filters channel and offerVersion from actual data', async () => {
    const stages = await createStages()
    const companyId = await createCompany('Фильтры отчёта')
    const contact = await call('POST', '/api/crm/contacts', { companyId, name: 'Владелец' })
    const contactId = (contact.body.contact as { id: string }).id

    const qualify = async (dealId: string) => {
      await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'problem', status: 'customer_confirmed' })
      await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'consequences', status: 'customer_confirmed' })
      await call('PUT', `/api/crm/deals/${dealId}/contact-roles`, { contactId, role: 'process_owner' })
    }

    const dealA = await createDeal(companyId, { stageId: stages.intake.id, title: 'Письменная сделка' })
    await qualify(dealA)
    await call('POST', '/api/crm/activities', {
      companyId,
      dealId: dealA,
      occurredAt: '2026-10-17T10:00:00+03:00',
      channel: 'email',
      actionType: 'message_sent',
      direction: 'outbound',
    })
    await call('POST', '/api/crm/drafts', {
      companyId,
      dealId: dealA,
      channel: 'email',
      recipient: 'filter@test.ru',
      subject: 'КП',
      body: 'Текст',
      productClaimsVersion: 'offer-v1',
    })

    const dealB = await createDeal(companyId, { stageId: stages.intake.id, title: 'Звонковая сделка' })
    await qualify(dealB)
    await call('POST', '/api/crm/activities', {
      companyId,
      dealId: dealB,
      occurredAt: '2026-10-17T11:00:00+03:00',
      channel: 'call',
      actionType: 'conversation',
      direction: 'outbound',
    })

    const all = await call('GET', '/api/crm/report/funnel')
    expect(all.body.opportunities).toBe(2)

    const byEmail = await call('GET', '/api/crm/report/funnel?channel=email')
    expect(byEmail.body.opportunities).toBe(1)

    // Каналы сделок — это каналы взаимодействий (call/email/telegram/meeting/other).
    // ТЗ §8.3: канал должен существовать в данных, а не быть неработающим фильтром.
    // DEFECT-B4: фильтр валидируется channelKindSchema (email/phone/telegram/other):
    // 'call' и 'meeting' отклоняются 400, 'phone' молча возвращает пустоту.
    const byCall = await call('GET', '/api/crm/report/funnel?channel=call')
    expect(byCall.status).toBe(200)
    expect(byCall.body.opportunities).toBe(1)

    const byOffer = await call('GET', '/api/crm/report/funnel?offerVersion=offer-v1')
    expect(byOffer.body.opportunities).toBe(1)

    const byMissingOffer = await call('GET', '/api/crm/report/funnel?offerVersion=offer-v9')
    expect(byMissingOffer.body.opportunities).toBe(0)
  })
})
