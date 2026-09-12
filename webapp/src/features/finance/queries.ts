import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BizSettings,
  CreateRecurringItemRequest,
  CreateTxnRequest,
  UpdateRecurringItemRequest,
  UpdateTxnRequest,
} from '@oculus-business/contracts'

import { useAuth } from '@/features/auth'
import {
  createRecurring,
  createTxn,
  deleteRecurring,
  deleteTxn,
  fetchForecast,
  fetchRecurring,
  fetchSettings,
  fetchSummary,
  fetchTxns,
  saveSettings,
  updateRecurring,
  updateTxn,
} from './api'

export const financeQueryKeys = {
  all: ['finance'] as const,
  txns: (month: string) => [...financeQueryKeys.all, 'txns', month] as const,
  recurring: () => [...financeQueryKeys.all, 'recurring'] as const,
  settings: () => [...financeQueryKeys.all, 'settings'] as const,
  summary: (month: string) => [...financeQueryKeys.all, 'summary', month] as const,
  forecast: (months: number) => [...financeQueryKeys.all, 'forecast', months] as const,
}

function useInvalidateFinance() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }
}

export function useTxnsQuery(month: string) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: financeQueryKeys.txns(month),
    queryFn: ({ signal }) => fetchTxns(transport, month === '' ? undefined : month, signal),
  })
}

export function useSummaryQuery(month: string) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: financeQueryKeys.summary(month),
    queryFn: ({ signal }) =>
      fetchSummary(transport, month === '' ? undefined : month, signal),
  })
}

export function useForecastQuery(months = 6) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: financeQueryKeys.forecast(months),
    queryFn: ({ signal }) => fetchForecast(transport, months, signal),
  })
}

export function useRecurringQuery() {
  const { transport } = useAuth()
  return useQuery({
    queryKey: financeQueryKeys.recurring(),
    queryFn: ({ signal }) => fetchRecurring(transport, signal),
  })
}

export function useSettingsQuery() {
  const { transport } = useAuth()
  return useQuery({
    queryKey: financeQueryKeys.settings(),
    queryFn: ({ signal }) => fetchSettings(transport, signal),
  })
}

export function useCreateTxnMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: (input: CreateTxnRequest) => createTxn(transport, input),
    onSuccess: invalidate,
  })
}

export function useUpdateTxnMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTxnRequest }) =>
      updateTxn(transport, id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteTxnMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: (id: string) => deleteTxn(transport, id),
    onSuccess: invalidate,
  })
}

export function useCreateRecurringMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: (input: CreateRecurringItemRequest) => createRecurring(transport, input),
    onSuccess: invalidate,
  })
}

export function useUpdateRecurringMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRecurringItemRequest }) =>
      updateRecurring(transport, id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteRecurringMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: (id: string) => deleteRecurring(transport, id),
    onSuccess: invalidate,
  })
}

export function useSaveSettingsMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: (input: BizSettings) => saveSettings(transport, input),
    onSuccess: invalidate,
  })
}
