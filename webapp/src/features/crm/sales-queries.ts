import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth'
import {
  fetchActivities,
  fetchAgentOps,
  fetchBusinessUsers,
  fetchCompanies,
  fetchCompanyEvents,
  fetchContacts,
  fetchDealDetail,
  fetchDraftVersions,
  fetchDrafts,
  fetchFunnelReport,
  fetchSalesTasks,
  fetchToday,
  upsertPilot as upsertPilotApi,
  pilotAction as pilotActionApi,
  addPilotCriterion as addPilotCriterionApi,
  addPilotMilestone as addPilotMilestoneApi,
  upsertLaunch as upsertLaunchApi,
  createExtensionDeal as createExtensionDealApi,
  createActivity,
  createCompany,
  createContact,
  createDraft,
  createSalesTask,
  draftAction,
  importApply,
  importPreview,
  liftCompanyDnc,
  liftContactDnc,
  markActivityProcessed,
  saveDealClaim,
  saveDealContactRole,
  deleteDealContactRole,
  setCompanyDnc,
  setContactDnc,
  setSubscription,
  confirmReceipt,
  updateCompany,
  updateDraft,
  updateSalesTask,
} from './sales-api'

/// Серверное состояние B2B-продаж. Единая зона invalidation — 'sales' + связанные разделы.
export const salesQueryKeys = {
  all: ['sales'] as const,
  companies: (query: Record<string, unknown>) => [...salesQueryKeys.all, 'companies', query] as const,
  companyEvents: (id: string) => [...salesQueryKeys.all, 'company-events', id] as const,
  contacts: (companyId: string) => [...salesQueryKeys.all, 'contacts', companyId] as const,
  dealDetail: (id: string) => [...salesQueryKeys.all, 'deal', id] as const,
  activities: (query: Record<string, unknown>) => [...salesQueryKeys.all, 'activities', query] as const,
  tasks: (query: Record<string, unknown>) => [...salesQueryKeys.all, 'tasks', query] as const,
  today: () => [...salesQueryKeys.all, 'today'] as const,
  drafts: (query: Record<string, unknown>) => [...salesQueryKeys.all, 'drafts', query] as const,
  draftVersions: (id: string) => [...salesQueryKeys.all, 'draft-versions', id] as const,
  funnel: (query: Record<string, unknown>) => [...salesQueryKeys.all, 'funnel', query] as const,
  users: () => [...salesQueryKeys.all, 'users'] as const,
  agentOps: () => [...salesQueryKeys.all, 'agent-ops'] as const,
}

function useInvalidateSales() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: salesQueryKeys.all })
    void queryClient.invalidateQueries({ queryKey: ['crm'] })
    void queryClient.invalidateQueries({ queryKey: ['finance'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }
}

export function useCompaniesQuery(query: Record<string, unknown>) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: salesQueryKeys.companies(query),
    queryFn: ({ signal }) =>
      fetchCompanies(
        transport,
        // Форма гарантирует совместимые поля; лимит/офсет по умолчанию заданы схемой.
        query as Parameters<typeof fetchCompanies>[1],
        signal,
      ),
  })
}

export function useCompanyEventsQuery(companyId: string | null) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: salesQueryKeys.companyEvents(companyId ?? 'none'),
    queryFn: ({ signal }) => fetchCompanyEvents(transport, companyId as string, signal),
    enabled: companyId !== null,
  })
}

export function useContactsQuery(companyId: string | null) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: salesQueryKeys.contacts(companyId ?? 'none'),
    queryFn: ({ signal }) => fetchContacts(transport, companyId as string, signal),
    enabled: companyId !== null,
  })
}

export function useDealDetailQuery(dealId: string | null) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: salesQueryKeys.dealDetail(dealId ?? 'none'),
    queryFn: ({ signal }) => fetchDealDetail(transport, dealId as string, signal),
    enabled: dealId !== null,
  })
}

export function useActivitiesQuery(query: Record<string, unknown>, enabled = true) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: salesQueryKeys.activities(query),
    queryFn: ({ signal }) => fetchActivities(transport, query as Parameters<typeof fetchActivities>[1], signal),
    enabled,
  })
}

export function useSalesTasksQuery(query: Record<string, unknown>, enabled = true) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: salesQueryKeys.tasks(query),
    queryFn: ({ signal }) => fetchSalesTasks(transport, query as Parameters<typeof fetchSalesTasks>[1], signal),
    enabled,
  })
}

export function useTodayQuery() {
  const { transport } = useAuth()
  return useQuery({ queryKey: salesQueryKeys.today(), queryFn: ({ signal }) => fetchToday(transport, signal) })
}

export function useDraftsQuery(query: Record<string, unknown>) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: salesQueryKeys.drafts(query),
    queryFn: ({ signal }) => fetchDrafts(transport, query as Parameters<typeof fetchDrafts>[1], signal),
  })
}

export function useDraftVersionsQuery(draftId: string | null) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: salesQueryKeys.draftVersions(draftId ?? 'none'),
    queryFn: ({ signal }) => fetchDraftVersions(transport, draftId as string, signal),
    enabled: draftId !== null,
  })
}

export function useFunnelReportQuery(query: Record<string, unknown>) {
  const { transport } = useAuth()
  return useQuery({
    queryKey: salesQueryKeys.funnel(query),
    queryFn: ({ signal }) => fetchFunnelReport(transport, query as Parameters<typeof fetchFunnelReport>[1], signal),
  })
}

export function useBusinessUsersQuery() {
  const { transport } = useAuth()
  return useQuery({ queryKey: salesQueryKeys.users(), queryFn: ({ signal }) => fetchBusinessUsers(transport, signal) })
}

