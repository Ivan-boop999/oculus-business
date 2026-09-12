import {
  DashboardSquare01Icon,
  HandshakeIcon,
  Task01Icon,
  Wallet01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, useLocation } from '@tanstack/react-router'
import type { UserDto } from '@oculus-business/contracts'
import type { PropsWithChildren } from 'react'

/// Мобильная оболочка приложения: липкий заголовок с именем пользователя и
/// фиксированная нижняя навигация из четырёх разделов. На десктопе ограничиваем
/// ширину колонкой — интерфейс рассчитан на телефон владельца.
const TABS = [
  { label: 'Обзор', to: '/app', icon: DashboardSquare01Icon, exact: true },
  { label: 'Сделки', to: '/app/crm', icon: HandshakeIcon, exact: false },
  { label: 'Финансы', to: '/app/finance', icon: Wallet01Icon, exact: false },
  { label: 'Задачи', to: '/app/tasks', icon: Task01Icon, exact: false },
] as const

export function MobileShell({ children, user }: PropsWithChildren<{ user: UserDto }>) {
  const pathname = useLocation({ select: (location) => location.pathname })

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-24">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-4">
          {TABS.map((tab) => {
            const active = tab.exact ? pathname === tab.to : pathname.startsWith(tab.to)
            return (
              <Link
                key={tab.to}
                className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
                to={tab.to}
              >
                <HugeiconsIcon icon={tab.icon} strokeWidth={active ? 2.2 : 1.8} className="size-5" />
                {tab.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

function initials(user: UserDto): string {
  const source = user.displayName?.trim() || user.email
  return source.slice(0, 1).toUpperCase()
}
