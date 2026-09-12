import {
  bizSettingsResponseSchema,
  createRecurringItemRequestSchema,
  createTxnRequestSchema,
  financeSummaryResponseSchema,
  forecastResponseSchema,
  recurringItemResponseSchema,
  recurringItemsResponseSchema,
  txnResponseSchema,
  txnsResponseSchema,
  updateBizSettingsRequestSchema,
  updateRecurringItemRequestSchema,
  updateTxnRequestSchema,
  type CreateRecurringItemRequest,
  type CreateTxnRequest,
  type UpdateRecurringItemRequest,
  type UpdateTxnRequest,
  type BizSettings,
} from '@oculus-business/contracts'

import type { AuthenticatedTransport } from '@/platform/api'

export function fetchTxns(
  transport: AuthenticatedTransport,
  month: string | undefined,
  signal?: AbortSignal,
) {
  return transport.request(
    month === undefined ? '/api/finance/txns' : `/api/finance/txns?month=${month}`,
    txnsResponseSchema,
    { signal },
  )
}

export function createTxn(transport: AuthenticatedTransport, input: CreateTxnRequest) {
  return transport.request('/api/finance/txns', txnResponseSchema, {
    method: 'POST',
    body: createTxnRequestSchema.parse(input),
  })
}

export function updateTxn(
  transport: AuthenticatedTransport,
  id: string,
  input: UpdateTxnRequest,
) {
  return transport.request(`/api/finance/txns/${id}`, txnResponseSchema, {
    method: 'PATCH',
    body: updateTxnRequestSchema.parse(input),
  })
}

export async function deleteTxn(transport: AuthenticatedTransport, id: string) {
  await transport.raw(`/api/finance/txns/${id}`, { method: 'DELETE' })
}

export function fetchRecurring(transport: AuthenticatedTransport, signal?: AbortSignal) {
  return transport.request('/api/finance/recurring', recurringItemsResponseSchema, { signal })
}

export function createRecurring(
  transport: AuthenticatedTransport,
  input: CreateRecurringItemRequest,
) {
  return transport.request('/api/finance/recurring', recurringItemResponseSchema, {
    method: 'POST',
    body: createRecurringItemRequestSchema.parse(input),
  })
}

export function updateRecurring(
  transport: AuthenticatedTransport,
  id: string,
  input: UpdateRecurringItemRequest,
) {
  return transport.request(`/api/finance/recurring/${id}`, recurringItemResponseSchema, {
    method: 'PATCH',
    body: updateRecurringItemRequestSchema.parse(input),
  })
}

export async function deleteRecurring(transport: AuthenticatedTransport, id: string) {
  await transport.raw(`/api/finance/recurring/${id}`, { method: 'DELETE' })
}

export function fetchSettings(transport: AuthenticatedTransport, signal?: AbortSignal) {
  return transport.request('/api/finance/settings', bizSettingsResponseSchema, { signal })
}

export function saveSettings(transport: AuthenticatedTransport, input: BizSettings) {
  return transport.request('/api/finance/settings', bizSettingsResponseSchema, {
    method: 'PUT',
    body: updateBizSettingsRequestSchema.parse(input),
  })
}

export function fetchSummary(
  transport: AuthenticatedTransport,
  month: string | undefined,
  signal?: AbortSignal,
) {
  return transport.request(
    month === undefined ? '/api/finance/summary' : `/api/finance/summary?month=${month}`,
    financeSummaryResponseSchema,
    { signal },
  )
}

export function fetchForecast(
  transport: AuthenticatedTransport,
  months: number,
  signal?: AbortSignal,
) {
  return transport.request(`/api/finance/forecast?months=${months}`, forecastResponseSchema, {
    signal,
  })
}
