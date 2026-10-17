import { describe, expect, test } from 'bun:test'

import {
  assertCommercialTouchAllowed,
  assertDraftSendable,
  computeContribution,
  computeFunnelStats,
  draftContentHash,
  evaluateTransition,
  matchImportCandidate,
  nextActionFromOpenTasks,
  normalizeDomain,
  pilotActivationBlockers,
} from './sales-rules'

const stage = (over: Partial<Parameters<typeof evaluateTransition>[0]['toStage']> & { id: string }) => ({
  title: over.id,
  position: 1,
  semanticType: 'other',
  isWon: false,
  isLost: false,
  ...over,
})

const baseDeal = { id: 'd1', stageId: 's1', lostReason: null }

type TransitionOver = Omit<Partial<Parameters<typeof evaluateTransition>[0]>, 'deal'> & {
  deal?: Partial<{ problemStatement: string | null; consequences: string | null; nextAgreedStep: string | null; wonBasis: string | null; pausedReason: string | null; resumeCondition: string | null; resumeOn: string | null; lostReason: string | null }>
}

function transitionInput(over: TransitionOver = {}) {
  const { deal: dealOver, ...rest } = over
  return {
    deal: { ...baseDeal, ...dealOver },
    fromStage: stage({ id: 's1', position: 0, semanticType: 'intake' }),
    toStage: stage({ id: 's2', position: 1, semanticType: 'other' }),
    claims: [],
    hasProcessOwnerRole: false,
    hasApprovedOrSentDraft: false,
    actorIsAgent: false,
    ...rest,
  }
}

describe('normalizeDomain', () => {
  test('strips scheme, www and path', () => {
    expect(normalizeDomain('https://www.TehnikNN.ru/about')).toBe('tehniknn.ru')
    expect(normalizeDomain('TEHNIKNN.RU')).toBe('tehniknn.ru')
    expect(normalizeDomain('   ')).toBeNull()
  })
})

describe('matchImportCandidate', () => {
  const existing = [
    { id: 'c1', name: 'ТЕХНИК', domain: 'tehniknn.ru', inn: null, externalId: 'pipeline:account-001' },
    { id: 'c2', name: 'Группа ПАО Холдинг', domain: 'holding.ru', inn: '7700000001', externalId: null },
  ]

  test('matches by external id first', () => {
    const match = matchImportCandidate(
      { externalId: 'pipeline:account-001', name: 'Другое название', domain: 'other.ru', inn: null },
      existing,
    )
    expect(match.matchedBy).toBe('external_id')
    expect(match.companyId).toBe('c1')
  })

  test('same domain with conflicting INN is not merged (different legal entities)', () => {
    const match = matchImportCandidate(
      { externalId: null, name: 'ООО Холдинг-Самара', domain: 'holding.ru', inn: '6300000002' },
      existing,
    )
    expect(match.companyId).toBeNull()
    expect(match.conflicts.some((conflict) => conflict.field === 'inn')).toBe(true)
  })

  test('same domain without INN conflict matches', () => {
    const match = matchImportCandidate(
      { externalId: null, name: 'Группа ПАО Холдинг (филиал)', domain: 'holding.ru', inn: null },
      existing,
    )
    expect(match.matchedBy).toBe('domain')
    expect(match.companyId).toBe('c2')
  })

  test('no match yields none', () => {
    const match = matchImportCandidate(
      { externalId: null, name: 'Новая компания', domain: 'new.ru', inn: null },
      existing,
    )
    expect(match.matchedBy).toBe('none')
    expect(match.companyId).toBeNull()
  })
})

