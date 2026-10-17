import {
  activityResponseSchema,
  agentOpLogsResponseSchema,
  activitiesResponseSchema,
  businessUsersResponseSchema,
  companiesQuerySchema,
  companiesResponseSchema,
  companyEventsSchema,
  companyResponseSchema,
  contactChannelResponseSchema,
  contactResponseSchema,
  contactsResponseSchema,
  createActivityRequestSchema,
  createCompanyRequestSchema,
  createContactChannelRequestSchema,
  createContactRequestSchema,
  createDraftRequestSchema,
  createSalesTaskRequestSchema,
  claimResponseSchema,
  dealContactRoleSchema,
  crmFunnelReportQuerySchema,
  crmFunnelReportResponseSchema,
  dealDetailResponseSchema,
  dealResponseSchema,
  dealSubscriptionRequestSchema,
  draftResponseSchema,
  draftsResponseSchema,
  importApplyRequestSchema,
  importApplyResponseSchema,
  importPipelinePayloadSchema,
  importPreviewResponseSchema,
  paymentReceiptResponseSchema,
  proposalDraftsResponseSchema,
  saveDealClaimRequestSchema,
  saveDealContactRoleRequestSchema,
  salesTaskResponseSchema,
  salesTasksResponseSchema,
  todayResponseSchema,
  updateCompanyRequestSchema,
  updateContactChannelRequestSchema,
  updateContactRequestSchema,
  updateDraftRequestSchema,
  updateSalesTaskRequestSchema,
  type CompaniesQuery,
  type CreateActivityRequest,
  type CreateCompanyRequest,
  type CreateContactChannelRequest,
  type CreateContactRequest,
  type CreateDraftRequest,
  type CreateSalesTaskRequest,
  type CrmFunnelReportQuery,
  type DealSubscriptionRequest,
  type ImportApplyRequest,
  type PaymentReceiptRequest,
  type SaveDealClaimRequest,
  type SaveDealContactRoleRequest,
  type UpdateCompanyRequest,
  type UpdateContactChannelRequest,
  type UpdateContactRequest,
  type UpdateDraftRequest,
  type UpdateSalesTaskRequest,
} from '@oculus-business/contracts'
import type { z } from 'zod'

import type { AuthenticatedTransport } from '@/platform/api'

/// API-клиент B2B-продаж: компании, контакты, взаимодействия, задачи, черновики,
/// пилоты, запуск, подписки, поступления, отчёт, импорт (ТЗ от 17.10.2026).

export function fetchCompanies(transport: AuthenticatedTransport, query: CompaniesQuery, signal?: AbortSignal) {
  const params = new URLSearchParams()
  if (query.search !== undefined) params.set('search', query.search)
  if (query.researchStatus !== undefined) params.set('researchStatus', query.researchStatus)
  if (query.relationStatus !== undefined) params.set('relationStatus', query.relationStatus)
  if (query.segment !== undefined) params.set('segment', query.segment)
  if (query.ownerId !== undefined) params.set('ownerId', query.ownerId)
  if (query.dnc !== undefined) params.set('dnc', query.dnc)
  params.set('limit', String(query.limit))
  params.set('offset', String(query.offset))
  return transport.request(`/api/crm/companies?${params.toString()}`, companiesResponseSchema, { signal })
}

export function fetchCompany(transport: AuthenticatedTransport, id: string, signal?: AbortSignal) {
  return transport.request(`/api/crm/companies/${id}`, companyResponseSchema, { signal })
}

export function createCompany(transport: AuthenticatedTransport, input: CreateCompanyRequest) {
  return transport.request('/api/crm/companies', companyResponseSchema, {
    method: 'POST',
    body: createCompanyRequestSchema.parse(input),
  })
}

export function updateCompany(transport: AuthenticatedTransport, id: string, input: UpdateCompanyRequest) {
  return transport.request(`/api/crm/companies/${id}`, companyResponseSchema, {
    method: 'PATCH',
    body: updateCompanyRequestSchema.parse(input),
  })
}

export function setCompanyDnc(
  transport: AuthenticatedTransport,
  id: string,
  input: { reason: string; scope: 'all' | 'commercial'; source?: string | null },
) {
  return transport.request(`/api/crm/companies/${id}/dnc`, companyResponseSchema, {
    method: 'POST',
    body: input,
  })
}

export function liftCompanyDnc(transport: AuthenticatedTransport, id: string, reason: string) {
  return transport.request(`/api/crm/companies/${id}/dnc/lift`, companyResponseSchema, {
    method: 'POST',
    body: { reason },
  })
}

export function fetchCompanyEvents(transport: AuthenticatedTransport, companyId: string, signal?: AbortSignal) {
  return transport.request(`/api/crm/companies/${companyId}/events`, companyEventsSchema, { signal })
}

export function fetchContacts(transport: AuthenticatedTransport, companyId: string, signal?: AbortSignal) {
  return transport.request(`/api/crm/contacts?companyId=${companyId}`, contactsResponseSchema, { signal })
}

