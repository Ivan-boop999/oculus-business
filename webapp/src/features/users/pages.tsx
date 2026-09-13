import type { UserDto } from '@oculus-business/contracts'
import { Link } from '@tanstack/react-router'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { AvatarPanel } from '@/features/avatar'
import { AccountSummary } from './AccountSummary'
import { ProfilePanel } from './ProfilePanel'
import { SessionPanel } from './SessionPanel'

export function UserHome({ user }: { user: UserDto }) {
  return (
    <PageContainer>
      <PageHeader
        description="Review your account status and continue managing your workspace."
        title={`Welcome, ${user.displayName ?? user.email}`}
      />
      <AccountSummary user={user} />
    </PageContainer>
  )
}

export function UserProfile({ user }: { user: UserDto }) {
  return (
    <PageContainer>
      <div className="grid w-full max-w-2xl gap-6">
        <PageHeader
          description="Имя и аватар, которые видят коллеги."
          title="Профиль"
        />
        <AvatarPanel user={user} />
        <ProfilePanel user={user} />
      </div>
    </PageContainer>
  )
}

export function UserSettings({
  onLogout,
  user,
}: {
  onLogout: () => Promise<void>
  user: UserDto
}) {
  return (
    <PageContainer>
      <PageHeader
        description="Оформление, аккаунт и выход."
        title="Настройки"
      />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-4">
          <h2 className="text-sm font-semibold text-white">Тема оформления</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Тёмная — единственная, фирменная для OCULUS. Светлая не используется.
          </p>
        </div>
        <div className="grid gap-6">
          {user.role === 'admin' && (
            <Link className="rounded-xl border p-4 text-sm transition-colors hover:bg-muted/40" to="/admin/users">
              <span className="font-medium">Администрирование</span>
              <span className="block text-xs text-muted-foreground">
                Пользователи, роли, дашборд команды
              </span>
            </Link>
          )}
          <SessionPanel onLogout={onLogout} />
        </div>
      </div>
    </PageContainer>
  )
}
