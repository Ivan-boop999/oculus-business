import { BusinessFailure } from '../domain/errors'

/// Возможности агентской учётной записи (User.agentPermissions). Пустой список = только
/// базовый агентский доступ (чтение + исследование/черновики/задачи/предложения).
/// Любое исключение — явное ограниченное полномочие, проверяемое сервером (FIX-01-AC03).
export const AGENT_CAPABILITIES = [
  'finance.confirm',
  'won.confirm',
  'deal.delete',
  'subscription.manage',
  'pricing.change',
  'claim.confirm',
  'draft.approve',
  'pilot.decide',
  'case.allow',
] as const

export type AgentCapability = (typeof AGENT_CAPABILITIES)[number]

export type PrincipalLike = {
  userId: string
  role: 'user' | 'admin' | 'agent'
  agentPermissions: string[] | null
}

/// Действия, доступные только роли admin (не выдаются агенту через agentPermissions).
export const ADMIN_ONLY_ACTIONS = [
  'users.role.change',
  'users.agentPermissions.change',
] as const

export function permissionsOf(principal: PrincipalLike): string[] {
  if (principal.role !== 'agent') return []
  return Array.isArray(principal.agentPermissions) ? principal.agentPermissions : []
}

/// Серверная проверка права для агентской записи. Люди (user/admin) проходят всегда;
/// отдельные действия могут дополнительно требовать роль admin (adminOnly).
export function ensureCapability(
  principal: PrincipalLike,
  capability: AgentCapability,
  options: { adminOnly?: boolean } = {},
): void {
  if (principal.role === 'admin') return
  if (principal.role === 'user') {
    if (options.adminOnly === true) {
      throw new BusinessFailure('forbidden', 'Действие доступно только администратору')
    }
    return
  }
  if (options.adminOnly === true) {
    throw new BusinessFailure('forbidden', 'Действие доступно только администратору')
  }
  if (!permissionsOf(principal).includes(capability)) {
    throw new BusinessFailure(
      'forbidden',
      `Агентский доступ не включает право «${capability}» — операция отклонена. Запросите полномочие у администратора.`,
    )
  }
}

