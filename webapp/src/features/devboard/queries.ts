import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSprintRequestSchema,
  sprintResponseSchema,
  sprintsResponseSchema,
} from '@oculus-business/contracts'
import type {
  CreateSprintRequest,
  CreateDevColumnRequest,
  CreateDevTaskRequest,
  UpdateDevColumnRequest,
  UpdateDevTaskRequest,
} from '@oculus-business/contracts'

import { useAuth } from '@/features/auth'
import {
  addDevTaskComment,
  createDevColumn,
  createDevTask,
  deleteDevColumn,
  deleteDevTask,
  fetchDevBoard,
  fetchDevTaskComments,
  moveDevTask,
  updateDevColumn,
  updateDevTask,
} from './api'

export const devQueryKeys = {
  all: ['dev'] as const,
  board: () => [...devQueryKeys.all, 'board'] as const,
  comments: (taskId: string) => [...devQueryKeys.all, 'comments', taskId] as const,
}

function useInvalidateDev() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: devQueryKeys.all })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }
}

export function useDevBoardQuery() {
  const { transport } = useAuth()
  return useQuery({
    queryKey: devQueryKeys.board(),
    queryFn: ({ signal }) => fetchDevBoard(transport, signal),
  })
}

export function useDevTaskCommentsQuery(taskId: string | null) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: devQueryKeys.comments(taskId ?? 'none'),
    queryFn: ({ signal }) => fetchDevTaskComments(transport, taskId as string, signal),
    enabled: taskId !== null,
  })
}

export function useCreateDevTaskMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateDev()
  return useMutation({
    mutationFn: (input: CreateDevTaskRequest) => createDevTask(transport, input),
    onSuccess: invalidate,
  })
}

export function useUpdateDevTaskMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateDev()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDevTaskRequest }) =>
      updateDevTask(transport, id, input),
    onSuccess: invalidate,
  })
}

export function useMoveDevTaskMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateDev()
  return useMutation({
    mutationFn: ({
      id,
      columnId,
      position,
    }: {
      id: string
      columnId: string
      position: number
    }) => moveDevTask(transport, id, { columnId, position }),
    onSuccess: invalidate,
  })
}

export function useDeleteDevTaskMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateDev()
  return useMutation({
    mutationFn: (id: string) => deleteDevTask(transport, id),
    onSuccess: invalidate,
  })
}

export function useAddDevTaskCommentMutation(taskId: string) {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => addDevTaskComment(transport, taskId, body),
    onSuccess: (response) => {
      queryClient.setQueryData(devQueryKeys.comments(taskId), response)
    },
  })
}

export function useCreateDevColumnMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateDev()
  return useMutation({
    mutationFn: (input: CreateDevColumnRequest) => createDevColumn(transport, input),
    onSuccess: invalidate,
  })
}

export function useUpdateDevColumnMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateDev()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDevColumnRequest }) =>
      updateDevColumn(transport, id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteDevColumnMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateDev()
  return useMutation({
    mutationFn: (id: string) => deleteDevColumn(transport, id),
    onSuccess: invalidate,
  })
}

export function useSprintsQuery() {
  const { transport } = useAuth()
  return useQuery({
    queryKey: [...devQueryKeys.all, 'sprints'],
    queryFn: ({ signal }) =>
      transport.request('/api/dev/sprints', sprintsResponseSchema, { signal }),
  })
}

export function useCreateSprintMutation() {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSprintRequest) =>
      transport.request('/api/dev/sprints', sprintResponseSchema, {
        method: 'POST',
        body: createSprintRequestSchema.parse(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: devQueryKeys.all })
    },
  })
}

export async function finishSprint(transport: AuthenticatedTransportLike, id: string) {
  await transport.raw(`/api/dev/sprints/${id}/finish`, { method: 'POST' })
}

type AuthenticatedTransportLike = {
  raw(path: string, options?: { method?: string }): Promise<Response>
}
