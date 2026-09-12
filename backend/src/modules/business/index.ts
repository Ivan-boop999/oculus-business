import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AuthHttpEnv } from '../auth'
import { BusinessService } from './application/business-service'
import { createPrismaBusinessRepository } from './infrastructure/business-repository'
import { createBusinessRoutes } from './transport/routes'

type CreateBusinessModuleOptions = {
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
}

export function createBusinessModule({ db, requireAuth }: CreateBusinessModuleOptions) {
  const repository = createPrismaBusinessRepository(db)
  const service = new BusinessService({
    clock: { now: () => new Date() },
    repository,
  })
  return createBusinessRoutes({ requireAuth, service })
}
