import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dealHistoryResponseSchema } from '@oculus-business/contracts'
import type { CreateCrmStageRequest, CreateDealRequest, UpdateCrmStageRequest, UpdateDealRequest } from '@oculus-business/contracts'

import { useAuth } from '@/features/auth'
import {
  addDealComment,
  createDeal,
  createStage,
  deleteDeal,
  deleteStage,
  fetchCrmBoard,
  fetchDealComments,
  moveDeal,
  updateDeal,
  updateStage,
} from './api'

export const crmQueryKeys = {
  all: ['crm'] as const,
  board: () => [...crmQueryKeys.all, 'board'] as const,
  comments: (dealId: string) => [...crmQueryKeys.all, 'comments', dealId] as const,
}

export function crmBoardQueryOptions(transport: Parameters<typeof fetchCrmBoard>[0]) {
  return queryOptions({
    queryKey: crmQueryKeys.board(),
    queryFn: ({ signal }) => fetchCrmBoard(transport, signal),
  })
}

export function useCrmBoardQuery() {
  const { transport } = useAuth()
  return useQuery(crmBoardQueryOptions(transport))
}

export function useDealCommentsQuery(dealId: string | null) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: crmQueryKeys.comments(dealId ?? 'none'),
    queryFn: ({ signal }) => fetchDealComments(transport, dealId as string, signal),
    enabled: dealId !== null,
  })
}

function useInvalidateCrm() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: crmQueryKeys.all })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    void queryClient.invalidateQueries({ queryKey: ['finance'] })
  }
}

export function useCreateDealMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateCrm()
  return useMutation({
    mutationFn: (input: CreateDealRequest) => createDeal(transport, input),
    onSuccess: invalidate,
  })
}

export function useUpdateDealMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateCrm()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDealRequest }) =>
      updateDeal(transport, id, input),
    onSuccess: invalidate,
  })
}

export function useMoveDealMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateCrm()
  return useMutation({
    mutationFn: ({
      id,
      stageId,
      position,
    }: {
      id: string
      stageId: string
      position: number
    }) => moveDeal(transport, id, { stageId, position }),
    onSuccess: invalidate,
  })
}

export function useDeleteDealMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateCrm()
  return useMutation({
    mutationFn: (id: string) => deleteDeal(transport, id),
    onSuccess: invalidate,
  })
}

export function useAddDealCommentMutation(dealId: string) {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => addDealComment(transport, dealId, body),
    onSuccess: (response) => {
      queryClient.setQueryData(crmQueryKeys.comments(dealId), response)
    },
  })
}

export function useCreateStageMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateCrm()
  return useMutation({
    mutationFn: (input: CreateCrmStageRequest) => createStage(transport, input),
    onSuccess: invalidate,
  })
}

export function useUpdateStageMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateCrm()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCrmStageRequest }) =>
      updateStage(transport, id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteStageMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateCrm()
  return useMutation({
    mutationFn: (id: string) => deleteStage(transport, id),
    onSuccess: invalidate,
  })
}

export function useDealHistoryQuery(dealId: string | null) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: [...crmQueryKeys.all, 'history', dealId ?? 'none'],
    queryFn: ({ signal }) =>
      transport.request(`/api/crm/deals/${dealId}/history`, dealHistoryResponseSchema, {
        signal,
      }),
    enabled: dealId !== null,
  })
}

export const companiesQueryKeys = {
  all: ['crm', 'companies'] as const,
}