export function createContact(transport: AuthenticatedTransport, input: CreateContactRequest) {
  return transport.request('/api/crm/contacts', contactResponseSchema, {
    method: 'POST',
    body: createContactRequestSchema.parse(input),
  })
}

export function updateContact(transport: AuthenticatedTransport, id: string, input: UpdateContactRequest) {
  return transport.request(`/api/crm/contacts/${id}`, contactResponseSchema, {
    method: 'PATCH',
    body: updateContactRequestSchema.parse(input),
  })
}

export function setContactDnc(
  transport: AuthenticatedTransport,
  id: string,
  input: { reason: string; scope: 'all' | 'commercial'; source?: string | null },
) {
  return transport.request(`/api/crm/contacts/${id}/dnc`, contactResponseSchema, {
    method: 'POST',
    body: input,
  })
}

export function liftContactDnc(transport: AuthenticatedTransport, id: string, reason: string) {
  return transport.request(`/api/crm/contacts/${id}/dnc/lift`, contactResponseSchema, {
    method: 'POST',
    body: { reason },
  })
}

export function createChannel(transport: AuthenticatedTransport, contactId: string, input: CreateContactChannelRequest) {
  return transport.request(`/api/crm/contacts/${contactId}/channels`, contactChannelResponseSchema, {
    method: 'POST',
    body: createContactChannelRequestSchema.parse(input),
  })
}

export function updateChannel(transport: AuthenticatedTransport, id: string, input: UpdateContactChannelRequest) {
  return transport.request(`/api/crm/channels/${id}`, contactChannelResponseSchema, {
    method: 'PATCH',
    body: updateContactChannelRequestSchema.parse(input),
  })
}

export function fetchDealDetail(transport: AuthenticatedTransport, id: string, signal?: AbortSignal) {
  return transport.request(`/api/crm/deals/${id}`, dealDetailResponseSchema, { signal })
}

export function saveDealClaim(transport: AuthenticatedTransport, dealId: string, input: SaveDealClaimRequest) {
  return transport.request(`/api/crm/deals/${dealId}/claims`, claimResponseSchema, {
    method: 'PUT',
    body: saveDealClaimRequestSchema.parse(input),
  })
}

export function saveDealContactRole(transport: AuthenticatedTransport, dealId: string, input: SaveDealContactRoleRequest) {
  return transport.request(`/api/crm/deals/${dealId}/contact-roles`, dealContactRoleSchema, {
    method: 'PUT',
    body: saveDealContactRoleRequestSchema.parse(input),
  })
}

export function deleteDealContactRole(
  transport: AuthenticatedTransport,
  dealId: string,
  roleId: string,
) {
  return transport.raw(`/api/crm/deals/${dealId}/contact-roles/${roleId}`, { method: 'DELETE' })
}

export function fetchActivities(
  transport: AuthenticatedTransport,
  query: { companyId?: string; dealId?: string; unprocessedOnly?: boolean; limit?: number },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (query.companyId !== undefined) params.set('companyId', query.companyId)
  if (query.dealId !== undefined) params.set('dealId', query.dealId)
  if (query.unprocessedOnly === true) params.set('unprocessedOnly', 'true')
  params.set('limit', String(query.limit ?? 50))
  return transport.request(`/api/crm/activities?${params.toString()}`, activitiesResponseSchema, { signal })
}

export function createActivity(transport: AuthenticatedTransport, input: CreateActivityRequest) {
  return transport.request('/api/crm/activities', activityResponseSchema, {
    method: 'POST',
    body: createActivityRequestSchema.parse(input),
  })
}

export function markActivityProcessed(transport: AuthenticatedTransport, id: string) {
  return transport.raw(`/api/crm/activities/${id}/processed`, { method: 'POST', body: '{}' })
}

export function fetchSalesTasks(
  transport: AuthenticatedTransport,
  query: { status?: 'open' | 'done' | 'cancelled'; companyId?: string; dealId?: string; limit?: number },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (query.status !== undefined) params.set('status', query.status)
  if (query.companyId !== undefined) params.set('companyId', query.companyId)
  if (query.dealId !== undefined) params.set('dealId', query.dealId)
  params.set('limit', String(query.limit ?? 50))
  return transport.request(`/api/crm/tasks?${params.toString()}`, salesTasksResponseSchema, { signal })
}

export function createSalesTask(transport: AuthenticatedTransport, input: CreateSalesTaskRequest) {
  return transport.request('/api/crm/tasks', salesTaskResponseSchema, {
    method: 'POST',
    body: createSalesTaskRequestSchema.parse(input),
  })
}

export function updateSalesTask(transport: AuthenticatedTransport, id: string, input: UpdateSalesTaskRequest) {
  return transport.request(`/api/crm/tasks/${id}`, salesTaskResponseSchema, {
    method: 'PATCH',
    body: updateSalesTaskRequestSchema.parse(input),
  })
}

export function fetchToday(transport: AuthenticatedTransport, signal?: AbortSignal) {
  return transport.request('/api/crm/today', todayResponseSchema, { signal })
}

