import {
  createDevColumnRequestSchema,
  createDevTaskCommentRequestSchema,
  createDevTaskRequestSchema,
  devBoardResponseSchema,
  devColumnResponseSchema,
  devTaskCommentsResponseSchema,
  devTaskResponseSchema,
  moveDevTaskRequestSchema,
  updateDevColumnRequestSchema,
  updateDevTaskRequestSchema,
  type CreateDevColumnRequest,
  type CreateDevTaskRequest,
  type MoveDevTaskRequest,
  type UpdateDevColumnRequest,
  type UpdateDevTaskRequest,
} from '@oculus-business/contracts'

import type { AuthenticatedTransport } from '@/platform/api'

export function fetchDevBoard(transport: AuthenticatedTransport, signal?: AbortSignal) {
  return transport.request('/api/dev/board', devBoardResponseSchema, { signal })
}

export function createDevTask(transport: AuthenticatedTransport, input: CreateDevTaskRequest) {
  return transport.request('/api/dev/tasks', devTaskResponseSchema, {
    method: 'POST',
    body: createDevTaskRequestSchema.parse(input),
  })
}

export function updateDevTask(
  transport: AuthenticatedTransport,
  id: string,
  input: UpdateDevTaskRequest,
) {
  return transport.request(`/api/dev/tasks/${id}`, devTaskResponseSchema, {
    method: 'PATCH',
    body: updateDevTaskRequestSchema.parse(input),
  })
}

export function moveDevTask(
  transport: AuthenticatedTransport,
  id: string,
  input: MoveDevTaskRequest,
) {
  return transport.request(`/api/dev/tasks/${id}/move`, devTaskResponseSchema, {
    method: 'POST',
    body: moveDevTaskRequestSchema.parse(input),
  })
}

export async function deleteDevTask(transport: AuthenticatedTransport, id: string) {
  await transport.raw(`/api/dev/tasks/${id}`, { method: 'DELETE' })
}

export function fetchDevTaskComments(
  transport: AuthenticatedTransport,
  taskId: string,
  signal?: AbortSignal,
) {
  return transport.request(`/api/dev/tasks/${taskId}/comments`, devTaskCommentsResponseSchema, {
    signal,
  })
}

export function addDevTaskComment(
  transport: AuthenticatedTransport,
  taskId: string,
  body: string,
) {
  return transport.request(`/api/dev/tasks/${taskId}/comments`, devTaskCommentsResponseSchema, {
    method: 'POST',
    body: createDevTaskCommentRequestSchema.parse({ body }),
  })
}

export function createDevColumn(
  transport: AuthenticatedTransport,
  input: CreateDevColumnRequest,
) {
  return transport.request('/api/dev/columns', devColumnResponseSchema, {
    method: 'POST',
    body: createDevColumnRequestSchema.parse(input),
  })
}

export function updateDevColumn(
  transport: AuthenticatedTransport,
  id: string,
  input: UpdateDevColumnRequest,
) {
  return transport.request(`/api/dev/columns/${id}`, devColumnResponseSchema, {
    method: 'PATCH',
    body: updateDevColumnRequestSchema.parse(input),
  })
}

export async function deleteDevColumn(transport: AuthenticatedTransport, id: string) {
  await transport.raw(`/api/dev/columns/${id}`, { method: 'DELETE' })
}
