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

/// Адаптивная оболочка приложения.
/// Телефон (<lg): липкий заголовок + нижняя навигация из четырёх разделов.
/// ПК (lg+): фиксированное боковое меню с подразделами финансов и профилем.
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
    <div className="min-h-svh bg-background">
      {/* ------------------------------------------------ ПК: боковое меню */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            О
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Окулус Бизнес</p>
            <p className="truncate text-[11px] text-muted-foreground">ОРДИКС · управление</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {MAIN_NAV.map((item) => (
            <SidebarLink active={isActive(item)} item={item} key={item.to} />
          ))}

          <p className="mt-3 px-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Финансы
          </p>
          {FINANCE_SUBNAV.map((item) => (
            <SidebarLink active={isActive(item)} item={item} key={item.to} nested />
          ))}
        </nav>

        <div className="grid gap-1 border-t p-3">
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
            className="mt-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => void onLogout()}
          >
            <span className="grid size-4 place-items-center text-xs">⏻</span>
            Выйти
          </button>
        </div>
      </aside>

      {/* ------------------------------------------------ Телефон: заголовок */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
        <div className="mx-auto flex h-12 w-full max-w-3xl items-center justify-between px-4">
          <span className="text-base font-semibold tracking-tight">Окулус Бизнес</span>
          <Link
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
            to="/app/profile"
          >
            <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials(user)}
            </span>
            <span className="max-w-32 truncate">{user.displayName ?? user.email}</span>
          </Link>
        </div>
      </header>

      {/* ------------------------------------------------ Контент */}
      <main className="px-4 pt-4 pb-24 lg:pl-[16.5rem] lg:pr-8 lg:pb-10">
        <div className="mx-auto w-full max-w-3xl lg:max-w-6xl">{children}</div>
      </main>

      {/* ------------------------------------------------ Телефон: нижняя навигация */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-4">
          {MAIN_NAV.map((item) => {
            const active = isActive(item)
            return (
              <Link
                className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
                key={item.to}
                to={item.to}
              >
                <HugeiconsIcon icon={item.icon} strokeWidth={active ? 2.2 : 1.8} className="size-5" />
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
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      } ${nested ? 'pl-6 text-[13px]' : ''}`}
      to={item.to}
    >
      <HugeiconsIcon className="size-4 shrink-0" icon={item.icon} strokeWidth={1.9} />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

function initials(user: UserDto): string {
  const source = user.displayName?.trim() || user.email
  return source.slice(0, 1).toUpperCase()
}
