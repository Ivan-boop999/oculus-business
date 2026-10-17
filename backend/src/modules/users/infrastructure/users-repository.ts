import type {
  AdminUserSummary,
  AdminUsersQuery,
  UserRole,
} from '@oculus-business/contracts'
import { ADMIN_USERS_MAX_PAGE } from '@oculus-business/contracts'

import {
  acquireUserAuthenticationAuthorityLock,
  acquireUserRoleMutationLock,
  type DbClient,
  userAuthorityTransitionTransactionOptions,
} from '../../../db'
import type {
  AdminDashboardReader,
  AdminUsersReader,
  ProfileWriter,
  UserRoleUpdater,
} from '../application/ports'
import { UsersFailure } from '../domain/errors'

const userSummarySelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  createdAt: true,
} as const

type UsersRepository =
  & ProfileWriter
  & AdminDashboardReader
  & AdminUsersReader
  & UserRoleUpdater

export function createPrismaUsersRepository(db: DbClient): UsersRepository {
  return {
    updateProfile(userId, displayName) {
      return db.user.update({
        where: { id: userId },
        data: { displayName },
        select: userSummarySelect,
      })
    },

    async dashboard(createdAfter) {
      const [totalUsers, totalAdmins, newUsersLast7Days] = await db.$transaction([
        db.user.count(),
        db.user.count({ where: { role: 'admin' } }),
        db.user.count({ where: { createdAt: { gte: createdAfter } } }),
      ])
      return { totalUsers, totalAdmins, newUsersLast7Days }
    },

    async listUsers({ page, pageSize, q }: AdminUsersQuery) {
      const where = q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' as const } },
              { displayName: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}
      const [total, users] = await db.$transaction([
        db.user.count({ where }),
        db.user.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: userSummarySelect,
        }),
      ])
      return {
        items: users.map(toAdminUserSummary),
        page,
        pageSize,
        total,
        hasNext: page < ADMIN_USERS_MAX_PAGE && page * pageSize < total,
      }
    },

    updateRole(input) {
      return db.$transaction(async (tx) => {
        await acquireUserRoleMutationLock(tx)
        await acquireUserAuthenticationAuthorityLock(tx, input.targetUserId)

        const actor = await tx.user.findUnique({
          where: { id: input.actorUserId },
          select: { id: true, role: true },
        })
        if (actor?.role !== 'admin') {
          throw new UsersFailure('forbidden', 'Administrator access is required')
        }

        const target = await tx.user.findUnique({
          where: { id: input.targetUserId },
          select: userSummarySelect,
        })
        if (!target) {
          throw new UsersFailure('not_found', 'User not found')
        }
        if (target.role === input.role) {
          return toAdminUserSummary(target)
        }
        if (target.id === actor.id && input.role !== 'admin') {
          throw new UsersFailure('role_conflict', 'You cannot remove your own administrator role')
        }

        if (target.role === 'admin' && input.role === 'user') {
          const adminCount = await tx.user.count({ where: { role: 'admin' } })
          if (adminCount <= 1) {
            throw new UsersFailure('role_conflict', 'At least one administrator must remain')
          }
        }

        const updated = await tx.user.update({
          where: { id: target.id },
          data: { role: input.role },
          select: userSummarySelect,
        })
        await tx.authSession.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: input.now },
        })
        await tx.passwordResetToken.updateMany({
          where: { userId: target.id, usedAt: null },
          data: { usedAt: input.now },
        })
        return toAdminUserSummary(updated)
      }, userAuthorityTransitionTransactionOptions)
    },
  }
}

function toAdminUserSummary(user: {
  id: string
  email: string
  displayName: string | null
  role: UserRole
  agentPermissions?: unknown
  createdAt: Date
}): AdminUserSummary {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    agentPermissions: ((user as { agentPermissions?: unknown }).agentPermissions as string[]) ?? [],
    createdAt: user.createdAt.toISOString(),
  }
}


/// AGENT-01-AC01: хранилище прав агентской записи для админ-операции.
export function createAgentPermissionsStore(db: DbClient) {
  return {
    async findUser(id: string) {
      const user = await db.user.findUnique({ where: { id }, select: { id: true, role: true } })
      return user
    },
    async setPermissions(id: string, permissions: string[]) {
      const user = await db.user.update({
        where: { id },
        data: { agentPermissions: permissions },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          agentPermissions: true,
        },
      })
      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role as 'user' | 'admin' | 'agent',
        agentPermissions: (user.agentPermissions as string[]) ?? [],
      }
    },
  }
}