describe('assertCommercialTouchAllowed', () => {
  test('blocks drafts on company DNC', () => {
    expect(() =>
      assertCommercialTouchAllowed({
        company: { doNotContact: true, dncScope: 'all', dncReason: 'Просьба' },
        contact: null,
        kind: 'draft',
      }),
    ).toThrow(/запрещён/)
  })

  test('commercial scope still blocks commercial drafts but not technical-path tasks', () => {
    expect(() =>
      assertCommercialTouchAllowed({
        company: { doNotContact: true, dncScope: 'commercial', dncReason: 'Отказ' },
        contact: null,
        kind: 'draft',
      }),
    ).toThrow(/запрещён/)
    expect(() =>
      assertCommercialTouchAllowed({
        company: { doNotContact: true, dncScope: 'commercial', dncReason: 'Отказ' },
        contact: null,
        kind: 'task',
      }),
    ).not.toThrow()
  })

  test('contact-level DNC blocks despite company being clean', () => {
    expect(() =>
      assertCommercialTouchAllowed({
        company: null,
        contact: { doNotContact: true, dncScope: 'all', dncReason: 'Человек просил не писать' },
        kind: 'task',
      }),
    ).toThrow(/блокирована/)
  })
})

describe('evaluateTransition', () => {
  test('lost without reason is rejected on the server', () => {
    const violations = evaluateTransition(
      transitionInput({ toStage: stage({ id: 'lost', semanticType: 'lost', isLost: true, position: 9 }) }),
    )
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'lost.reason' }))
  })

  test('lost with reason from request passes', () => {
    const violations = evaluateTransition(
      transitionInput({
        toStage: stage({ id: 'lost', semanticType: 'lost', isLost: true, position: 9 }),
        lostReasonInRequest: 'Дорого',
      }),
    )
    expect(violations).toEqual([])
  })

  test('qualified milestone requires confirmed problem and consequences and owner', () => {
    const toStage = stage({ id: 'q', semanticType: 'qualified', position: 3 })
    const violations = evaluateTransition(transitionInput({ toStage }))
    // FIX-02-AC02: пустые отметки не проходят — плюс требования содержания.
    expect(violations.map((v) => v.rule).sort()).toEqual([
      'qualified.consequences',
      'qualified.content.consequences',
      'qualified.content.problem',
      'qualified.content.step',
      'qualified.owner',
      'qualified.problem',
    ])
    const ok = evaluateTransition(
      transitionInput({
        toStage,
        claims: [
          { fieldKey: 'problem', status: 'customer_confirmed' },
          { fieldKey: 'consequences', status: 'tested' },
        ],
        hasProcessOwnerRole: true,
        deal: {
          problemStatement: 'Заказ висит между участками',
          consequences: 'Срыв сроков',
          nextAgreedStep: 'Демо на данных клиента',
        },
      }),
    )
    expect(ok).toEqual([])
  })

  test('override with reason bypasses qualification but not lost reason', () => {
    const violations = evaluateTransition(
      transitionInput({
        toStage: stage({ id: 'q', semanticType: 'qualified', position: 3 }),
        overrideReason: 'Владелец продаж разрешил пропустить анкету',
      }),
    )
    expect(violations).toEqual([])
    const lostViolations = evaluateTransition(
      transitionInput({
        toStage: stage({ id: 'lost', semanticType: 'lost', isLost: true, position: 9 }),
        overrideReason: 'без причины',
      }),
    )
    expect(lostViolations).toContainEqual(expect.objectContaining({ rule: 'lost.reason' }))
  })

  test('won requires basis; agent right is checked by the service layer', () => {
    const toStage = stage({ id: 'won', semanticType: 'won', isWon: true, position: 10 })
    const noBasis = evaluateTransition(transitionInput({ toStage }))
    expect(noBasis.map((v) => v.rule)).toContain('won.basis')
    const agent = evaluateTransition(
      transitionInput({ toStage, wonBasis: 'Договор подписан', actorIsAgent: true }),
    )
    expect(agent).toEqual([])
    const human = evaluateTransition(
      transitionInput({
        toStage,
        wonBasis: 'Договор подписан',
        claims: [
          { fieldKey: 'problem', status: 'customer_confirmed' },
          { fieldKey: 'consequences', status: 'customer_confirmed' },
        ],
        hasProcessOwnerRole: true,
        deal: {
          problemStatement: 'Заказ висит',
          consequences: 'Просрочки',
          nextAgreedStep: 'Подписание',
        },
      }),
    )
    expect(human).toEqual([])
  })

  test('proposal requires approved draft unless overridden', () => {
    const toStage = stage({ id: 'p', semanticType: 'proposal', position: 5 })
    expect(evaluateTransition(transitionInput({ toStage })).map((v) => v.rule)).toContain(
      'proposal.version',
    )
    expect(
      evaluateTransition(transitionInput({ toStage, hasApprovedOrSentDraft: true })).map((v) => v.rule),
    ).toContain('qualified.problem')
    expect(
      evaluateTransition(
        transitionInput({
          toStage,
          hasApprovedOrSentDraft: true,
          claims: [
            { fieldKey: 'problem', status: 'customer_confirmed' },
            { fieldKey: 'consequences', status: 'customer_confirmed' },
          ],
          hasProcessOwnerRole: true,
          deal: {
            problemStatement: 'Ручной учёт',
            consequences: 'Ошибки',
            nextAgreedStep: 'КП',
          },
        }),
      ),
    ).toEqual([])
  })

  test('paused requires reason and return condition', () => {
    const toStage = stage({ id: 'pz', semanticType: 'paused', position: 8 })
    const violations = evaluateTransition(transitionInput({ toStage }))
    expect(violations.map((v) => v.rule).sort()).toEqual(['paused.reason', 'paused.resume'])
    expect(
      evaluateTransition(transitionInput({ toStage, pausedReason: 'Заморозили бюджет', resumeOn: '2026-12-01' }))
        .length,
    ).toBe(0)
  })
})

