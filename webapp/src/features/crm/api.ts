import {
  createCrmStageRequestSchema,
  createDealCommentRequestSchema,
  createDealRequestSchema,
  crmBoardResponseSchema,
  crmStageResponseSchema,
  dealCommentsResponseSchema,
  dealResponseSchema,
  moveDealRequestSchema,
  updateCrmStageRequestSchema,
  updateDealRequestSchema,
  type CreateCrmStageRequest,
  type CreateDealRequest,
  type MoveDealRequest,
  type UpdateCrmStageRequest,
  type UpdateDealRequest,
} from '@oculus-business/contracts'

import type { AuthenticatedTransport } from '@/platform/api'

export function fetchCrmBoard(transport: AuthenticatedTransport, signal?: AbortSignal) {
  return transport.request('/api/crm/board', crmBoardResponseSchema, { signal })
}

export function createDeal(transport: AuthenticatedTransport, input: CreateDealRequest) {
  return transport.request('/api/crm/deals', dealResponseSchema, {
    method: 'POST',
    body: createDealRequestSchema.parse(input),
  })
}

export function updateDeal(
  transport: AuthenticatedTransport,
  id: string,
  input: UpdateDealRequest,
) {
  return transport.request(`/api/crm/deals/${id}`, dealResponseSchema, {
    method: 'PATCH',
    body: updateDealRequestSchema.parse(input),
  })
}

export function moveDeal(transport: AuthenticatedTransport, id: string, input: MoveDealRequest) {
  return transport.request(`/api/crm/deals/${id}/move`, dealResponseSchema, {
    method: 'POST',
    body: moveDealRequestSchema.parse(input),
  })
}

export async function deleteDeal(transport: AuthenticatedTransport, id: string) {
  await transport.raw(`/api/crm/deals/${id}`, { method: 'DELETE' })
}

export function fetchDealComments(
  transport: AuthenticatedTransport,
  dealId: string,
  signal?: AbortSignal,
) {
  return transport.request(`/api/crm/deals/${dealId}/comments`, dealCommentsResponseSchema, {
    signal,
  })
}

export function addDealComment(transport: AuthenticatedTransport, dealId: string, body: string) {
  return transport.request(`/api/crm/deals/${dealId}/comments`, dealCommentsResponseSchema, {
    method: 'POST',
    body: createDealCommentRequestSchema.parse({ body }),
  })
}

export function createStage(transport: AuthenticatedTransport, input: CreateCrmStageRequest) {
  return transport.request('/api/crm/stages', crmStageResponseSchema, {
    method: 'POST',
    body: createCrmStageRequestSchema.parse(input),
  })
}

export function updateStage(
  transport: AuthenticatedTransport,
  id: string,
  input: UpdateCrmStageRequest,
) {
  return transport.request(`/api/crm/stages/${id}`, crmStageResponseSchema, {
    method: 'PATCH',
    body: updateCrmStageRequestSchema.parse(input),
  })
}

export async function deleteStage(transport: AuthenticatedTransport, id: string) {
  await transport.raw(`/api/crm/stages/${id}`, { method: 'DELETE' })
}
