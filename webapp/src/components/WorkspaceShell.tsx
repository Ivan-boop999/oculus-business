import {
  ArrowLeft01Icon,
  Settings01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { useLocation } from '@tanstack/react-router'
import type { UserDto } from '@oculus-business/contracts'
import type { PropsWithChildren } from 'react'

import {
  AppSidebar,
  type DashboardNavigationItem,
  SiteHeader,
} from '@/components/dashboard'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

/// Оболочка вторичной админ-зоны (управление пользователями). Основное приложение
/// живёт в /app под мобильным MobileShell — сюда администратор заходит по ссылке
/// из профиля, когда нужно менять роли и смотреть дашборд пользователей.
function getSidebarDefaultOpen() {
  const persistedState = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('sidebar_state='))
    ?.slice('sidebar_state='.length)

  return persistedState !== 'false'
}

const adminItems: ReadonlyArray<DashboardNavigationItem> = [
  { label: 'Пользователи', to: '/admin/users', icon: UserGroupIcon, isActive: false },
  { label: 'Настройки', to: '/admin/settings', icon: Settings01Icon, isActive: false },
  { label: 'К приложению', to: '/app', icon: ArrowLeft01Icon, isActive: false },
]

export function WorkspaceShell({
  children,
  onLogout,
  user,
}: PropsWithChildren<{
  onLogout: () => Promise<void>
  user: UserDto
}>) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const items = adminItems.map((item) => ({
    ...item,
    isActive: item.to === pathname,
  }))
  const activeItem = items.find((item) => item.isActive)

  return (
    <SidebarProvider defaultOpen={getSidebarDefaultOpen()}>
      <AppSidebar
        accountPath="/admin/settings"
        homePath="/admin/users"
        items={items}
        onLogout={onLogout}
        settingsPath="/admin/settings"
        user={user}
        workspaceLabel="Администрирование"
      />
      <SidebarInset>
        <SiteHeader title={activeItem?.label ?? 'Администрирование'} />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