describe('computeFunnelStats — E2E-12 math', () => {
  const stages = [
    stage({ id: 's1', position: 0, semanticType: 'intake', title: 'Вход' }),
    stage({ id: 's2', position: 3, semanticType: 'qualified', title: 'Квалифицирована' }),
    stage({ id: 'lost', position: 9, semanticType: 'lost', isLost: true, title: 'Отказ' }),
  ]
  const deals = ['d1', 'd2', 'd3', 'd4', 'd5'].map((id) => ({
    id,
    stageId: id === 'd5' ? 's2' : 'lost',
    companyId: null,
    ownerId: null,
    source: null,
    createdAt: '2026-10-01T00:00:00Z',
  }))
  const events = deals.flatMap((deal, index) => [
    { dealId: deal.id, fromStageId: null, toStageId: 's1', event: 'initial_entry', movedAt: '2026-10-01T09:00:00Z', legacy: false },
    {
      dealId: deal.id,
      fromStageId: 's1',
      toStageId: deal.id === 'd5' ? 's2' : 'lost',
      event: 'moved',
      movedAt: `2026-10-0${index + 2}T09:00:00Z`,
      legacy: false,
    },
  ])

  test('4 lost + 1 advanced of 5: exits 100%, advanced 20%, lost 80%', () => {
    const stats = computeFunnelStats({
      events,
      deals,
      companies: [],
      stages,
      filters: {},
      now: '2026-10-17T00:00:00Z',
    })
    expect(stats.opportunities).toBe(5)
    expect(stats.exits).toEqual({ n: 5, total: 5, pct: 100 })
    expect(stats.advanced).toEqual({ n: 1, total: 5, pct: 20 })
    expect(stats.lost).toEqual({ n: 4, total: 5, pct: 80 })
    expect(stats.openOpportunities).toBe(1)
  })

  test('return and repeat touch do not create a second unique buyer', () => {
    const withReturn = [
      ...events,
      { dealId: 'd5', fromStageId: 's2', toStageId: 's1', event: 'moved', movedAt: '2026-10-05T09:00:00Z', legacy: false },
      { dealId: 'd5', fromStageId: 's1', toStageId: 's2', event: 'moved', movedAt: '2026-10-06T09:00:00Z', legacy: false },
    ]
    const stats = computeFunnelStats({
      events: withReturn,
      deals,
      companies: [],
      stages,
      filters: {},
      now: '2026-10-17T00:00:00Z',
    })
    expect(stats.opportunities).toBe(5)
    expect(stats.advanced.n).toBe(1)
    expect(stats.lost.n).toBe(4)
  })

  test('legacy rows are excluded and counted', () => {
    const stats = computeFunnelStats({
      events: [
        ...events,
        { dealId: 'd9', fromStageId: 's1', toStageId: 's2', event: 'moved', movedAt: '2026-09-01T09:00:00Z', legacy: true },
      ],
      deals,
      companies: [],
      stages,
      filters: {},
      now: '2026-10-17T00:00:00Z',
    })
    expect(stats.legacyEventsExcluded).toBe(1)
    expect(stats.opportunities).toBe(5)
  })
})

