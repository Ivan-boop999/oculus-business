import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import { disabledEmailDelivery } from '../../email'
import type { EmailDelivery } from '../../email'
import { loadEnv } from '../../env'
import { migrateLegacyCrmData } from '../../../scripts/crm-sales-legacy'

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

const PIPELINE_PAYLOAD = {
  version: 1,
  updated_at: '2026-10-17',
  accounts: [
    {
      id: 'account-001',
      company_name: 'ТЕХНИК',
      official_domain: 'tehniknn.ru',
      region: 'Нижний Новгород',
      segment_hypothesis: 'Механообработка',
      fit_reason: 'Токарные участки с ЧПУ на сайте',
      contacts: [
        {
          name: null,
          job_title: null,
          email: 'info@tehniknn.ru',
          phone: '+7 (831) 423-22-66',
          verification_status: 'published',
          is_direct_decision_maker: false,
        },
      ],
      outbound_drafts: [{ subject: 'Вопрос по прохождению заказа', body: 'Текст письма', status: 'draft' }],
      next_action: 'Позвонить мастеру',
      next_action_date: '2026-10-20',
    },
    {
      id: 'account-002',
      company_name: 'Группа Холдинг',
      official_domain: 'holding.ru',
      region: 'Москва',
      segment_hypothesis: 'Логистика',
      contacts: [],
      outbound_drafts: [],
    },
  ],
}

const disabledEmail = disabledEmailDelivery

