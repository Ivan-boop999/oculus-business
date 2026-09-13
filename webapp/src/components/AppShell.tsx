import { useEffect, useState } from 'react'

const SEEN_ROUTES_KEY = 'ob_seen_routes'
const NEW_BADGE_ROUTES = new Set([
  '/app/finance/recurring',
  '/app/finance/forecast',
  '/app/companies',
])

function readSeenRoutes(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_ROUTES_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}
import {
  ArrowRight01Icon,
  BarChartIcon,
  Calendar01Icon,
  Contact01Icon,
  DashboardSquare01Icon,
  HandshakeIcon,
  Settings01Icon,
  Task01Icon,
  UserGroupIcon,
  UserIcon,
  Wallet01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import type { UserDto } from '@oculus-business/contracts'
import type { PropsWithChildren } from 'react'

import { BrandMark } from '@/components/BrandMark'
import { GlobalSearch } from '@/components/GlobalSearch'
import { NotificationsBell } from '@/components/NotificationsBell'

/// Адаптивная оболочка приложения в фирменном стиле OCULUS.
/// ПК (lg+): боковое меню с раскрывающимися группами (клик по «Финансам»
/// открывает подвкладки, повторный — сворачивает; активный маршрут разворачивает
/// свою группу сам). Телефон: заголовок + нижняя навигация.
type NavIcon = typeof DashboardSquare01Icon

type NavLeaf = {
  adminOnly?: boolean
  icon: NavIcon
  isNew?: boolean
  label: string
  to: string
  exact?: boolean
}

type NavNode = NavLeaf & {
  children?: ReadonlyArray<NavLeaf>
}

const NAV: ReadonlyArray<NavNode> = [
  { label: 'Обзор', to: '/app', icon: DashboardSquare01Icon, exact: true },
  { label: 'Сделки', to: '/app/crm', icon: HandshakeIcon },
  { label: 'Контрагенты', to: '/app/companies', icon: Contact01Icon, isNew: true },
  {
    label: 'Финансы',
    to: '/app/finance',
    icon: Wallet01Icon,
    exact: true,
    children: [
      { label: 'Операции', to: '/app/finance', icon: Wallet01Icon, exact: true },
      { label: 'Регулярные платежи', to: '/app/finance/recurring', icon: Calendar01Icon },
      { label: 'Прогноз и runway', to: '/app/finance/forecast', icon: BarChartIcon },
    ],
  },
  { label: 'Задачи', to: '/app/tasks', icon: Task01Icon },
]

const FOOTER_NAV: ReadonlyArray<NavLeaf> = [
  { label: 'Профиль', to: '/app/profile', icon: UserIcon },
  { label: 'Настройки', to: '/app/settings', icon: Settings01Icon },
  { label: 'Пользователи', to: '/admin/users', icon: UserGroupIcon, adminOnly: true },
]

const MOBILE_TABS: ReadonlyArray<NavLeaf> = [
  { label: 'Обзор', to: '/app', icon: DashboardSquare01Icon, exact: true },
  { label: 'Сделки', to: '/app/crm', icon: HandshakeIcon },
  { label: 'Финансы', to: '/app/finance', icon: Wallet01Icon },
  { label: 'Задачи', to: '/app/tasks', icon: Task01Icon },
]

function matches(item: { exact?: boolean; to: string }, pathname: string) {
  return item.exact ? pathname === item.to : pathname.startsWith(item.to)
}

export function AppShell({
  children,
  onLogout,
  user,
}: PropsWithChildren<{
  onLogout: () => Promise<void>
  user: UserDto
}>) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const navigate = useNavigate()
  const [seenRoutes, setSeenRoutes] = useState<Set<string>>(() => readSeenRoutes())

  // Посещение маршрута снимает бейдж «новое» (для пунктов с NEW_BADGE_ROUTES).
  useEffect(() => {
    if (NEW_BADGE_ROUTES.has(pathname) && !seenRoutes.has(pathname)) {
      const next = new Set(seenRoutes)
      next.add(pathname)
      setSeenRoutes(next)
      window.localStorage.setItem(SEEN_ROUTES_KEY, JSON.stringify([...next]))
    }
  }, [pathname, seenRoutes])
  const financeActive = pathname.startsWith('/app/finance')

  // Какие группы раскрыты. Группа своей активной вкладки разворачивается автоматически.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    (financeActive ? { Финансы: true } : {}) as Record<string, boolean>,
  )

  useEffect(() => {
    if (financeActive) {
      setOpenGroups((prev) => ({ ...prev, Финансы: true }))
    }
  }, [financeActive])

  const toggleGroup = (node: NavNode) => {
    const willOpen = !(openGroups[node.label] ?? false)
    setOpenGroups((prev) => ({ ...prev, [node.label]: willOpen }))
    // Раскрытие группы заодно ведёт на её основную страницу.
    if (willOpen) void navigate({ to: node.to })
  }

  return (
    <div className="relative min-h-svh bg-background">
      {/* Aurora-подсветка фона — фирменное индиго-свечение OCULUS */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(900px 480px at 12% -8%, rgba(99,102,241,0.14), transparent 60%),' +
            'radial-gradient(700px 420px at 96% 104%, rgba(34,211,238,0.07), transparent 60%)',
        }}
      />

      {/* ------------------------------------------------ ПК: боковое меню */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="border-b border-sidebar-border px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <BrandMark className="h-9 w-13 drop-shadow-[0_0_18px_rgba(99,102,241,0.5)]" />
            <div className="min-w-0">
              <p className="truncate text-[15px] leading-tight font-semibold tracking-tight text-white">
                Окулус Бизнес
              </p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground">
                командный центр ОРДИКС
              </p>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {NAV.map((node) =>
            node.children ? (
              <NavGroup
                key={node.label}
                onToggle={() => toggleGroup(node)}
                open={openGroups[node.label] ?? false}
                node={node}
                pathname={pathname}
                seenRoutes={seenRoutes}
              />
            ) : (
              <SidebarLink
                active={matches(node, pathname)}
                isNew={node.isNew && !seenRoutes.has(node.to)}
                item={node}
                key={node.label}
              />
            ),
          )}
        </nav>

        <div className="grid gap-1 border-t border-sidebar-border p-3">
          {FOOTER_NAV.map((item) =>
            item.adminOnly && user.role !== 'admin' ? null : (
              <SidebarLink active={matches(item, pathname)} item={item} key={item.label} />
            ),
          )}
          <button
            className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-white"
            onClick={() => void onLogout()}
          >
            <span className="grid size-4 place-items-center text-xs">⏻</span>
            Выйти
          </button>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Уведомления</span>
            <NotificationsBell />
          </div>
          <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-white/6 bg-white/[0.03] px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#7B5CFA] to-[#4338CA] text-xs font-bold text-white shadow-[0_0_16px_rgba(99,102,241,0.35)]">
              {initials(user)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] leading-tight font-medium text-white">
                {user.displayName ?? 'Профиль'}
              </span>
              <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                {user.email}
              </span>
            </span>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------ Телефон: заголовок */}
      <header className="sticky top-0 z-30 border-b border-white/6 bg-background/80 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex h-13 w-full max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-6.5 w-9.5" />
            <span className="text-base font-semibold tracking-tight text-white">
              Окулус Бизнес
            </span>
          </div>
          <NotificationsBell />
          <Link
            className="flex items-center gap-2 rounded-full border border-white/6 bg-white/[0.04] py-1 pl-1 pr-3 text-sm text-muted-foreground transition-colors hover:text-white"
            to="/app/profile"
          >
            <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-[#7B5CFA] to-[#4338CA] text-xs font-bold text-white">
              {initials(user)}
            </span>
            <span className="max-w-28 truncate">{user.displayName ?? user.email}</span>
          </Link>
        </div>
      </header>

      <GlobalSearch />

      {/* ------------------------------------------------ Контент */}
      <main className="px-4 pt-4 pb-24 lg:pl-[17.5rem] lg:pr-8 lg:pt-6 lg:pb-10">
        <div className="ob-fade-up mx-auto w-full max-w-3xl lg:max-w-6xl" key={pathname}>
          {children}
        </div>
      </main>

      {/* ------------------------------------------------ Телефон: нижняя навигация */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/6 bg-background/85 backdrop-blur-xl lg:hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-16 h-16 bg-gradient-to-t from-background to-transparent"
        />
        <div className="mx-auto grid w-full max-w-3xl grid-cols-4">
          {MOBILE_TABS.map((item) => {
            const active = matches(item, pathname)
            return (
              <Link
                className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? 'text-[#A5B4FC]' : 'text-muted-foreground hover:text-white'
                }`}
                key={item.to}
                to={item.to}
              >
                {active && (
                  <span className="absolute -top-px h-0.5 w-10 rounded-full bg-gradient-to-r from-transparent via-[#818CF8] to-transparent shadow-[0_0_12px_rgba(129,140,248,0.8)]" />
                )}
                <HugeiconsIcon
                  className={active ? 'size-5 drop-shadow-[0_0_8px_rgba(99,102,241,0.7)]' : 'size-5'}
                  icon={item.icon}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

/// Пункт с подвкладками: строка-переключатель + раскрывающийся список.
function NavGroup({
  node,
  open,
  onToggle,
  pathname,
  seenRoutes,
}: {
  node: NavNode
  open: boolean
  onToggle: () => void
  pathname: string
  seenRoutes: Set<string>
}) {
  const childActive = node.children?.some((child) => matches(child, pathname)) ?? false
  const active = matches(node, pathname) || childActive

  return (
    <div>
      <button
        aria-expanded={open}
        className={`group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-all duration-150 ${
          active
            ? 'bg-[rgba(99,102,241,0.13)] font-medium text-[#A5B4FC] shadow-[inset_0_0_0_1px_rgba(99,102,241,0.25)]'
            : 'text-muted-foreground hover:bg-white/5 hover:text-white'
        }`}
        onClick={onToggle}
      >
        {active && (
          <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#818CF8] shadow-[0_0_10px_rgba(129,140,248,0.9)]" />
        )}
        <HugeiconsIcon
          className={active ? 'size-4 shrink-0 drop-shadow-[0_0_6px_rgba(99,102,241,0.6)]' : 'size-4 shrink-0'}
          icon={node.icon}
          strokeWidth={1.9}
        />
        <span className="flex-1 truncate">{node.label}</span>
        <HugeiconsIcon
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? 'rotate-90' : ''
          }`}
          icon={ArrowRight01Icon}
          strokeWidth={2}
        />
      </button>

      <div
        className={`grid transition-all duration-200 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="relative ml-[1.4rem] grid gap-0.5 border-l border-white/8 py-1 pl-2">
            {node.children?.map((child) => (
              <SidebarLink
                active={matches(child, pathname)}
                compact
                isNew={!seenRoutes.has(child.to)}
                item={child}
                key={child.to}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SidebarLink({
  active,
  compact = false,
  isNew = false,
  item,
}: {
  active: boolean
  compact?: boolean
  isNew?: boolean
  item: NavLeaf
}) {
  return (
    <Link
      className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150 ${
        active
          ? 'bg-[rgba(99,102,241,0.13)] font-medium text-[#A5B4FC] shadow-[inset_0_0_0_1px_rgba(99,102,241,0.25)]'
          : 'text-muted-foreground hover:bg-white/5 hover:text-white'
      } ${compact ? 'py-1.5 text-[13px]' : ''}`}
      to={item.to}
    >
      {active && !compact && (
        <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#818CF8] shadow-[0_0_10px_rgba(129,140,248,0.9)]" />
      )}
      {active && compact && (
        <span className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[#818CF8] shadow-[0_0_10px_rgba(129,140,248,0.9)]" />
      )}
      <HugeiconsIcon
        className={active ? 'size-4 shrink-0 drop-shadow-[0_0_6px_rgba(99,102,241,0.6)]' : 'size-4 shrink-0'}
        icon={item.icon}
        strokeWidth={1.9}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {isNew && !active && (
        <span className="size-1.5 shrink-0 rounded-full bg-[#818CF8] shadow-[0_0_8px_rgba(129,140,248,0.9)]" title="Новый раздел" />
      )}
    </Link>
  )
}

function initials(user: UserDto): string {
  const source = user.displayName?.trim() || user.email
  return source.slice(0, 1).toUpperCase()
}
