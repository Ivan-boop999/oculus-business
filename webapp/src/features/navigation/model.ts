import type { UserRole } from '@oculus-business/contracts'

// Every path pattern registered under the role's workspace layout in `src/routes.tsx`, in TanStack
// syntax (`$param` segments). This is the return-path allow-list: a protected route survives the
// login round-trip whether or not the navigation links to it. `tests/navigation.test.ts` fails when
// this table and the router drift apart.
export const workspaceRoutesByRole = {
  user: [
    '/app',
    '/app/crm',
    '/app/companies',
    '/app/crm/report',
    '/app/finance',
    '/app/finance/recurring',
    '/app/finance/forecast',
    '/app/tasks',
    '/app/profile',
    '/app/settings',
  ],
  admin: [
    '/admin',
    '/admin/users',
    '/admin/settings',
  ],
} as const satisfies Record<UserRole, ReadonlyArray<`/${string}`>>

type WorkspaceRouteTable = Record<UserRole, ReadonlyArray<string>>

// Concrete, parameter-free workspace paths: the only ones a link or a role home can target
// without params. A `$param` route belongs in the table above but never in these unions.
type StaticPath<T extends string> = T extends `${string}$${string}` ? never : T
export type UserRoutePath = StaticPath<(typeof workspaceRoutesByRole.user)[number]>
export type AdminRoutePath = StaticPath<(typeof workspaceRoutesByRole.admin)[number]>
export type WorkspaceRoutePath = UserRoutePath | AdminRoutePath

// The bottom navigation is the same for every role: the admin workspace is reachable
// from the profile screen, not from a separate tab.
type NavigationItem = { label: string; to: UserRoutePath }

const navigationItems: ReadonlyArray<NavigationItem> = [
  { label: 'Обзор', to: '/app' },
  { label: 'Сделки', to: '/app/crm' },
  { label: 'Финансы', to: '/app/finance' },
  { label: 'Задачи', to: '/app/tasks' },
]

export function navigationItemsForRole(role: UserRole) {
  void role
  return navigationItems
}

export function homePathForRole(role: UserRole): '/app' {
  void role
  // Все роли работают в общем приложении /app; /admin — вторичная зона управления пользователями.
  return '/app'
}

export function resolveRoleDestination(role: UserRole, pathname: string): string {
  return isWorkspacePath(role, pathname) ? pathname : homePathForRole(role)
}

export function safeReturnPath(
  role: UserRole,
  value: string | undefined,
  routes: WorkspaceRouteTable = workspaceRoutesByRole,
): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null

  let url: URL
  try {
    url = new URL(value, 'https://app.invalid')
  } catch {
    return null
  }
  if (url.origin !== 'https://app.invalid') return null
  return isWorkspacePath(role, url.pathname, routes) ? `${url.pathname}${url.search}` : null
}

function isWorkspacePath(
  role: UserRole,
  pathname: string,
  routes: WorkspaceRouteTable = workspaceRoutesByRole,
): boolean {
  return routes[role].some((pattern) => matchesRoutePattern(pattern, pathname))
}

// A literal segment must match exactly; a named `$param` segment matches one non-empty segment.
// Route shapes this does not understand (a bare `$` splat, optional or prefixed params) never
// match, so such a return path falls back to the role home, which is the safe direction; extend
// the matcher when such a route is registered.
function matchesRoutePattern(pattern: string, pathname: string): boolean {
  const patternSegments = pattern.split('/')
  const pathSegments = pathname.split('/')
  if (patternSegments.length !== pathSegments.length) return false
  return patternSegments.every((segment, index) => {
    const actual = pathSegments[index] ?? ''
    const isNamedParam = segment.length > 1 && segment.startsWith('$')
    return isNamedParam ? actual !== '' : segment === actual
  })
}