export function useAgentOpsQuery() {
  const { transport } = useAuth()
  return useQuery({ queryKey: salesQueryKeys.agentOps(), queryFn: ({ signal }) => fetchAgentOps(transport, signal) })
}

export function useCreateCompanyMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: (input: Parameters<typeof createCompany>[1]) => createCompany(transport, input),
    onSuccess: invalidate,
  })
}

export function useUpdateCompanyMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateCompany>[2] }) =>
      updateCompany(transport, id, input),
    onSuccess: invalidate,
  })
}

export function useCompanyDncMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({ id, input, lift }: { id: string; input: { reason: string; scope: 'all' | 'commercial' }; lift?: boolean }) =>
      lift ? liftCompanyDnc(transport, id, input.reason) : setCompanyDnc(transport, id, input),
    onSuccess: invalidate,
  })
}

export function useContactDncMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({ id, input, lift }: { id: string; input: { reason: string; scope: 'all' | 'commercial' }; lift?: boolean }) =>
      lift ? liftContactDnc(transport, id, input.reason) : setContactDnc(transport, id, input),
    onSuccess: invalidate,
  })
}

export function useCreateContactMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: (input: Parameters<typeof createContact>[1]) => createContact(transport, input),
    onSuccess: invalidate,
  })
}

export function useCreateActivityMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: (input: Parameters<typeof createActivity>[1]) => createActivity(transport, input),
    onSuccess: invalidate,
  })
}

export function useMarkActivityProcessedMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: (id: string) => markActivityProcessed(transport, id),
    onSuccess: invalidate,
  })
}

export function useCreateSalesTaskMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: (input: Parameters<typeof createSalesTask>[1]) => createSalesTask(transport, input),
    onSuccess: invalidate,
  })
}

export function useUpdateSalesTaskMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateSalesTask>[2] }) =>
      updateSalesTask(transport, id, input),
    onSuccess: invalidate,
  })
}

export function useCreateDraftMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: (input: Parameters<typeof createDraft>[1]) => createDraft(transport, input),
    onSuccess: invalidate,
  })
}

export function useUpdateDraftMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateDraft>[2] }) =>
      updateDraft(transport, id, input),
    onSuccess: invalidate,
  })
}

export function useDraftActionMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: 'review' | 'approve' | 'send' | 'cancel'; body?: Record<string, unknown> }) =>
      draftAction(transport, id, action, body),
    onSuccess: invalidate,
  })
}

export function useSaveDealContactRoleMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({ dealId, input }: { dealId: string; input: Parameters<typeof saveDealContactRole>[2] }) =>
      saveDealContactRole(transport, dealId, input),
    onSuccess: invalidate,
  })
}

export function useDeleteDealContactRoleMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({ dealId, roleId }: { dealId: string; roleId: string }) =>
      deleteDealContactRole(transport, dealId, roleId),
    onSuccess: invalidate,
  })
}

export function useSaveDealClaimMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({ dealId, input }: { dealId: string; input: Parameters<typeof saveDealClaim>[2] }) =>
      saveDealClaim(transport, dealId, input),
    onSuccess: invalidate,
  })
}

export function useImportPreviewMutation() {
  const { transport } = useAuth()
  return useMutation({ mutationFn: (payload: unknown) => importPreview(transport, payload) })
}

export function useImportApplyMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: (input: Parameters<typeof importApply>[1]) => importApply(transport, input),
    onSuccess: invalidate,
  })
}

export function useSetSubscriptionMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({ dealId, input }: { dealId: string; input: Parameters<typeof setSubscription>[2] }) =>
      setSubscription(transport, dealId, input),
    onSuccess: invalidate,
  })
}

export function useConfirmReceiptMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({ paymentId, input }: { paymentId: string; input: Parameters<typeof confirmReceipt>[2] }) =>
      confirmReceipt(transport, paymentId, input),
    onSuccess: invalidate,
  })
}

export function useUpsertPilotMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({ dealId, input }: { dealId: string; input: Record<string, unknown> }) =>
      upsertPilotApi(transport, dealId, input),
    onSuccess: invalidate,
  })
}

export function usePilotActionMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({
      dealId,
      action,
      body,
    }: {
      dealId: string
      action: 'activate' | 'decision'
      body: Record<string, unknown>
    }) => pilotActionApi(transport, dealId, action, body),
    onSuccess: invalidate,
  })
}

export function useAddPilotCriterionMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({ dealId, input }: { dealId: string; input: { statement: string; method?: string | null } }) =>
      addPilotCriterionApi(transport, dealId, input),
    onSuccess: invalidate,
  })
}

export function useAddPilotMilestoneMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({
      dealId,
      input,
    }: {
      dealId: string
      input: { side: 'client' | 'ordix'; commitment: string; dueOn?: string | null }
    }) => addPilotMilestoneApi(transport, dealId, input),
    onSuccess: invalidate,
  })
}

export function useUpsertLaunchMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({ dealId, input }: { dealId: string; input: Record<string, unknown> }) =>
      upsertLaunchApi(transport, dealId, input),
    onSuccess: invalidate,
  })
}

export function useCreateExtensionDealMutation() {
  const { transport } = useAuth()
  const invalidate = useInvalidateSales()
  return useMutation({
    mutationFn: ({
      dealId,
      input,
    }: {
      dealId: string
      input: { title: string; monthlyAmount: number; oneTimeAmount: number; basis: string }
    }) => createExtensionDealApi(transport, dealId, input),
    onSuccess: invalidate,
  })
}