/// Таблица изменяющих маршрутов CRM/финансов: единственный источник правды для сервера
/// и документации (FIX-01-AC01). legacy: true — маршруты первого поколения.
export const ROUTE_POLICY: ReadonlyArray<{
  method: string
  path: string
  area: string
  /// Право агента; null — действие недоступно агенту ни с какими правами;
  /// 'human' — только человек (роль user/admin); 'admin' — только admin; 'any' — любой аутентифицированный.
  agentAccess: AgentCapability | 'human' | 'admin' | 'any'
  legacy?: boolean
}> = [
  // CRM: сделки и стадии
  { method: 'POST', path: '/api/crm/deals', area: 'crm.deals', agentAccess: 'any' },
  { method: 'PATCH', path: '/api/crm/deals/{id}', area: 'crm.deals', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/deals/{id}/move', area: 'crm.deals', agentAccess: 'any' },
  { method: 'DELETE', path: '/api/crm/deals/{id}', area: 'crm.deals', agentAccess: 'deal.delete' },
  { method: 'POST', path: '/api/crm/stages', area: 'crm.stages', agentAccess: 'human' },
  { method: 'PATCH', path: '/api/crm/stages/{id}', area: 'crm.stages', agentAccess: 'human' },
  { method: 'DELETE', path: '/api/crm/stages/{id}', area: 'crm.stages', agentAccess: 'human' },
  // CRM: компании/контакты/запреты
  { method: 'POST', path: '/api/crm/companies', area: 'crm.companies', agentAccess: 'any' },
  { method: 'PATCH', path: '/api/crm/companies/{id}', area: 'crm.companies', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/companies/{id}/dnc', area: 'crm.dnc', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/companies/{id}/dnc/lift', area: 'crm.dnc', agentAccess: 'human' },
  { method: 'POST', path: '/api/crm/contacts', area: 'crm.contacts', agentAccess: 'any' },
  { method: 'PATCH', path: '/api/crm/contacts/{id}', area: 'crm.contacts', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/contacts/{id}/dnc', area: 'crm.dnc', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/contacts/{id}/dnc/lift', area: 'crm.dnc', agentAccess: 'human' },
  { method: 'POST', path: '/api/crm/contacts/{id}/channels', area: 'crm.contacts', agentAccess: 'any' },
  { method: 'PATCH', path: '/api/crm/channels/{id}', area: 'crm.contacts', agentAccess: 'any' },
  // CRM: утверждения и факты
  { method: 'PUT', path: '/api/crm/deals/{id}/claims', area: 'crm.claims', agentAccess: 'claim.confirm' },
  { method: 'PUT', path: '/api/crm/deals/{id}/contact-roles', area: 'crm.roles', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/companies/{id}/facts', area: 'crm.facts', agentAccess: 'any' },
  // CRM: активности/задачи/черновики
  { method: 'POST', path: '/api/crm/activities', area: 'crm.activities', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/activities/{id}/processed', area: 'crm.activities', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/tasks', area: 'crm.tasks', agentAccess: 'any' },
  { method: 'PATCH', path: '/api/crm/tasks/{id}', area: 'crm.tasks', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/drafts', area: 'crm.drafts', agentAccess: 'any' },
  { method: 'PATCH', path: '/api/crm/drafts/{id}', area: 'crm.drafts', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/drafts/{id}/review', area: 'crm.drafts', agentAccess: 'draft.approve' },
  { method: 'POST', path: '/api/crm/drafts/{id}/approve', area: 'crm.drafts', agentAccess: 'draft.approve' },
  { method: 'POST', path: '/api/crm/drafts/{id}/send', area: 'crm.drafts', agentAccess: 'draft.approve' },
  { method: 'POST', path: '/api/crm/drafts/{id}/delivered', area: 'crm.drafts', agentAccess: 'draft.approve' },
  { method: 'POST', path: '/api/crm/drafts/{id}/cancel', area: 'crm.drafts', agentAccess: 'any' },
  // CRM: пилот/запуск/партнёры/импорт
  { method: 'PUT', path: '/api/crm/deals/{id}/pilot', area: 'crm.pilot', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/deals/{id}/pilot/activate', area: 'crm.pilot', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/deals/{id}/pilot/decision', area: 'crm.pilot', agentAccess: 'pilot.decide' },
  { method: 'POST', path: '/api/crm/deals/{id}/pilot/criteria', area: 'crm.pilot', agentAccess: 'any' },
  { method: 'PATCH', path: '/api/crm/pilot-criteria/{id}', area: 'crm.pilot', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/pilot-criteria/{id}/agree', area: 'crm.pilot', agentAccess: 'claim.confirm' },
  { method: 'POST', path: '/api/crm/deals/{id}/pilot/milestones', area: 'crm.pilot', agentAccess: 'any' },
  { method: 'PATCH', path: '/api/crm/pilot-milestones/{id}', area: 'crm.pilot', agentAccess: 'any' },
  { method: 'PUT', path: '/api/crm/deals/{id}/launch', area: 'crm.launch', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/deals/{id}/extension', area: 'crm.launch', agentAccess: 'any' },
  { method: 'PUT', path: '/api/crm/deals/{id}/partner', area: 'crm.partner', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/import/preview', area: 'crm.import', agentAccess: 'any' },
  { method: 'POST', path: '/api/crm/import/apply', area: 'crm.import', agentAccess: 'any' },
  // Финансы
  { method: 'POST', path: '/api/finance/txns', area: 'finance.txns', agentAccess: 'finance.confirm', legacy: true },
  { method: 'PATCH', path: '/api/finance/txns/{id}', area: 'finance.txns', agentAccess: 'finance.confirm', legacy: true },
  { method: 'DELETE', path: '/api/finance/txns/{id}', area: 'finance.txns', agentAccess: 'finance.confirm', legacy: true },
  { method: 'POST', path: '/api/finance/recurring', area: 'finance.recurring', agentAccess: 'finance.confirm', legacy: true },
  { method: 'PATCH', path: '/api/finance/recurring/{id}', area: 'finance.recurring', agentAccess: 'finance.confirm', legacy: true },
  { method: 'DELETE', path: '/api/finance/recurring/{id}', area: 'finance.recurring', agentAccess: 'finance.confirm', legacy: true },
  { method: 'PUT', path: '/api/finance/settings', area: 'finance.settings', agentAccess: 'finance.confirm', legacy: true },
  { method: 'POST', path: '/api/finance/expected', area: 'finance.expected', agentAccess: 'finance.confirm', legacy: true },
  { method: 'PATCH', path: '/api/finance/expected/{id}', area: 'finance.expected', agentAccess: 'finance.confirm', legacy: true },
  { method: 'DELETE', path: '/api/finance/expected/{id}', area: 'finance.expected', agentAccess: 'finance.confirm', legacy: true },
  { method: 'POST', path: '/api/finance/expected/{id}/received', area: 'finance.expected', agentAccess: 'finance.confirm', legacy: true },
  { method: 'POST', path: '/api/finance/expected/{id}/receipts', area: 'finance.expected', agentAccess: 'finance.confirm' },
  { method: 'POST', path: '/api/finance/expected/{id}/receipts/{txnId}/reverse', area: 'finance.expected', agentAccess: 'finance.confirm' },
  { method: 'POST', path: '/api/finance/deals/{id}/subscription', area: 'finance.subscription', agentAccess: 'subscription.manage' },
]