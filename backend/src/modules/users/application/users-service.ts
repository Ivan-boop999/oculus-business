import { AppError } from '../../../http/errors'
import type {
  AdminUsersQuery,
  UpdateProfileRequest,
  UpdateUserRoleRequest,
  UserDto,
} from '@oculus-business/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import type {
  AdminDashboardReader,
  AdminUsersReader,
  Clock,
  ProfileWriter,
  UserRecord,
  UserRoleUpdater,
} from './ports'

type UsersServiceDependencies = {
  adminDashboardReader: AdminDashboardReader
  adminUsersReader: AdminUsersReader
  clock: Clock
  profileWriter: ProfileWriter
  userRoleUpdater: UserRoleUpdater
  /// AGENT-01: чтение/запись agentPermissions админ-операцией.
  agentPermissionsStore: {
    findUser(id: string): Promise<{ id: string; role: string } | null>
    setPermissions(id: string, permissions: string[]): Promise<{
      id: string
      email: string
      displayName: string | null
      role: 'user' | 'admin' | 'agent'
      agentPermissions: string[]
    }>
  }
}

export class UsersService {
  constructor(private readonly dependencies: UsersServiceDependencies) {}

  async updateProfile(principal: AuthenticatedPrincipal, input: UpdateProfileRequest) {
    const user = await this.dependencies.profileWriter.updateProfile(
      principal.id,
      input.displayName,
    )
    return {
      user: this.userDto(user),
    }
  }

  dashboard() {
    const createdAfter = new Date(this.dependencies.clock.now().getTime() - 7 * 24 * 60 * 60 * 1000)
    return this.dependencies.adminDashboardReader.dashboard(createdAfter)
  }

  /// AGENT-01-AC01: выдача/отзыв прав агентской записи администратором.
  /// Отзыв = пустой список; права читаются из БД на каждую операцию, поэтому
  /// после коммита новый запрет действует немедленно (AGENT-01-AC03).
  async updateAgentPermissions(
    principal: AuthenticatedPrincipal,
    targetUserId: string,
    permissions: string[],
  ) {
    if (principal.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Administrator access required')
    }
    const allowed = new Set([
      'finance.confirm', 'won.confirm', 'deal.delete', 'subscription.manage',
      'pricing.change', 'claim.confirm', 'draft.approve', 'pilot.decide', 'case.allow',
    ])
    for (const permission of permissions) {
      if (!allowed.has(permission)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Неизвестное право: ' + permission)
      }
    }
    const target = await this.dependencies.agentPermissionsStore.findUser(targetUserId)
    if (target === null) {
      throw new AppError(404, 'NOT_FOUND', 'User not found')
    }
    if (target.role !== 'agent') {
      throw new AppError(409, 'CONFLICT', 'Права назначаются только роли agent — сначала смените роль')
    }
    const updated = await this.dependencies.agentPermissionsStore.setPermissions(targetUserId, permissions)
    return {
      user: {
        id: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        role: updated.role as 'user' | 'admin' | 'agent',
        agentPermissions: (updated.agentPermissions as string[]) ?? [],
      },
    }
  }

  listUsers(query: AdminUsersQuery) {
    return this.dependencies.adminUsersReader.listUsers(query)
  }

  async updateRole(
    principal: AuthenticatedPrincipal,
    targetUserId: string,
    input: UpdateUserRoleRequest,
  ) {
    return {
      user: await this.dependencies.userRoleUpdater.updateRole({
        actorUserId: principal.id,
        targetUserId,
        role: input.role,
        now: this.dependencies.clock.now(),
      }),
    }
  }

  private userDto(user: UserRecord): UserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    }
  }
}