describe('pilot and launch', () => {
  test('activation blockers cover owners, data, criteria, decision date', () => {
    expect(pilotActivationBlockers({
      ordixOwnerId: null,
      clientOwnerContactId: null,
      clientOwnerName: null,
      sourceData: null,
      decisionDueOn: null,
      goal: null,
      paidNextStep: null,
      usersOverview: null,
      activeCriteriaCount: 0,
      criteriaAgreedAndMethoded: false,
    })).toHaveLength(9)
    expect(pilotActivationBlockers({
      ordixOwnerId: 'u1',
      clientOwnerContactId: 'c1',
      clientOwnerName: null,
      sourceData: 'Данные готовы',
      decisionDueOn: '2026-11-30',
      goal: 'Проверить участок',
      paidNextStep: 'Подписка на участок',
      usersOverview: 'Мастер и технолог',
      activeCriteriaCount: 2,
      criteriaAgreedAndMethoded: true,
    })).toEqual([])
  })

  test('contribution subtracts costs and priced hours from received money', () => {
    expect(
      computeContribution({ receivedTotal: 100_000, directCosts: 10_000, supportHours: 20, laborHourRate: 1500 }),
    ).toBe(60_000)
  })
})

describe('drafts', () => {
  test('send requires approved status', () => {
    expect(() =>
      assertDraftSendable({ status: 'draft', recipient: 'a@b.ru', contentHash: null, groupId: 'g' }),
    ).toThrow(/одобренной/)
    expect(() =>
      assertDraftSendable({ status: 'approved', recipient: 'a@b.ru', contentHash: 'x', groupId: 'g' }),
    ).not.toThrow()
  })

  test('content hash changes with recipient or body', () => {
    const base = { recipient: 'a@b.ru', subject: 'Тема', body: 'Текст', terms: null }
    expect(draftContentHash(base)).toBe(draftContentHash({ ...base }))
    expect(draftContentHash(base)).not.toBe(draftContentHash({ ...base, recipient: 'c@d.ru' }))
    expect(draftContentHash(base)).not.toBe(draftContentHash({ ...base, body: 'Другой текст' }))
  })
})

describe('nextActionFromOpenTasks', () => {
  test('earliest open task wins; done tasks ignored', () => {
    const summary = nextActionFromOpenTasks([
      { goal: 'Позвонить', action: 'Звонок', dueAt: '2026-10-20T09:00:00+03:00', status: 'open' },
      { goal: 'Отправить КП', action: null, dueAt: '2026-10-18T09:00:00+03:00', status: 'open' },
      { goal: 'Старое', action: null, dueAt: '2026-10-01T09:00:00+03:00', status: 'done' },
    ])
    expect(summary.nextActionAt).toBe('2026-10-18')
    expect(summary.nextAction).toBe('Отправить КП')
  })
})