export function fetchDrafts(
  transport: AuthenticatedTransport,
  query: { status?: string; companyId?: string; dealId?: string; limit?: number },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (query.status !== undefined) params.set('status', query.status)
  if (query.companyId !== undefined) params.set('companyId', query.companyId)
  if (query.dealId !== undefined) params.set('dealId', query.dealId)
  params.set('limit', String(query.limit ?? 100))
  return transport.request(`/api/crm/drafts?${params.toString()}`, draftsResponseSchema, { signal })
}

export function createDraft(transport: AuthenticatedTransport, input: CreateDraftRequest) {
  return transport.request('/api/crm/drafts', draftResponseSchema, {
    method: 'POST',
    body: createDraftRequestSchema.parse(input),
  })
}

export function updateDraft(transport: AuthenticatedTransport, id: string, input: UpdateDraftRequest) {
  return transport.request(`/api/crm/drafts/${id}`, draftResponseSchema, {
    method: 'PATCH',
    body: updateDraftRequestSchema.parse(input),
  })
}

export function draftAction(
  transport: AuthenticatedTransport,
  id: string,
  action: 'review' | 'approve' | 'send' | 'cancel',
  body?: Record<string, unknown>,
) {
  return transport.request(`/api/crm/drafts/${id}/${action}`, draftResponseSchema, {
    method: 'POST',
    body: body ?? {},
  })
}

export function fetchDraftVersions(transport: AuthenticatedTransport, id: string, signal?: AbortSignal) {
  return transport.request(`/api/crm/drafts/${id}/versions`, proposalDraftsResponseSchema, { signal })
}

export function fetchFunnelReport(transport: AuthenticatedTransport, query: CrmFunnelReportQuery, signal?: AbortSignal) {
  const params = new URLSearchParams()
  if (query.from !== undefined) params.set('from', query.from)
  if (query.to !== undefined) params.set('to', query.to)
  if (query.cohort !== undefined) params.set('cohort', query.cohort)
  if (query.segment !== undefined) params.set('segment', query.segment)
  if (query.source !== undefined) params.set('source', query.source)
  if (query.ownerId !== undefined) params.set('ownerId', query.ownerId)
  return transport.request(`/api/crm/report/funnel?${params.toString()}`, crmFunnelReportResponseSchema, { signal })
}

export function importPreview(transport: AuthenticatedTransport, payload: unknown) {
  return transport.request('/api/crm/import/preview', importPreviewResponseSchema, {
    method: 'POST',
    body: importPipelinePayloadSchema.parse(payload),
  })
}

export function importApply(transport: AuthenticatedTransport, input: ImportApplyRequest) {
  return transport.request('/api/crm/import/apply', importApplyResponseSchema, {
    method: 'POST',
    body: importApplyRequestSchema.parse(input),
  })
}

export function fetchBusinessUsers(transport: AuthenticatedTransport, signal?: AbortSignal) {
  return transport.request('/api/crm/users', businessUsersResponseSchema, { signal })
}

export function setSubscription(transport: AuthenticatedTransport, dealId: string, input: DealSubscriptionRequest) {
  return transport.request(`/api/finance/deals/${dealId}/subscription`, dealResponseSchema, {
    method: 'POST',
    body: dealSubscriptionRequestSchema.parse(input),
  })
}

export function confirmReceipt(transport: AuthenticatedTransport, paymentId: string, input: PaymentReceiptRequest) {
  return transport.request(`/api/finance/expected/${paymentId}/receipts`, paymentReceiptResponseSchema, {
    method: 'POST',
    body: input,
  })
}

export function fetchAgentOps(transport: AuthenticatedTransport, signal?: AbortSignal) {
  return transport.request('/api/crm/agent-ops', agentOpLogsResponseSchema, { signal })
}

export type FunnelQueryInput = z.infer<typeof crmFunnelReportQuerySchema>
export type CompaniesQueryInput = z.infer<typeof companiesQuerySchema>

export function upsertPilot(
  transport: AuthenticatedTransport,
  dealId: string,
  input: Record<string, unknown>,
) {
  return transport.raw(`/api/crm/deals/${dealId}/pilot`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function pilotAction(
  transport: AuthenticatedTransport,
  dealId: string,
  action: 'activate' | 'decision',
  body: Record<string, unknown>,
) {
  return transport.raw(`/api/crm/deals/${dealId}/pilot/${action}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function addPilotCriterion(
  transport: AuthenticatedTransport,
  dealId: string,
  input: { statement: string; method?: string | null },
) {
  return transport.raw(`/api/crm/deals/${dealId}/pilot/criteria`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function addPilotMilestone(
  transport: AuthenticatedTransport,
  dealId: string,
  input: { side: 'client' | 'ordix'; commitment: string; dueOn?: string | null },
) {
  return transport.raw(`/api/crm/deals/${dealId}/pilot/milestones`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function upsertLaunch(
  transport: AuthenticatedTransport,
  dealId: string,
  input: Record<string, unknown>,
) {
  return transport.raw(`/api/crm/deals/${dealId}/launch`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function createExtensionDeal(
  transport: AuthenticatedTransport,
  dealId: string,
  input: { title: string; monthlyAmount: number; oneTimeAmount: number; basis: string },
) {
  return transport.raw(`/api/crm/deals/${dealId}/extension`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