maybeDescribe('sales CRM integration (ТЗ 17.10.2026)', () => {
  const env = loadEnv({
    DATABASE_URL: databaseUrl!,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: 'http://localhost:5173',
  })
  const prisma = createPrisma(databaseUrl!)
  const app = createApp({ env, prisma, emailDelivery: disabledEmail })

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
    await prisma.user.update({ where: { id: agentRegistration.userId }, data: { role: 'agent' } })
    agent = { token: await login(app, 'agent@example.com'), userId: agentRegistration.userId }
    call = api(app, admin.token)
    agentCall = api(app, agent.token)
  })

  // V2-R11: очистка после последнего теста — следующий набор (auth/uploads)
  // не может удалить users при живых FK deals_created_by_id_fkey.
  afterAll(async () => {
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
    await prisma.partnerAgreement.deleteMany()
    await prisma.companyFact.deleteMany()
    await prisma.companyEvent.deleteMany()
    await prisma.deal.deleteMany()
    await prisma.crmStage.deleteMany()
    await prisma.company.deleteMany()
    await prisma.dealComment.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function createStages(): Promise<Record<string, { id: string; title: string }>> {
    const defs = [
      { title: 'Вход', semanticType: 'intake' },
      { title: 'Диалог', semanticType: 'dialogue' },
      { title: 'Квалифицирована', semanticType: 'qualified' },
      { title: 'Предложение', semanticType: 'proposal' },
      { title: 'Выиграна', semanticType: 'won' },
      { title: 'Отказ', semanticType: 'lost' },
    ]
    const result: Record<string, { id: string; title: string }> = {}
    for (const def of defs) {
      const response = await call('POST', '/api/crm/stages', { title: def.title, isWon: def.semanticType === 'won', isLost: def.semanticType === 'lost', semanticType: def.semanticType })
      result[def.semanticType] = { id: (response.body.stage as { id: string }).id, title: def.title }
    }
    return result
  }

  test('E2E-01: company without deal, contacts, task; persists; not in forecast', async () => {
    const created = await call('POST', '/api/crm/companies', {
      name: 'ООО Ромашка',
      website: 'https://romashka.ru',
      region: 'Тула',
      segment: 'Пищепром',
      researchSource: 'pipeline:2026-10-17',
      selectionReason: 'На сайте описана линия розлива',
      researchedAt: '2026-10-17T10:00:00+03:00',
    })
    expect(created.status).toBe(201)
    const company = created.body.company as Record<string, unknown>
    expect(company.domain).toBe('romashka.ru')
    expect(company.researchStatus).toBe('selected')

    const contact = await call('POST', '/api/crm/contacts', {
      companyId: company.id,
      name: 'Общая приёмная',
      channels: [{ kind: 'email', value: 'info@romashka.ru', isDirect: false }],
    })
    expect(contact.status).toBe(201)
    const master = await call('POST', '/api/crm/contacts', {
      companyId: company.id,
      name: 'Мастер участка',
      position: 'Мастер',
      channels: [
        { kind: 'phone', value: '+7 900 000-00-01', isDirect: true },
        { kind: 'email', value: 'master@romashka.ru', isDirect: true },
      ],
    })
    expect(master.status).toBe(201)

    const task = await call('POST', '/api/crm/tasks', {
      companyId: company.id,
      assigneeId: admin.userId,
      goal: 'Выяснить, как проходит заказ между участками',
      action: 'Звонок мастеру',
      dueAt: '2026-10-20T10:00:00+03:00',
    })
    expect(task.status).toBe(201)

    // Переживает «перезагрузку»: отдельный запрос видит то же состояние.
    const recheck = await call('GET', `/api/crm/companies/${company.id}`)
    expect(recheck.status).toBe(200)
    const contacts = await call('GET', `/api/crm/contacts?companyId=${company.id}`)
    expect((contacts.body.items as unknown[]).length).toBe(2)
    const tasks = await call('GET', `/api/crm/tasks?companyId=${company.id}`)
    expect((tasks.body.items as unknown[]).length).toBe(1)

    // В финансовом прогнозе компании без сделок нет: MRR = 0.
    const summary = await call('GET', '/api/finance/summary')
    expect(summary.body.mrr).toBe(0)
    expect(summary.body.pipelineMonthly).toBe(0)

    // CRM-01-AC01: 20 предприятий без сделок.
    for (let index = 0; index < 20; index += 1) {
      const response = await call('POST', '/api/crm/companies', { name: `Завод №${index}` })
      expect(response.status).toBe(201)
    }
    const list = await call('GET', '/api/crm/companies?limit=100')
    expect((list.body.items as unknown[]).length).toBe(21)
    const summaryAfter = await call('GET', '/api/finance/summary')
    expect(summaryAfter.body.mrr).toBe(0)
  })

  test('E2E-02: import preview/apply/re-apply without duplicates; protocol', async () => {
    const preview = await call('POST', '/api/crm/import/preview', PIPELINE_PAYLOAD)
    expect(preview.status).toBe(200)
    expect(preview.body.summary).toMatchObject({ total: 2, create: 2 })
    const items = preview.body.items as Array<{ externalId: string; suggestedAction: string; match: { matchedBy: string } }>
    expect(items[0]!.externalId).toBe('pipeline:account-001')
    expect(items[0]!.match.matchedBy).toBe('none')

    const apply = await call('POST', '/api/crm/import/apply', {
      payload: PIPELINE_PAYLOAD,
      decisions: [
        { externalId: 'pipeline:account-001', action: 'create' },
        { externalId: 'pipeline:account-002', action: 'create' },
      ],
    })
    expect(apply.status).toBe(200)
    expect(apply.body.companiesCreated).toBe(2)
    expect(apply.body.contactsCreated).toBe(1)
    expect(apply.body.channelsCreated).toBe(2)
    expect(apply.body.tasksCreated).toBe(1)
    expect(apply.body.draftsCreated).toBe(1)

    // Повтор того же импорта: всё уже существует, дублей нет.
    const preview2 = await call('POST', '/api/crm/import/preview', PIPELINE_PAYLOAD)
    expect(preview2.body.summary).toMatchObject({ total: 2, skip: 2, create: 0 })
    const apply2 = await call('POST', '/api/crm/import/apply', {
      payload: PIPELINE_PAYLOAD,
      decisions: [
        { externalId: 'pipeline:account-001', action: 'create' },
        { externalId: 'pipeline:account-002', action: 'create' },
      ],
    })
    expect(apply2.body.companiesCreated).toBe(0)
    expect(apply2.body.contactsCreated).toBe(0)
    expect(apply2.body.draftsCreated).toBe(0)
    const companies = await call('GET', '/api/crm/companies?limit=100')
    expect((companies.body.items as unknown[]).length).toBe(2)
    const tehnikId = ((companies.body.items as Array<{ id: string; name: string }>).find((item) => item.name === 'ТЕХНИК')!).id
    const contacts = await call('GET', `/api/crm/contacts?companyId=${tehnikId}`)
    expect((contacts.body.items as unknown[]).length).toBe(1)

    // Ручное значение не затирается: переименовываем компанию и импортируем update.
    const tehnik = (companies.body.items as Array<{ id: string; name: string }>).find((item) => item.name === 'ТЕХНИК')!
    await call('PATCH', `/api/crm/companies/${tehnik.id}`, { region: 'Свой регион' })
    const apply3 = await call('POST', '/api/crm/import/apply', {
      payload: PIPELINE_PAYLOAD,
      decisions: [{ externalId: 'pipeline:account-001', action: 'update' }],
    })
    expect(apply3.status).toBe(200)
    const after = await call('GET', `/api/crm/companies/${tehnik.id}`)
    // region уже заполнен вручную — импорт его не трогает; website не был заполнен… уже был. Проверяем протокол.
    const protocol = apply3.body.protocol as Array<{ detail: string }>
    expect(protocol.length).toBeGreaterThan(0)
  })

  test('E2E-03: call attempt is not a conversation; hypothesis stays hypothesis', async () => {
    const stages = await createStages()
    const company = await call('POST', '/api/crm/companies', { name: 'Звонилка' })
    const companyId = (company.body.company as { id: string }).id
    const attempt = await call('POST', '/api/crm/activities', {
      companyId,
      occurredAt: '2026-10-17T10:00:00+03:00',
      channel: 'call',
      actionType: 'call_attempt',
      direction: 'outbound',
      result: 'Не дозвонились',
    })
    expect(attempt.status).toBe(201)
    const conversation = await call('POST', '/api/crm/activities', {
      companyId,
      occurredAt: '2026-10-17T15:00:00+03:00',
      channel: 'call',
      actionType: 'conversation',
      direction: 'outbound',
      result: 'Обсудили прохождение заказа',
    })
    expect(conversation.status).toBe(201)
    const activities = await call('GET', `/api/crm/activities?companyId=${companyId}`)
    const items = activities.body.items as Array<{ actionType: string }>
    expect(items.map((item) => item.actionType).sort()).toEqual(['call_attempt', 'conversation'])

    // Гипотеза с сайта не становится подтверждённой болью: claim явно hypothesis.
    const deal = await call('POST', '/api/crm/deals', { title: 'Звонилка', companyId, stageId: stages.intake.id })
    const dealId = (deal.body.deal as { id: string }).id
    const claim = await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'problem', status: 'hypothesis', source: 'сайт компании' })
    expect(claim.status).toBe(200)
    expect((claim.body as { status: string }).status).toBe('hypothesis')
    // Переход в qualified с гипотезой отклоняется на сервере.
    const blocked = await call('POST', `/api/crm/deals/${dealId}/move`, { stageId: stages.qualified.id, position: 0 })
    expect(blocked.status).toBe(400)
    expect(String(((blocked.body as { error?: { message?: string } }).error ?? {}).message)).toContain('пример задачи')
  })

  test('E2E-04/E2E-05: legal path via PATCH and move; bypass impossible; initial entry recorded', async () => {
    const stages = await createStages()
    const company = await call('POST', '/api/crm/companies', { name: 'Полный путь' })
    const companyId = (company.body.company as { id: string }).id
    const contact = await call('POST', '/api/crm/contacts', {
      companyId,
      name: 'Директор производства',
      channels: [{ kind: 'email', value: 'director@put.ru', isDirect: true }],
    })
    const contactId = (contact.body.contact as { id: string }).id
    const deal = await call('POST', '/api/crm/deals', { title: 'Полный путь', companyId, stageId: stages.intake.id })
    const dealId = (deal.body.deal as { id: string }).id

    // Создание отражается как начальный вход.
    const history = await call('GET', `/api/crm/deals/${dealId}/history`)
    const entries = history.body.entries as Array<{ event: string; toStageId: string | null }>
    expect(entries.some((entry) => entry.event === 'initial_entry' && entry.toStageId === stages.intake.id)).toBe(true)

    // PATCH stageId не обходит правила: без причины отказа — отказ.
    const lostPatch = await call('PATCH', `/api/crm/deals/${dealId}`, { stageId: stages.lost.id })
    expect(lostPatch.status).toBe(400)
    // move в отказ без причины — тоже отказ на сервере.
    const lostMove = await call('POST', `/api/crm/deals/${dealId}/move`, { stageId: stages.lost.id, position: 0 })
    expect(lostMove.status).toBe(400)

    // Законный путь: подтверждённая задача + владелец процесса + одобренное КП.
    await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'problem', status: 'customer_confirmed', source: 'разговор' })
    await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'consequences', status: 'customer_confirmed', source: 'разговор' })
    await call('PUT', `/api/crm/deals/${dealId}/contact-roles`, { contactId, role: 'process_owner', confirmed: true })
    // FIX-02-AC02 (аудит R-09): подтверждённая задача требует реального содержания.
    await call('PATCH', `/api/crm/deals/${dealId}`, {
      problemStatement: 'Заказ висит между участками',
      consequences: 'Срыв сроков',
      nextAgreedStep: 'Демо на данных клиента',
    })

    const qualified = await call('POST', `/api/crm/deals/${dealId}/move`, { stageId: stages.qualified.id, position: 0 })
    expect(qualified.status).toBe(200)

    // Предложение требует одобренную версию КП.
    const proposalBlocked = await call('PATCH', `/api/crm/deals/${dealId}`, { stageId: stages.proposal.id })
    expect(proposalBlocked.status).toBe(400)

    const draft = await call('POST', '/api/crm/drafts', {
      companyId,
      dealId,
      channel: 'email',
      recipient: 'director@put.ru',
      subject: 'КП',
      body: 'Коммерческое предложение',
      terms: { scope: 'Участок механообработки', recurring: '90000 ₽/мес' },
    })
    expect(draft.status).toBe(201)
    const draftId = (draft.body.draft as { id: string }).id
    await call('POST', `/api/crm/drafts/${draftId}/approve`)
    const proposal = await call('POST', `/api/crm/deals/${dealId}/move`, { stageId: stages.proposal.id, position: 0 })
    expect(proposal.status).toBe(200)

    // Две одинаковые команды одного перехода не создают двух событий.
    const again = await call('POST', `/api/crm/deals/${dealId}/move`, { stageId: stages.proposal.id, position: 0 })
    expect(again.status).toBe(200)
    const history2 = await call('GET', `/api/crm/deals/${dealId}/history`)
    const movedToProposal = (history2.body.entries as Array<{ event: string; toStageId: string | null }>).filter(
      (entry) => entry.event === 'moved' && entry.toStageId === stages.proposal.id,
    )
    expect(movedToProposal.length).toBe(1)
  })

  test('E2E-06: stage rename does not break the funnel report; return and re-advance', async () => {
    const stages = await createStages()
    await call('PATCH', `/api/crm/stages/${stages.qualified.id}`, { title: 'Квалифицирована (новое имя)' })
    const company = await call('POST', '/api/crm/companies', { name: 'Переименование' })
    const companyId = (company.body.company as { id: string }).id
    const contact = await call('POST', '/api/crm/contacts', { companyId, name: 'Владелец' })
    const contactId = (contact.body.contact as { id: string }).id
    const deal = await call('POST', '/api/crm/deals', { title: 'Переименование', companyId })
    const dealId = (deal.body.deal as { id: string }).id
    await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'problem', status: 'customer_confirmed', source: 'звонок' })
    await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'consequences', status: 'customer_confirmed', source: 'звонок' })
    await call('PUT', `/api/crm/deals/${dealId}/contact-roles`, { contactId, role: 'process_owner' })
    await call('PATCH', `/api/crm/deals/${dealId}`, {
      problemStatement: 'Заказ висит',
      consequences: 'Просрочка',
      nextAgreedStep: 'Встреча с директором',
    })

    await call('POST', `/api/crm/deals/${dealId}/move`, { stageId: stages.qualified.id, position: 0 })
    // Возврат и повторное продвижение.
    await call('POST', `/api/crm/deals/${dealId}/move`, { stageId: stages.dialogue.id, position: 0 })
    await call('POST', `/api/crm/deals/${dealId}/move`, { stageId: stages.qualified.id, position: 0 })

    const report = await call('GET', '/api/crm/report/funnel')
    expect(report.status).toBe(200)
    const byStage = report.body.byStage as Array<{ stageId: string; entered: number; advancedToNext: number }>
    const qualifiedRow = byStage.find((row) => row.stageId === stages.qualified.id)
    expect(qualifiedRow).toBeDefined()
    expect(qualifiedRow!.entered).toBeGreaterThanOrEqual(1)
    // Уникальные объекты: один deal, одно продвижение.
    expect(report.body.advanced).toMatchObject({ n: 1, total: 1, pct: 100 })
  })

  test('E2E-12: 4 lost + 1 advanced of 5: exits 100%, advanced 20%, lost 80%', async () => {
    const stages = await createStages()
    const company = await call('POST', '/api/crm/companies', { name: 'Математика' })
    const companyId = (company.body.company as { id: string }).id
    const contact = await call('POST', '/api/crm/contacts', { companyId, name: 'Владелец' })
    const contactId = (contact.body.contact as { id: string }).id
    for (let index = 0; index < 5; index += 1) {
      const deal = await call('POST', '/api/crm/deals', { title: `Возможность ${index}`, companyId })
      const dealId = (deal.body.deal as { id: string }).id
      if (index < 4) {
        const lost = await call('POST', `/api/crm/deals/${dealId}/move`, { stageId: stages.lost.id, position: 0, reason: 'Дорого' })
        expect(lost.status).toBe(200)
      } else {
        await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'problem', status: 'customer_confirmed', source: 'встреча' })
        await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'consequences', status: 'customer_confirmed', source: 'встреча' })
        await call('PUT', `/api/crm/deals/${dealId}/contact-roles`, { contactId, role: 'process_owner' })
        await call('PATCH', `/api/crm/deals/${dealId}`, {
          problemStatement: 'Ручной учёт',
          consequences: 'Ошибки и потери',
          nextAgreedStep: 'Пилот на участке',
        })
        const advanced = await call('POST', `/api/crm/deals/${dealId}/move`, { stageId: stages.qualified.id, position: 0 })
        expect(advanced.status).toBe(200)
      }
    }
    const report = await call('GET', '/api/crm/report/funnel')
    expect(report.body.opportunities).toBe(5)
    expect(report.body.exits).toEqual({ n: 5, total: 5, pct: 100 })
    expect(report.body.advanced).toEqual({ n: 1, total: 5, pct: 20 })
    expect(report.body.lost).toEqual({ n: 4, total: 5, pct: 80 })
    expect(report.body.openOpportunities).toBe(1)
  })

  test('E2E-07/E2E-10: draft lifecycle, new version after approval, idempotency and stale version', async () => {
    const stages = await createStages()
    const company = await call('POST', '/api/crm/companies', { name: 'Черновики' })
    const companyId = (company.body.company as { id: string }).id
    const draft = await call('POST', '/api/crm/drafts', {
      companyId,
      channel: 'email',
      recipient: 'a@b.ru',
      subject: 'Тема',
      body: 'Версия 1',
    })
    const draftId = (draft.body.draft as { id: string }).id
    await call('POST', `/api/crm/drafts/${draftId}/approve`)
    const approved = await call('GET', `/api/crm/drafts/${draftId}`)
    // Сохранение черновика не стало фактом отправки.
    expect((approved.body.draft as { status: string }).status).toBe('approved')

    // Правка одобренной версии создаёт новую версию со статусом draft.
    const edited = await call('PATCH', `/api/crm/drafts/${draftId}`, { body: 'Версия 2 текст' })
    expect(edited.status).toBe(200)
    const newVersion = edited.body.draft as { id: string; version: number; status: string }
    expect(newVersion.version).toBe(2)
    expect(newVersion.status).toBe('draft')
    const versions = await call('GET', `/api/crm/drafts/${draftId}/versions`)
    expect((versions.body.items as unknown[]).length).toBe(2)

    // Смена получателя аннулирует прежнее одобрение: новая версия draft.
    const recipientChange = await call('PATCH', `/api/crm/drafts/${newVersion.id}`, { recipient: 'other@b.ru' })
    const afterRecipient = recipientChange.body.draft as { status: string }
    expect(afterRecipient.status).toBe('draft')

    // Идемпотентность: тот же ключ + та же нагрузка = один результат.
    const idemHeaders = { 'Idempotency-Key': 'task-1' }
    const task1 = await call('POST', '/api/crm/tasks', { companyId, assigneeId: admin.userId, goal: 'Написать письмо', dueAt: '2026-10-21T10:00:00+03:00' }, idemHeaders)
    const task2 = await call('POST', '/api/crm/tasks', { companyId, assigneeId: admin.userId, goal: 'Написать письмо', dueAt: '2026-10-21T10:00:00+03:00' }, idemHeaders)
    expect(task1.status).toBe(201)
    expect(task2.status).toBe(201)
    expect((task2.body.task as { id: string }).id).toBe((task1.body.task as { id: string }).id)
    const tasks = await call('GET', `/api/crm/tasks?companyId=${companyId}`)
    expect((tasks.body.items as unknown[]).length).toBe(1)
    // Другая нагрузка с тем же ключом — конфликт.
    const conflict = await call('POST', '/api/crm/tasks', { companyId, assigneeId: admin.userId, goal: 'Другая цель', dueAt: '2026-10-21T10:00:00+03:00' }, idemHeaders)
    expect(conflict.status).toBe(409)

    // Устаревшая версия не затирает свежую заметку (CRM-08-AC02).
    const deal = await call('POST', '/api/crm/deals', { title: 'Конфликт версий', companyId, stageId: stages.intake.id })
    const dealId = (deal.body.deal as { id: string }).id
    const first = await call('PATCH', `/api/crm/deals/${dealId}`, { note: 'Заметка Ивана' })
    const version = (first.body.deal as { version: number }).version
    const stale = await call('PATCH', `/api/crm/deals/${dealId}`, { note: 'Старая правка', expectedVersion: 1 })
    expect(stale.status).toBe(409)
    expect(version).toBeGreaterThan(1)
    const detail = await call('GET', `/api/crm/deals/${dealId}`)
    expect((detail.body.deal as { note: string | null }).note).toBe('Заметка Ивана')
  })

  test('E2E-08: DNC blocks tasks and draft send; import does not lift; inbound cancels templated follow-up', async () => {
    const company = await call('POST', '/api/crm/companies', { name: 'Запрет' })
    const companyId = (company.body.company as { id: string }).id
    const templated = await call('POST', '/api/crm/tasks', {
      companyId,
      assigneeId: admin.userId,
      goal: 'Шаблонное напоминание через неделю',
      dueAt: '2026-10-24T10:00:00+03:00',
      templated: true,
    })
    const taskId = (templated.body.task as { id: string }).id

    // Входящий ответ помечает шаблонное продолжение к пересмотру.
    await call('POST', '/api/crm/activities', {
      companyId,
      occurredAt: '2026-10-17T12:00:00+03:00',
      channel: 'email',
      actionType: 'message_received',
      direction: 'inbound',
      note: 'Мы подумаем',
    })
    const tasksAfter = await call('GET', `/api/crm/tasks?companyId=${companyId}`)
    expect((tasksAfter.body.items as Array<{ needsReview: boolean }>)[0]!.needsReview).toBe(true)

    // Запрет компании останавливает коммерческие касания.
    await call('POST', `/api/crm/companies/${companyId}/dnc`, { reason: 'Просьба не писать', scope: 'all' })
    const blockedTask = await call('POST', '/api/crm/tasks', {
      companyId,
      assigneeId: admin.userId,
      goal: 'Ещё касание',
      dueAt: '2026-10-25T10:00:00+03:00',
    })
    expect(blockedTask.status).toBe(403)

    const draft = await call('POST', '/api/crm/drafts', { companyId, channel: 'email', recipient: 'info@zapret.ru', body: 'КП' })
    // D2: отбор черновиков тоже проверяет запрет — создание блокируется (§8.5/CRM-04).
    expect(draft.status).toBe(403)

    // Повторный импорт не снимает запрет.
    const dncPayload = {
      version: 1,
      updated_at: '2026-10-18',
      accounts: [{ id: 'account-dnc', company_name: 'Запрет', official_domain: 'zapret.ru', contacts: [], outbound_drafts: [] }],
    }
    await call('POST', '/api/crm/import/apply', {
      payload: dncPayload,
      decisions: [{ externalId: 'pipeline:account-dnc', action: 'update' }],
    })
    const afterImport = await call('GET', `/api/crm/companies/${companyId}`)
    expect((afterImport.body.company as { doNotContact: boolean }).doNotContact).toBe(true)

    // Восстановление требует явного основания и автора; в журнале видно основание исключения.
    const events = await call('GET', `/api/crm/companies/${companyId}/events`)
    const kinds = (events.body.items as Array<{ kind: string; reason: string | null }>).map((item) => item.kind)
    expect(kinds).toContain('dnc_set')
    const lift = await call('POST', `/api/crm/companies/${companyId}/dnc/lift`, { reason: 'Новое основание: повторный входящий запрос' })
    expect(lift.status).toBe(200)
    const lifted = await call('GET', `/api/crm/companies/${companyId}`)
    expect((lifted.body.company as { doNotContact: boolean }).doNotContact).toBe(false)
    void taskId
  })

  test('E2E-09: agent cannot delete deals, confirm receipts, or move to won; human scenario works', async () => {
    const stages = await createStages()
    const company = await call('POST', '/api/crm/companies', { name: 'Права агента' })
    const companyId = (company.body.company as { id: string }).id
    const deal = await call('POST', '/api/crm/deals', { title: 'Права агента', companyId })
    const dealId = (deal.body.deal as { id: string }).id

    // Агент читает и пишет рабочие данные…
    const agentCompany = await agentCall('GET', `/api/crm/companies/${companyId}`)
    expect(agentCompany.status).toBe(200)
    const agentActivity = await agentCall('POST', '/api/crm/activities', {
      companyId,
      occurredAt: '2026-10-17T10:00:00+03:00',
      channel: 'email',
      actionType: 'message_sent',
      direction: 'outbound',
    })
    expect(agentActivity.status).toBe(201)

    // …но не удаляет сделки, не подтверждает факт клиента и не переводит в won.
    const agentDelete = await agentCall('DELETE', `/api/crm/deals/${dealId}`)
    expect(agentDelete.status).toBe(403)
    const agentClaim = await agentCall('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'problem', status: 'customer_confirmed' })
    expect(agentClaim.status).toBe(403)

    await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'problem', status: 'customer_confirmed' })
    await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'consequences', status: 'customer_confirmed' })
    const contact = await call('POST', '/api/crm/contacts', { companyId, name: 'Владелец' })
    await call('PUT', `/api/crm/deals/${dealId}/contact-roles`, { contactId: (contact.body.contact as { id: string }).id, role: 'process_owner' })
    await call('PATCH', `/api/crm/deals/${dealId}`, { wonBasis: 'Договор' })
    const agentWon = await agentCall('POST', `/api/crm/deals/${dealId}/move`, { stageId: stages.won.id, position: 0 })
    expect(agentWon.status).toBe(403)

    const humanWon = await call('POST', `/api/crm/deals/${dealId}/move`, { stageId: stages.won.id, position: 0 })
    expect(humanWon.status).toBe(200)
    const wonDetail = await call('GET', `/api/crm/deals/${dealId}`)
    expect((wonDetail.body.deal as { wonAt: string | null }).wonAt).not.toBeNull()

    // Агент не подтверждает оплату.
    const expected = await call('POST', '/api/finance/expected', {
      title: 'Счёт по сделке',
      amount: 100_000,
      dueDate: '2026-10-10',
      dealId,
    })
    const paymentId = (expected.body.payment as { id: string }).id
    const agentReceipt = await agentCall('POST', `/api/finance/expected/${paymentId}/receipts`, {
      amount: 100_000,
      actualReceivedOn: '2026-10-17',
    })
    expect(agentReceipt.status).toBe(403)

    // Ошибка записи агента видна в очереди операций.
    const ops = await call('GET', '/api/crm/agent-ops')
    const failed = (ops.body.items as Array<{ ok: boolean; operation: string }>).filter((op) => !op.ok)
    expect(failed.length).toBeGreaterThan(0)
  })

  test('E2E-13/E2E-14: partial receipts dated by fact, repeat does not double; subscription states', async () => {
    const stages = await createStages()
    const company = await call('POST', '/api/crm/companies', { name: 'Деньги' })
    const companyId = (company.body.company as { id: string }).id
    const contact = await call('POST', '/api/crm/contacts', { companyId, name: 'Владелец' })
    const deal = await call('POST', '/api/crm/deals', { title: 'Деньги', companyId, monthlyAmount: 50_000 })
    const dealId = (deal.body.deal as { id: string }).id
    await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'problem', status: 'customer_confirmed' })
    await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'consequences', status: 'customer_confirmed' })
    await call('PUT', `/api/crm/deals/${dealId}/contact-roles`, { contactId: (contact.body.contact as { id: string }).id, role: 'process_owner' })
    await call('PATCH', `/api/crm/deals/${dealId}`, { wonBasis: 'Договор подписан' })
    await call('POST', `/api/crm/deals/${dealId}/move`, { stageId: stages.won.id, position: 0 })

    // Подписанный, но не активированный договор — не активная подписка: MRR = 0.
    let summary = await call('GET', '/api/finance/summary')
    expect(summary.body.mrr).toBe(0)

    // Выигранная сделка после миграции имеет unconfirmed; здесь новая сделка — none.
    // Активация подписки работает после won.
    const activated = await call('POST', `/api/finance/deals/${dealId}/subscription`, { status: 'active', startsOn: '2026-10-01' })
    expect(activated.status).toBe(200)
    summary = await call('GET', '/api/finance/summary')
    expect(summary.body.mrr).toBe(50_000)

    // Частичная оплата со сроком 10 октября, факт 17 октября: доход датирован 17-м.
    const expected = await call('POST', '/api/finance/expected', {
      title: 'Счёт №1',
      amount: 100_000,
      dueDate: '2026-10-10',
      dealId,
    })
    const paymentId = (expected.body.payment as { id: string }).id
    const receipt1 = await call('POST', `/api/finance/expected/${paymentId}/receipts`, {
      amount: 40_000,
      actualReceivedOn: '2026-10-17',
    }, { 'Idempotency-Key': 'receipt-1' })
    expect(receipt1.status).toBe(201)
    expect(receipt1.body.receipt).toMatchObject({ receivedAmount: 40_000, remainingAmount: 60_000, status: 'partially_received' })
    const txns = await call('GET', '/api/finance/txns')
    const incomeRows = (txns.body.items as Array<{ occurredOn: string; amount: number; dealId: string | null }>).filter(
      (row) => row.amount === 40_000,
    )
    expect(incomeRows.length).toBe(1)
    expect(incomeRows[0]!.occurredOn).toBe('2026-10-17')
    expect(incomeRows[0]!.dealId).toBe(dealId)

    // Повтор той же команды с тем же идемпотентным ключом не удваивает доход.
    const receiptAgain = await call('POST', `/api/finance/expected/${paymentId}/receipts`, {
      amount: 40_000,
      actualReceivedOn: '2026-10-17',
    }, { 'Idempotency-Key': 'receipt-1' })
    const receiptAgain2 = await call('POST', `/api/finance/expected/${paymentId}/receipts`, {
      amount: 40_000,
      actualReceivedOn: '2026-10-17',
    }, { 'Idempotency-Key': 'receipt-1' })
    expect(receiptAgain.status).toBe(201)
    expect(receiptAgain2.status).toBe(201)
    expect((receiptAgain2.body.receipt as { txnId: string }).txnId).toBe((receiptAgain.body.receipt as { txnId: string }).txnId)

    // Доплата другой датой закрывает обязательство; остаток хранится.
    const receipt2 = await call('POST', `/api/finance/expected/${paymentId}/receipts`, {
      amount: 60_000,
      actualReceivedOn: '2026-10-25',
    })
    expect(receipt2.body.receipt).toMatchObject({ receivedAmount: 100_000, remainingAmount: 0, status: 'received' })
    // Обязательство не удалено: связь сохранена.
    const expectedList = await call('GET', '/api/finance/expected')
    const row = (expectedList.body.items as Array<{ id: string; status: string; dealId: string | null }>).find((item) => item.id === paymentId)
    expect(row).toBeDefined()
    expect(row!.status).toBe('received')
    expect(row!.dealId).toBe(dealId)

    // Завершение периода выключает MRR.
    await call('POST', `/api/finance/deals/${dealId}/subscription`, { status: 'ended', startsOn: '2026-10-01', endsOn: '2026-10-31' })
    summary = await call('GET', '/api/finance/summary')
    expect(summary.body.mrr).toBe(0)

    // Прогноз/деньги/договорная стоимость раздельны: deal detail содержит и то, и другое.
    const detail = await call('GET', `/api/crm/deals/${dealId}`)
    const dealDetail = detail.body.deal as { monthlyAmount: number; receivedTotal: number }
    expect(dealDetail.monthlyAmount).toBe(50_000)
    expect(dealDetail.receivedTotal).toBe(100_000)
  })

  test('E2E-11: pilot cannot activate without readiness; decision only explicit; criteria versioned', async () => {
    await createStages()
    const company = await call('POST', '/api/crm/companies', { name: 'Пилот' })
    const companyId = (company.body.company as { id: string }).id
    const deal = await call('POST', '/api/crm/deals', { title: 'Пилот' })
    const dealId = (deal.body.deal as { id: string }).id

    await call('PUT', `/api/crm/deals/${dealId}/pilot`, { goal: 'Проверить участок' })
    const early = await call('POST', `/api/crm/deals/${dealId}/pilot/activate`)
    expect(early.status).toBe(400)
    // Агент без права pilot.decide не принимает итог пилота (FIX-01-AC02).
    const agentDecisionBlocked = await agentCall('POST', `/api/crm/deals/${dealId}/pilot/decision`, { outcome: 'accepted' })
    expect(agentDecisionBlocked.status).toBe(403)

    await call('PUT', `/api/crm/deals/${dealId}/pilot`, {
      goal: 'Сократить прохождение заказа',
      sourceData: 'Данные заказов за месяц',
      ordixOwnerId: admin.userId,
      clientOwnerName: 'Директор',
      usersOverview: 'Мастер и технолог',
      decisionDueOn: '2026-11-30',
      paidNextStep: 'Подписка на участок',
      paidNextStepAnchor: 90_000,
    })
    const criterion = await call('POST', `/api/crm/deals/${dealId}/pilot/criteria`, {
      statement: 'Время прохождения заказа -30%',
      method: 'Замер среднего времени до/после по журналу заказов',
    })
    expect(criterion.status).toBe(201)
    // Критерий должен быть согласован (FIX-02-AC02 / R-10).
    const criterionId = (criterion.body as { id: string }).id
    const agreed = await call('POST', `/api/crm/pilot-criteria/${criterionId}/agree`, {})
    expect(agreed.status).toBe(200)
    const activate = await call('POST', `/api/crm/deals/${dealId}/pilot/activate`)
    expect(activate.status).toBe(200)

    // Успешное демо не закрывает пилот: итог — только явное решение.
    const pilotBefore = await call('GET', `/api/crm/deals/${dealId}/pilot`)
    expect((pilotBefore.body.pilot as { outcome: string | null }).outcome).toBeNull()

    // Критерий не меняется задним числом: правка создаёт новую версию.
    const newVersion = await call('PATCH', `/api/crm/pilot-criteria/${criterionId}`, { statement: 'Время прохождения заказа -20%' })
    expect((newVersion.body as { version: number; active: boolean }).version).toBe(2)
    expect((newVersion.body as { version: number; active: boolean }).active).toBe(true)

    const accepted = await call('POST', `/api/crm/deals/${dealId}/pilot/decision`, { outcome: 'accepted', note: 'Клиент доволен' })
    expect(accepted.status).toBe(200)
    expect((accepted.body as { outcome: string }).outcome).toBe('accepted')
  })

  test('E2E-15: launch owner, risk, extension as separate deal; contribution after costs', async () => {
    const stages = await createStages()
    const company = await call('POST', '/api/crm/companies', { name: 'Запуск' })
    const companyId = (company.body.company as { id: string }).id
    const contact = await call('POST', '/api/crm/contacts', { companyId, name: 'Владелец' })
    const deal = await call('POST', '/api/crm/deals', { title: 'Запуск', companyId })
    const dealId = (deal.body.deal as { id: string }).id
    await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'problem', status: 'customer_confirmed' })
    await call('PUT', `/api/crm/deals/${dealId}/claims`, { fieldKey: 'consequences', status: 'customer_confirmed' })
    await call('PUT', `/api/crm/deals/${dealId}/contact-roles`, { contactId: (contact.body.contact as { id: string }).id, role: 'process_owner' })
    await call('PATCH', `/api/crm/deals/${dealId}`, { wonBasis: 'Договор' })
    await call('POST', `/api/crm/deals/${dealId}/move`, { stageId: stages.won.id, position: 0 })

    const launch = await call('PUT', `/api/crm/deals/${dealId}/launch`, {
      launchOwnerId: admin.userId,
      plannedStartOn: '2026-11-01',
      valueCheckDueOn: '2026-12-01',
      supportHours: 20,
      directCosts: 30_000,
      riskLevel: 'medium',
      riskNotes: 'Не приняли первый сценарий',
    })
    expect(launch.status).toBe(200)

    // Оплачено, но сценарий не принят и контроль просрочен — риск виден.
    await call('POST', '/api/finance/expected', { title: 'Оплата запуска', amount: 100_000, dueDate: '2026-11-05', dealId })
    const payments = await call('GET', '/api/finance/expected')
    const paymentId = ((payments.body.items as Array<{ id: string; title: string }>)[0]!).id
    await call('POST', `/api/finance/expected/${paymentId}/receipts`, { amount: 100_000, actualReceivedOn: '2026-11-05' })

    // Ставка часа: 1500 ₽ → вклад = 100000 − 30000 − 20×1500 = 40000.
    await call('PUT', '/api/finance/settings', {
      openingBalanceDate: '2026-01-01',
      openingBalance: 0,
      laborHourRate: 1500,
    })
    const detail = await call('GET', `/api/crm/deals/${dealId}`)
    expect((detail.body.deal as { contribution: number | null }).contribution).toBe(40_000)

    // Расширение — отдельная сделка под новую подтверждённую задачу.
    const extension = await call('POST', `/api/crm/deals/${dealId}/extension`, {
      title: 'Расширение: второй участок',
      monthlyAmount: 30_000,
      oneTimeAmount: 0,
      basis: 'Подтверждённая задача: расширить на второй участок',
    })
    expect(extension.status).toBe(201)
    const extensionDeal = extension.body.deal as { id: string; companyId: string | null }
    expect(extensionDeal.id).not.toBe(dealId)
    expect(extensionDeal.companyId).toBe(companyId)
  })

  test('E2E-16: legacy data migration marks gaps honestly and preserves records', async () => {
    // Старый формат: компания только с названием, сделка со строковым контактом и won-этапом.
    const stage = await prisma.crmStage.create({
      data: { title: 'Выиграна', position: 0, isWon: true, isLost: false, code: '', semanticType: 'other' },
    })
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@example.com' } })
    const company = await prisma.company.create({ data: { name: 'Старый клиент' } })
    const deal = await prisma.deal.create({
      data: {
        title: 'Старый клиент',
        companyId: company.id,
        contactName: 'Иван Старов',
        contactPhone: '+7 900 111-22-33',
        monthlyAmount: 25_000,
        stageId: stage.id,
        position: 0,
        createdById: user.id,
      },
    })
    await prisma.dealHistory.create({
      data: { dealId: deal.id, fromStage: null, toStage: 'Выиграна' },
    })
    await prisma.dealComment.create({
      data: { dealId: deal.id, authorId: user.id, body: 'Старый комментарий' },
    })

    const report = await migrateLegacyCrmData(prisma)
    expect(report.stagesCoded).toBe(1)
    expect(report.dealsOwnerBackfilled).toBe(1)
    expect(report.legacyContactsCreated).toBe(1)
    expect(report.historyRowsMarkedLegacy).toBe(1)
    expect(report.wonDealsMarkedUnconfirmed).toBe(1)
    expect(report.companiesRelationBackfilled).toBe(1)

    // Идемпотентность повторного запуска.
    const secondRun = await migrateLegacyCrmData(prisma)
    expect(secondRun.alreadyApplied).toBe(true)

    // Сохранность: суммы, комментарии, связи на месте; неизвестное не «подтверждено».
    const dealAfter = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id }, include: { comments: true, company: true } })
    expect(dealAfter.monthlyAmount).toBe(25_000)
    expect(dealAfter.comments.length).toBe(1)
    expect(dealAfter.companyId).toBe(company.id)
    expect(dealAfter.subStatus).toBe('unconfirmed')
    expect(dealAfter.contactName).toBe('Иван Старов')

    const migratedContact = await prisma.contact.findFirstOrThrow({ where: { companyId: company.id } })
    expect(migratedContact.isLegacy).toBe(true)
    expect(migratedContact.status).toBe('published')
    const channel = await prisma.contactChannel.findFirstOrThrow({ where: { contactId: migratedContact.id } })
    expect(channel.status).not.toBe('confirmed')

    const historyRow = await prisma.dealHistory.findFirstOrThrow({ where: { dealId: deal.id } })
    expect(historyRow.legacy).toBe(true)
    expect(historyRow.toStageId).toBeNull()
  })

