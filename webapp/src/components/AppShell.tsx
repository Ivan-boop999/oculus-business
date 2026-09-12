import {
  BarChartIcon,
  Calendar01Icon,
  DashboardSquare01Icon,
  HandshakeIcon,
  Settings01Icon,
  Task01Icon,
  UserGroupIcon,
  UserIcon,
  Wallet01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, useLocation } from '@tanstack/react-router'
import type { UserDto } from '@oculus-business/contracts'
import type { PropsWithChildren } from 'react'

import { BrandMark } from '@/components/BrandMark'

/// Адаптивная оболочка приложения в фирменном стиле OCULUS:
/// тёмный «командный центр», индиго-акцент со свечением, aurora-подсветка фона.
/// Телефон (<lg): липкий заголовок + нижняя навигация. ПК (lg+): боковое меню.
type NavItem = {
  icon: typeof DashboardSquare01Icon
  label: string
  to: string
  exact?: boolean
}

const MAIN_NAV: ReadonlyArray<NavItem> = [
  { label: 'Обзор', to: '/app', icon: DashboardSquare01Icon, exact: true },
  { label: 'Сделки', to: '/app/crm', icon: HandshakeIcon },
  { label: 'Финансы', to: '/app/finance', icon: Wallet01Icon, exact: true },
  { label: 'Задачи', to: '/app/tasks', icon: Task01Icon },
]

const FINANCE_SUBNAV: ReadonlyArray<NavItem> = [
  { label: 'Операции', to: '/app/finance', icon: Wallet01Icon, exact: true },
  { label: 'Регулярные платежи', to: '/app/finance/recurring', icon: Calendar01Icon },
  { label: 'Прогноз и runway', to: '/app/finance/forecast', icon: BarChartIcon },
]

export function AppShell({
  children,
  onLogout,
  user,
}: PropsWithChildren<{
  onLogout: () => Promise<void>
  user: UserDto
}>) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to)

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
          {MAIN_NAV.map((item) => (
            <SidebarLink active={isActive(item)} item={item} key={item.to} />
          ))}

          <p className="mt-5 px-3 pb-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/70 uppercase">
            Финансы
          </p>
          {FINANCE_SUBNAV.map((item) => (
            <SidebarLink active={isActive(item)} item={item} key={item.to} nested />
          ))}
        </nav>

        <div className="grid gap-1 border-t border-sidebar-border p-3">
          <SidebarLink
            active={pathname.startsWith('/app/profile')}
            item={{ label: 'Профиль', to: '/app/profile', icon: UserIcon }}
          />
          <SidebarLink
            active={pathname.startsWith('/app/settings')}
            item={{ label: 'Настройки', to: '/app/settings', icon: Settings01Icon }}
          />
          {user.role === 'admin' && (
            <SidebarLink
              active={false}
              item={{ label: 'Пользователи', to: '/admin/users', icon: UserGroupIcon }}
            />
          )}
          <button
            className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-white"
            onClick={() => void onLogout()}
          >
            <span className="grid size-4 place-items-center text-xs">⏻</span>
            Выйти
          </button>
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

      {/* ------------------------------------------------ Контент */}
      <main className="px-4 pt-4 pb-24 lg:pl-[17.5rem] lg:pr-8 lg:pt-6 lg:pb-10">
        <div className="mx-auto w-full max-w-3xl lg:max-w-6xl">{children}</div>
      </main>

      {/* ------------------------------------------------ Телефон: нижняя навигация */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/6 bg-background/85 backdrop-blur-xl lg:hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-16 h-16 bg-gradient-to-t from-background to-transparent"
        />
        <div className="mx-auto grid w-full max-w-3xl grid-cols-4">
          {MAIN_NAV.map((item) => {
            const active = isActive(item)
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

function SidebarLink({
  active,
  item,
  nested = false,
}: {
  active: boolean
  item: NavItem
  nested?: boolean
}) {
  return (
    <Link
      className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150 ${
        active
          ? 'bg-[rgba(99,102,241,0.13)] font-medium text-[#A5B4FC] shadow-[inset_0_0_0_1px_rgba(99,102,241,0.25)]'
          : 'text-muted-foreground hover:bg-white/5 hover:text-white'
      } ${nested ? 'pl-6.5 text-[13px]' : ''}`}
      to={item.to}
    >
      {active && (
        <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#818CF8] shadow-[0_0_10px_rgba(129,140,248,0.9)]" />
      )}
      <HugeiconsIcon
        className={active ? 'size-4 shrink-0 drop-shadow-[0_0_6px_rgba(99,102,241,0.6)]' : 'size-4 shrink-0'}
        icon={item.icon}
        strokeWidth={1.9}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

function initials(user: UserDto): string {
  const source = user.displayName?.trim() || user.email
  return source.slice(0, 1).toUpperCase()
}
