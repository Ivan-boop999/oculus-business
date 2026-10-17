import { describe, expect, test } from 'bun:test'

import {
  activitySchema,
  companiesQuerySchema,
  createActivityRequestSchema,
  createDraftRequestSchema,
  dealDetailSchema,
  importPipelinePayloadSchema,
  paymentReceiptRequestSchema,
  pilotUpsertRequestSchema,
  proposalDraftSchema,
} from './business'

describe('business sales contracts', () => {
  test('accepts activity with timezone offset datetime', () => {
    const request = {
      companyId: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b',
      occurredAt: '2026-10-17T10:30:00+03:00',
      channel: 'call',
      actionType: 'call_attempt',
      direction: 'outbound',
      result: 'Не дозвонились',
    }
    const parsed = createActivityRequestSchema.parse(request)
    expect(parsed.timezone).toBe('Europe/Moscow')
    expect(parsed.occurredAt).toBe('2026-10-17T10:30:00+03:00')
  })

  test('activity DTO roundtrip keeps processedAt nullable', () => {
    const dto = activitySchema.parse({
      id: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b',
      companyId: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b',
      companyName: 'ТЕХНИК',
      dealId: null,
      dealTitle: null,
      contactId: null,
      contactName: null,
      occurredAt: '2026-10-17T10:30:00+03:00',
      timezone: 'Europe/Moscow',
      channel: 'call',
      actionType: 'conversation',
      direction: 'inbound',
      result: null,
      note: null,
      verbatimQuote: null,
      processedAt: null,
      authorId: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b',
      authorName: 'Иван',
      createdAt: '2026-10-17T07:31:00.000Z',
    })
    expect(dto.processedAt).toBeNull()
  })

  test('deal detail rejects unknown keys (strict)', () => {
    expect(() =>
      dealDetailSchema.parse({ nope: true }),
    ).toThrow()
  })

  test('draft create validates terms and evidence', () => {
    const parsed = createDraftRequestSchema.parse({
      companyId: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b',
      channel: 'email',
      recipient: 'info@tehniknn.ru',
      subject: 'Вопрос по прохождению заказа',
      body: 'Текст письма',
      terms: { scope: 'Участок токарных операций', validUntil: '2026-11-17' },
      evidence: ['activity:1'],
    })
    expect(parsed.terms?.scope).toBe('Участок токарных операций')
    expect(() =>
      createDraftRequestSchema.parse({
        companyId: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b',
        channel: 'email',
        recipient: 'x',
        body: '',
      }),
    ).toThrow()
  })

  test('proposal draft DTO parses full status surface', () => {
    const dto = proposalDraftSchema.parse({
      id: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b',
      groupId: '1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b',
      version: 2,
      dealId: null,
      companyId: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b',
      companyName: 'ТЕХНИК',
      contactId: null,
      channel: 'email',
      recipient: 'info@tehniknn.ru',
      subject: null,
      body: 'Текст',
      terms: null,
      productClaimsVersion: null,
      evidence: null,
      status: 'approved',
      deliveredAt: null,
      deliveryProof: null,
      holdReason: null,
      rowVersion: 1,
      createdById: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b',
      createdByName: 'Иван',
      reviewedById: null,
      reviewedAt: null,
      approvedById: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b',
      approvedByName: 'Иван',
      approvedAt: '2026-10-17T09:00:00+03:00',
      contentHash: 'abc',
      sentAt: null,
      sentById: null,
      sentByName: null,
      externalMessageId: null,
      cancelledAt: null,
      cancelReason: null,
      externalId: null,
      createdAt: '2026-10-17T06:00:00.000Z',
      updatedAt: '2026-10-17T06:00:00.000Z',
    })
    expect(dto.status).toBe('approved')
    expect(dto.version).toBe(2)
  })

  test('import payload accepts real pipeline.json account shape', () => {
    const parsed = importPipelinePayloadSchema.parse({
      version: 1,
      updated_at: '2026-10-17',
      mode: 'research_and_drafts',
      accounts: [
        {
          id: 'account-001',
          company_name: 'ТЕХНИК',
          official_domain: 'tehniknn.ru',
          region: 'Нижний Новгород',
          segment_hypothesis: 'Механообработка',
          stage: 'research',
          primary_offer: 'Окулус / оптимизация процесса',
          fit_reason: 'На сайте описаны участки с ЧПУ.',
          hypothesis: 'Проверить путь заказа.',
          confirmed_problem: null,
          evidence: [{ claim: 'x', source_url: 'https://tehniknn.ru/', accessed_date: '2026-10-17' }],
          contacts: [
            {
              name: null,
              job_title: null,
              target_role_hypothesis: 'Руководитель производства',
              email: 'info@tehniknn.ru',
              phone: '+7 (831) 423-22-66',
              source_url: 'https://tehniknn.ru/',
              verification_status: 'published',
              is_direct_decision_maker: false,
              delivery_verified: false,
              do_not_contact: false,
            },
          ],
          qualification_unknowns: 'Численность не установлена.',
          discovery_questions: ['Вопрос 1'],
          outbound_drafts: [{ subject: 'Тема', body: 'Тело', status: 'draft', sent_at: null }],
          next_action: 'Позвонить',
          next_action_owner: 'Иван',
          next_action_date: '2026-10-20',
          interactions: [],
          updated_at: '2026-10-17',
        },
      ],
    })
    expect(parsed.accounts[0]!.contacts).toHaveLength(1)
    expect(parsed.accounts[0]!.outbound_drafts).toHaveLength(1)
  })

  test('receipt request requires actual date and positive amount', () => {
    expect(() =>
      paymentReceiptRequestSchema.parse({ amount: 0, actualReceivedOn: '2026-10-17' }),
    ).toThrow()
    expect(
      paymentReceiptRequestSchema.parse({ amount: 1000, actualReceivedOn: '2026-10-17' }).amount,
    ).toBe(1000)
  })

  test('companies query coerces pagination and rejects bad status', () => {
    const query = companiesQuerySchema.parse({ limit: '25', offset: '0' })
    expect(query.limit).toBe(25)
    expect(() => companiesQuerySchema.parse({ researchStatus: 'bogus' })).toThrow()
  })

  test('pilot upsert accepts partial fields', () => {
    const parsed = pilotUpsertRequestSchema.parse({ goal: 'Проверить участок' })
    expect(parsed.goal).toBe('Проверить участок')
    expect(() => pilotUpsertRequestSchema.parse({ hoursSpent: -1 })).toThrow()
  })
})
