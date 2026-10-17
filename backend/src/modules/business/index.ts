import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AuthHttpEnv } from '../auth'
import { BusinessService } from './application/business-service'
import { SalesService } from './application/sales-service'
import { createPrismaBusinessRepository } from './infrastructure/business-repository'
import { createSalesRepository } from './infrastructure/sales-repository'
import { createSalesRepositoryV2 } from './infrastructure/sales-repository-v2'
import { createTelegramNotifier } from './infrastructure/telegram'
import { createBusinessRoutes } from './transport/routes'

type CreateBusinessModuleOptions = {
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
}

export function createBusinessModule({ db, requireAuth }: CreateBusinessModuleOptions) {
  const notifier = createTelegramNotifier({
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  })
  const repository = createPrismaBusinessRepository(db)
  const salesRepository = { ...createSalesRepository(db), ...createSalesRepositoryV2(db) }
  const service = new BusinessService({
    clock: { now: () => new Date() },
    notifier,
    repository,
  })
  const salesService = new SalesService({
    clock: { now: () => new Date() },
    notifier,
    repository: salesRepository,
  })
  return createBusinessRoutes({ requireAuth, service, salesService })
}