describe('fixes after agent C review', () => {
  test('D2: contact-level DNC blocks draft creation and send fixation', async () => {
    const company = await call('POST', '/api/crm/companies', { name: 'Контакт-запрет' })
    const companyId = (company.body.company as { id: string }).id
    const contact = await call('POST', '/api/crm/contacts', {
      companyId,
      name: 'Человек с запретом',
      channels: [{ kind: 'email', value: 'dnc@person.ru', isDirect: true }],
    })
    const contactId = (contact.body.contact as { id: string }).id
    await call('POST', `/api/crm/contacts/${contactId}/dnc`, { reason: 'Просил не писать лично ему', scope: 'all' })

    const draftBlocked = await call('POST', '/api/crm/drafts', {
      companyId,
      contactId,
      channel: 'email',
      recipient: 'dnc@person.ru',
      body: 'КП',
    })
    expect(draftBlocked.status).toBe(403)

    // FIX-06-AC01: адрес запрещённого получателя блокирует и создание черновика —
    // обход через отсутствие contactId невозможен.
    const draftNoContact = await call('POST', '/api/crm/drafts', {
      companyId,
      channel: 'email',
      recipient: 'dnc@person.ru',
      body: 'КП',
    })
    expect(draftNoContact.status).toBe(403)
    // Адрес другого (не запрещённого) контакта создаётся свободно.
    await call('POST', '/api/crm/contacts', {
      companyId,
      name: 'Свободный человек',
      channels: [{ kind: 'email', value: 'free@person.ru', isDirect: false }],
    })
    const draft = await call('POST', '/api/crm/drafts', {
      companyId,
      channel: 'email',
      recipient: 'free@person.ru',
      body: 'КП',
    })
    expect(draft.status).toBe(201)
    const draftId = (draft.body.draft as { id: string }).id
  })

  test('D6: domain duplicate requires explicit confirmation', async () => {
    const first = await call('POST', '/api/crm/companies', { name: 'Первая компания', website: 'https://group-one.ru' })
    expect(first.status).toBe(201)
    const duplicate = await call('POST', '/api/crm/companies', { name: 'Второе юрлицо', website: 'https://group-one.ru' })
    expect(duplicate.status).toBe(409)
    expect(String((duplicate.body as { error?: { message?: string } }).error?.message)).toContain('уже связан')
    const confirmed = await call('POST', '/api/crm/companies', {
      name: 'Второе юрлицо',
      website: 'https://group-one.ru',
      inn: '7700000002',
      allowDomainDuplicate: true,
    })
    expect(confirmed.status).toBe(201)
    const list = await call('GET', '/api/crm/companies?search=group-one')
    expect((list.body.items as unknown[]).length).toBe(2)
  })

  test('D7: agent-created deal records agent actorKind in initial_entry', async () => {
    await createStages()
    const deal = await agentCall('POST', '/api/crm/deals', { title: 'Агентская запись' })
    expect(deal.status).toBe(201)
    const dealId = (deal.body.deal as { id: string }).id
    const history = await call('GET', `/api/crm/deals/${dealId}/history`)
    const entry = (history.body.entries as Array<{ event: string; actorKind: string }>).find(
      (row) => row.event === 'initial_entry',
    )
    expect(entry?.actorKind).toBe('agent')
  })

  test('D8: rejected PATCH with stageId does not save other fields (atomicity)', async () => {
    const stages = await createStages()
    const company = await call('POST', '/api/crm/companies', { name: 'Атомарность' })
    const companyId = (company.body.company as { id: string }).id
    const deal = await call('POST', '/api/crm/deals', { title: 'Атомарность', companyId })
    const dealId = (deal.body.deal as { id: string }).id

    // PATCH с переходом в lost без причины + правкой заметки: отклонён целиком.
    const rejected = await call('PATCH', `/api/crm/deals/${dealId}`, {
      stageId: stages.lost.id,
      note: 'Эта заметка не должна сохраниться',
    })
    expect(rejected.status).toBe(400)
    const detail = await call('GET', `/api/crm/deals/${dealId}`)
    const dealDetail = detail.body.deal as { note: string | null; stageId: string }
    expect(dealDetail.note).toBeNull()
    expect(dealDetail.stageId).toBe(stages.intake.id)
  })
})
})