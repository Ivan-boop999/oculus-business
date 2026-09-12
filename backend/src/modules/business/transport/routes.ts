import {
  apiErrorSchema,
  bizSettingsResponseSchema,
  createDealCommentRequestSchema,
  createDealRequestSchema,
  createCrmStageRequestSchema,
  createDevColumnRequestSchema,
  createDevTaskCommentRequestSchema,
  createDevTaskRequestSchema,
  createRecurringItemRequestSchema,
  cashflowHistoryResponseSchema,
  createExpectedPaymentRequestSchema,
  createTxnRequestSchema,
  crmBoardResponseSchema,
  crmReportResponseSchema,
  dealHistoryResponseSchema,
  expectedPaymentResponseSchema,
  expectedPaymentsResponseSchema,
  mrrMovementResponseSchema,
  updateExpectedPaymentRequestSchema,
  crmStageResponseSchema,
  dashboardResponseSchema,
  dealCommentsResponseSchema,
  dealResponseSchema,
  devBoardResponseSchema,
  devColumnResponseSchema,
  devTaskCommentsResponseSchema,
  devTaskResponseSchema,
  financeSummaryResponseSchema,
  forecastQuerySchema,
  forecastResponseSchema,
  idParamSchema,
  monthGoalResponseSchema,
  moveDealRequestSchema,
  moveDevTaskRequestSchema,
  recurringItemResponseSchema,
  recurringItemsResponseSchema,
  txnsQuerySchema,
  txnsResponseSchema,
  txnResponseSchema,
  updateBizSettingsRequestSchema,
  saveMonthGoalRequestSchema,
  updateCrmStageRequestSchema,
  updateDevColumnRequestSchema,
  updateDevTaskRequestSchema,
  updateDealRequestSchema,
  updateRecurringItemRequestSchema,
  updateTxnRequestSchema,
} from '@oculus-business/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import type { z } from 'zod'

import { validationErrorHook } from '../../../http/errors'
import type { AuthHttpEnv } from '../../auth'
import type { BusinessService } from '../application/business-service'
import { executeBusiness } from './errors'

const errorContent = { 'application/json': { schema: apiErrorSchema } }

const bearerSecurity = [{ BearerAuth: [] }]

const standardErrors = {
  400: { content: errorContent, description: 'Invalid payload' },
  401: { content: errorContent, description: 'Authentication required' },
  404: { content: errorContent, description: 'Not found' },
  409: { content: errorContent, description: 'Conflict' },
}

const json = <TSchema extends z.ZodType>(schema: TSchema) => ({
  'application/json': { schema },
})

const crmBoardRoute = createRoute({
  method: 'get',
  path: '/board',
  security: bearerSecurity,
  responses: {
    200: { content: json(crmBoardResponseSchema), description: 'CRM board with stages and deals' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const createDealRoute = createRoute({
  method: 'post',
  path: '/deals',
  security: bearerSecurity,
  request: { body: { content: json(createDealRequestSchema) } },
  responses: {
    201: { content: json(dealResponseSchema), description: 'Created deal' },
    ...standardErrors,
  },
})

const updateDealRoute = createRoute({
  method: 'patch',
  path: '/deals/{id}',
  security: bearerSecurity,
  request: {
    params: idParamSchema,
    body: { content: json(updateDealRequestSchema) },
  },
  responses: {
    200: { content: json(dealResponseSchema), description: 'Updated deal' },
    ...standardErrors,
  },
})

const moveDealRoute = createRoute({
  method: 'post',
  path: '/deals/{id}/move',
  security: bearerSecurity,
  request: {
    params: idParamSchema,
    body: { content: json(moveDealRequestSchema) },
  },
  responses: {
    200: { content: json(dealResponseSchema), description: 'Moved deal' },
    ...standardErrors,
  },
})

const deleteDealRoute = createRoute({
  method: 'delete',
  path: '/deals/{id}',
  security: bearerSecurity,
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Deleted' },
    401: { content: errorContent, description: 'Authentication required' },
    404: { content: errorContent, description: 'Not found' },
  },
})

const dealCommentsRoute = createRoute({
  method: 'get',
  path: '/deals/{id}/comments',
  security: bearerSecurity,
  request: { params: idParamSchema },
  responses: {
    200: { content: json(dealCommentsResponseSchema), description: 'Deal comments' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const addDealCommentRoute = createRoute({
  method: 'post',
  path: '/deals/{id}/comments',
  security: bearerSecurity,
  request: {
    params: idParamSchema,
    body: { content: json(createDealCommentRequestSchema) },
  },
  responses: {
    201: { content: json(dealCommentsResponseSchema), description: 'All comments after add' },
    ...standardErrors,
  },
})

const createStageRoute = createRoute({
  method: 'post',
  path: '/stages',
  security: bearerSecurity,
  request: { body: { content: json(createCrmStageRequestSchema) } },
  responses: {
    201: { content: json(crmStageResponseSchema), description: 'Created stage' },
    ...standardErrors,
  },
})

const updateStageRoute = createRoute({
  method: 'patch',
  path: '/stages/{id}',
  security: bearerSecurity,
  request: {
    params: idParamSchema,
    body: { content: json(updateCrmStageRequestSchema) },
  },
  responses: {
    200: { content: json(crmStageResponseSchema), description: 'Updated stage' },
    ...standardErrors,
  },
})

const deleteStageRoute = createRoute({
  method: 'delete',
  path: '/stages/{id}',
  security: bearerSecurity,
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Deleted' },
    401: { content: errorContent, description: 'Authentication required' },
    404: { content: errorContent, description: 'Not found' },
    409: { content: errorContent, description: 'Stage has deals' },
  },
})

const devBoardRoute = createRoute({
  method: 'get',
  path: '/board',
  security: bearerSecurity,
  responses: {
    200: { content: json(devBoardResponseSchema), description: 'Dev board with columns and tasks' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const createDevTaskRoute = createRoute({
  method: 'post',
  path: '/tasks',
  security: bearerSecurity,
  request: { body: { content: json(createDevTaskRequestSchema) } },
  responses: {
    201: { content: json(devTaskResponseSchema), description: 'Created task' },
    ...standardErrors,
  },
})

const updateDevTaskRoute = createRoute({
  method: 'patch',
  path: '/tasks/{id}',
  security: bearerSecurity,
  request: {
    params: idParamSchema,
    body: { content: json(updateDevTaskRequestSchema) },
  },
  responses: {
    200: { content: json(devTaskResponseSchema), description: 'Updated task' },
    ...standardErrors,
  },
})

const moveDevTaskRoute = createRoute({
  method: 'post',
  path: '/tasks/{id}/move',
  security: bearerSecurity,
  request: {
    params: idParamSchema,
    body: { content: json(moveDevTaskRequestSchema) },
  },
  responses: {
    200: { content: json(devTaskResponseSchema), description: 'Moved task' },
    ...standardErrors,
  },
})

const deleteDevTaskRoute = createRoute({
  method: 'delete',
  path: '/tasks/{id}',
  security: bearerSecurity,
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Deleted' },
    401: { content: errorContent, description: 'Authentication required' },
    404: { content: errorContent, description: 'Not found' },
  },
})

const devTaskCommentsRoute = createRoute({
  method: 'get',
  path: '/tasks/{id}/comments',
  security: bearerSecurity,
  request: { params: idParamSchema },
  responses: {
    200: { content: json(devTaskCommentsResponseSchema), description: 'Task comments' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const addDevTaskCommentRoute = createRoute({
  method: 'post',
  path: '/tasks/{id}/comments',
  security: bearerSecurity,
  request: {
    params: idParamSchema,
    body: { content: json(createDevTaskCommentRequestSchema) },
  },
  responses: {
    201: { content: json(devTaskCommentsResponseSchema), description: 'All comments after add' },
    ...standardErrors,
  },
})

const createDevColumnRoute = createRoute({
  method: 'post',
  path: '/columns',
  security: bearerSecurity,
  request: { body: { content: json(createDevColumnRequestSchema) } },
  responses: {
    201: { content: json(devColumnResponseSchema), description: 'Created column' },
    ...standardErrors,
  },
})

const updateDevColumnRoute = createRoute({
  method: 'patch',
  path: '/columns/{id}',
  security: bearerSecurity,
  request: {
    params: idParamSchema,
    body: { content: json(updateDevColumnRequestSchema) },
  },
  responses: {
    200: { content: json(devColumnResponseSchema), description: 'Updated column' },
    ...standardErrors,
  },
})

const deleteDevColumnRoute = createRoute({
  method: 'delete',
  path: '/columns/{id}',
  security: bearerSecurity,
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Deleted' },
    401: { content: errorContent, description: 'Authentication required' },
    404: { content: errorContent, description: 'Not found' },
    409: { content: errorContent, description: 'Column has tasks' },
  },
})

const txnsRoute = createRoute({
  method: 'get',
  path: '/txns',
  security: bearerSecurity,
  request: { query: txnsQuerySchema },
  responses: {
    200: { content: json(txnsResponseSchema), description: 'Transactions of month + recurring' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const createTxnRoute = createRoute({
  method: 'post',
  path: '/txns',
  security: bearerSecurity,
  request: { body: { content: json(createTxnRequestSchema) } },
  responses: {
    201: { content: json(txnResponseSchema), description: 'Created transaction' },
    ...standardErrors,
  },
})

const updateTxnRoute = createRoute({
  method: 'patch',
  path: '/txns/{id}',
  security: bearerSecurity,
  request: {
    params: idParamSchema,
    body: { content: json(updateTxnRequestSchema) },
  },
  responses: {
    200: { content: json(txnResponseSchema), description: 'Updated transaction' },
    ...standardErrors,
  },
})

const deleteTxnRoute = createRoute({
  method: 'delete',
  path: '/txns/{id}',
  security: bearerSecurity,
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Deleted' },
    401: { content: errorContent, description: 'Authentication required' },
    404: { content: errorContent, description: 'Not found' },
  },
})

const recurringRoute = createRoute({
  method: 'get',
  path: '/recurring',
  security: bearerSecurity,
  responses: {
    200: { content: json(recurringItemsResponseSchema), description: 'Recurring items' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const createRecurringRoute = createRoute({
  method: 'post',
  path: '/recurring',
  security: bearerSecurity,
  request: { body: { content: json(createRecurringItemRequestSchema) } },
  responses: {
    201: { content: json(recurringItemResponseSchema), description: 'Created recurring item' },
    ...standardErrors,
  },
})

const updateRecurringRoute = createRoute({
  method: 'patch',
  path: '/recurring/{id}',
  security: bearerSecurity,
  request: {
    params: idParamSchema,
    body: { content: json(updateRecurringItemRequestSchema) },
  },
  responses: {
    200: { content: json(recurringItemResponseSchema), description: 'Updated recurring item' },
    ...standardErrors,
  },
})

const deleteRecurringRoute = createRoute({
  method: 'delete',
  path: '/recurring/{id}',
  security: bearerSecurity,
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Deleted' },
    401: { content: errorContent, description: 'Authentication required' },
    404: { content: errorContent, description: 'Not found' },
  },
})

const settingsRoute = createRoute({
  method: 'get',
  path: '/settings',
  security: bearerSecurity,
  responses: {
    200: { content: json(bizSettingsResponseSchema), description: 'Business settings' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const updateSettingsRoute = createRoute({
  method: 'put',
  path: '/settings',
  security: bearerSecurity,
  request: { body: { content: json(updateBizSettingsRequestSchema) } },
  responses: {
    200: { content: json(bizSettingsResponseSchema), description: 'Saved business settings' },
    ...standardErrors,
  },
})

const summaryRoute = createRoute({
  method: 'get',
  path: '/summary',
  security: bearerSecurity,
  request: { query: txnsQuerySchema },
  responses: {
    200: { content: json(financeSummaryResponseSchema), description: 'Month finance summary' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const goalsRoute = createRoute({
  method: 'get',
  path: '/goals',
  security: bearerSecurity,
  request: { query: txnsQuerySchema },
  responses: {
    200: { content: json(monthGoalResponseSchema), description: 'Month goal' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const saveGoalRoute = createRoute({
  method: 'put',
  path: '/goals',
  security: bearerSecurity,
  request: { body: { content: json(saveMonthGoalRequestSchema) } },
  responses: {
    200: { content: json(monthGoalResponseSchema), description: 'Saved month goal' },
    ...standardErrors,
  },
})

const forecastRoute = createRoute({
  method: 'get',
  path: '/forecast',
  security: bearerSecurity,
  request: { query: forecastQuerySchema },
  responses: {
    200: { content: json(forecastResponseSchema), description: 'Cash flow forecast' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})


const dealHistoryRoute = createRoute({
  method: 'get',
  path: '/deals/{id}/history',
  security: bearerSecurity,
  request: { params: idParamSchema },
  responses: {
    200: { content: json(dealHistoryResponseSchema), description: 'Deal stage history' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const crmReportRoute = createRoute({
  method: 'get',
  path: '/report',
  security: bearerSecurity,
  responses: {
    200: { content: json(crmReportResponseSchema), description: 'Pipeline funnel report' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const mrrMovementRoute = createRoute({
  method: 'get',
  path: '/mrr-movement',
  security: bearerSecurity,
  request: { query: forecastQuerySchema },
  responses: {
    200: { content: json(mrrMovementResponseSchema), description: 'MRR movement by month' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const cashflowHistoryRoute = createRoute({
  method: 'get',
  path: '/history',
  security: bearerSecurity,
  request: { query: forecastQuerySchema },
  responses: {
    200: { content: json(cashflowHistoryResponseSchema), description: 'Cash flow by month' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const expectedRoute = createRoute({
  method: 'get',
  path: '/expected',
  security: bearerSecurity,
  responses: {
    200: { content: json(expectedPaymentsResponseSchema), description: 'Expected payments' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const createExpectedRoute = createRoute({
  method: 'post',
  path: '/expected',
  security: bearerSecurity,
  request: { body: { content: json(createExpectedPaymentRequestSchema) } },
  responses: {
    201: { content: json(expectedPaymentResponseSchema), description: 'Created expected payment' },
    ...standardErrors,
  },
})

const updateExpectedRoute = createRoute({
  method: 'patch',
  path: '/expected/{id}',
  security: bearerSecurity,
  request: {
    params: idParamSchema,
    body: { content: json(updateExpectedPaymentRequestSchema) },
  },
  responses: {
    200: { content: json(expectedPaymentResponseSchema), description: 'Updated expected payment' },
    ...standardErrors,
  },
})

const deleteExpectedRoute = createRoute({
  method: 'delete',
  path: '/expected/{id}',
  security: bearerSecurity,
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Deleted' },
    401: { content: errorContent, description: 'Authentication required' },
    404: { content: errorContent, description: 'Not found' },
  },
})

const expectedReceivedRoute = createRoute({
  method: 'post',
  path: '/expected/{id}/received',
  security: bearerSecurity,
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Converted to income transaction' },
    ...standardErrors,
  },
})

const dashboardRoute = createRoute({
  method: 'get',
  path: '/',
  security: bearerSecurity,
  responses: {
    200: { content: json(dashboardResponseSchema), description: 'Home dashboard' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

type CreateBusinessRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: BusinessService
}

export function createBusinessRoutes({ requireAuth, service }: CreateBusinessRoutesOptions) {
  const crm = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })
  const dev = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })
  const finance = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })
  const dashboard = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  for (const router of [crm, dev, finance, dashboard]) {
    router.use('*', requireAuth)
  }

  crm.openapi(crmBoardRoute, async (c) => {
    return c.json(await executeBusiness(() => service.crmBoard()), 200)
  })
  crm.openapi(createDealRoute, async (c) => {
    const deal = await executeBusiness(() =>
      service.createDeal(c.req.valid('json'), c.var.user.id),
    )
    return c.json({ deal }, 201)
  })
  crm.openapi(updateDealRoute, async (c) => {
    const deal = await executeBusiness(() =>
      service.updateDeal(c.req.valid('param').id, c.req.valid('json')),
    )
    return c.json({ deal }, 200)
  })
  crm.openapi(moveDealRoute, async (c) => {
    const body = c.req.valid('json')
    const deal = await executeBusiness(() =>
      service.moveDeal(c.req.valid('param').id, body.stageId, body.position),
    )
    return c.json({ deal }, 200)
  })
  crm.openapi(deleteDealRoute, async (c) => {
    await executeBusiness(() => service.deleteDeal(c.req.valid('param').id))
    return c.body(null, 204)
  })
  crm.openapi(dealCommentsRoute, async (c) => {
    return c.json({ comments: await executeBusiness(() => service.dealComments(c.req.valid('param').id)) }, 200)
  })
  crm.openapi(addDealCommentRoute, async (c) => {
    const body = c.req.valid('json')
    const comments = await executeBusiness(() =>
      service.addDealComment(c.req.valid('param').id, c.var.user.id, body.body),
    )
    return c.json({ comments }, 201)
  })
  crm.openapi(createStageRoute, async (c) => {
    const stage = await executeBusiness(() => service.createStage(c.req.valid('json')))
    return c.json({ stage }, 201)
  })
  crm.openapi(updateStageRoute, async (c) => {
    const stage = await executeBusiness(() =>
      service.updateStage(c.req.valid('param').id, c.req.valid('json')),
    )
    return c.json({ stage }, 200)
  })
  crm.openapi(deleteStageRoute, async (c) => {
    await executeBusiness(() => service.deleteStage(c.req.valid('param').id))
    return c.body(null, 204)
  })

  crm.openapi(dealHistoryRoute, async (c) => {
    return c.json(
      { entries: await executeBusiness(() => service.dealHistory(c.req.valid('param').id)) },
      200,
    )
  })
  crm.openapi(crmReportRoute, async (c) => {
    return c.json(await executeBusiness(() => service.crmReport()), 200)
  })
  dev.openapi(devBoardRoute, async (c) => {
    return c.json(await executeBusiness(() => service.devBoard()), 200)
  })
  dev.openapi(createDevTaskRoute, async (c) => {
    const task = await executeBusiness(() =>
      service.createDevTask(c.req.valid('json'), c.var.user.id),
    )
    return c.json({ task }, 201)
  })
  dev.openapi(updateDevTaskRoute, async (c) => {
    const task = await executeBusiness(() =>
      service.updateDevTask(c.req.valid('param').id, c.req.valid('json')),
    )
    return c.json({ task }, 200)
  })
  dev.openapi(moveDevTaskRoute, async (c) => {
    const body = c.req.valid('json')
    const task = await executeBusiness(() =>
      service.moveDevTask(c.req.valid('param').id, body.columnId, body.position),
    )
    return c.json({ task }, 200)
  })
  dev.openapi(deleteDevTaskRoute, async (c) => {
    await executeBusiness(() => service.deleteDevTask(c.req.valid('param').id))
    return c.body(null, 204)
  })
  dev.openapi(devTaskCommentsRoute, async (c) => {
    return c.json(
      { comments: await executeBusiness(() => service.devTaskComments(c.req.valid('param').id)) },
      200,
    )
  })
  dev.openapi(addDevTaskCommentRoute, async (c) => {
    const body = c.req.valid('json')
    const comments = await executeBusiness(() =>
      service.addDevTaskComment(c.req.valid('param').id, c.var.user.id, body.body),
    )
    return c.json({ comments }, 201)
  })
  dev.openapi(createDevColumnRoute, async (c) => {
    const column = await executeBusiness(() => service.createDevColumn(c.req.valid('json')))
    return c.json({ column }, 201)
  })
  dev.openapi(updateDevColumnRoute, async (c) => {
    const column = await executeBusiness(() =>
      service.updateDevColumn(c.req.valid('param').id, c.req.valid('json')),
    )
    return c.json({ column }, 200)
  })
  dev.openapi(deleteDevColumnRoute, async (c) => {
    await executeBusiness(() => service.deleteDevColumn(c.req.valid('param').id))
    return c.body(null, 204)
  })

  finance.openapi(txnsRoute, async (c) => {
    const { month } = c.req.valid('query')
    return c.json(await executeBusiness(() => service.txns(month)), 200)
  })
  finance.openapi(createTxnRoute, async (c) => {
    const txn = await executeBusiness(() => service.createTxn(c.req.valid('json'), c.var.user.id))
    return c.json({ txn }, 201)
  })
  finance.openapi(updateTxnRoute, async (c) => {
    const txn = await executeBusiness(() =>
      service.updateTxn(c.req.valid('param').id, c.req.valid('json')),
    )
    return c.json({ txn }, 200)
  })
  finance.openapi(deleteTxnRoute, async (c) => {
    await executeBusiness(() => service.deleteTxn(c.req.valid('param').id))
    return c.body(null, 204)
  })
  finance.openapi(recurringRoute, async (c) => {
    return c.json(await executeBusiness(() => service.recurringItems()), 200)
  })
  finance.openapi(createRecurringRoute, async (c) => {
    const item = await executeBusiness(() =>
      service.createRecurring(c.req.valid('json'), c.var.user.id),
    )
    return c.json({ item }, 201)
  })
  finance.openapi(updateRecurringRoute, async (c) => {
    const item = await executeBusiness(() =>
      service.updateRecurring(c.req.valid('param').id, c.req.valid('json')),
    )
    return c.json({ item }, 200)
  })
  finance.openapi(deleteRecurringRoute, async (c) => {
    await executeBusiness(() => service.deleteRecurring(c.req.valid('param').id))
    return c.body(null, 204)
  })
  finance.openapi(settingsRoute, async (c) => {
    return c.json({ settings: await executeBusiness(() => service.settings()) }, 200)
  })
  finance.openapi(updateSettingsRoute, async (c) => {
    const settings = await executeBusiness(() => service.saveSettings(c.req.valid('json')))
    return c.json({ settings }, 200)
  })
  finance.openapi(summaryRoute, async (c) => {
    const { month } = c.req.valid('query')
    return c.json(await executeBusiness(() => service.summary(month)), 200)
  })
  finance.openapi(goalsRoute, async (c) => {
    const { month } = c.req.valid('query')
    const goal = await executeBusiness(() => service.goal(month ?? ''))
    return c.json({ goal }, 200)
  })
  finance.openapi(saveGoalRoute, async (c) => {
    const goal = await executeBusiness(() => service.saveGoal(c.req.valid('json')))
    return c.json({ goal }, 200)
  })
  finance.openapi(mrrMovementRoute, async (c) => {
    const { months } = c.req.valid('query')
    return c.json(await executeBusiness(() => service.mrrMovement(months)), 200)
  })
  finance.openapi(cashflowHistoryRoute, async (c) => {
    const { months } = c.req.valid('query')
    return c.json(await executeBusiness(() => service.cashflowHistory(months)), 200)
  })
  finance.openapi(expectedRoute, async (c) => {
    return c.json(await executeBusiness(() => service.expectedPayments()), 200)
  })
  finance.openapi(createExpectedRoute, async (c) => {
    const payment = await executeBusiness(() => service.createExpectedPayment(c.req.valid('json')))
    return c.json({ payment }, 201)
  })
  finance.openapi(updateExpectedRoute, async (c) => {
    const payment = await executeBusiness(() =>
      service.updateExpectedPayment(c.req.valid('param').id, c.req.valid('json')),
    )
    return c.json({ payment }, 200)
  })
  finance.openapi(deleteExpectedRoute, async (c) => {
    await executeBusiness(() => service.deleteExpectedPayment(c.req.valid('param').id))
    return c.body(null, 204)
  })
  finance.openapi(expectedReceivedRoute, async (c) => {
    await executeBusiness(() => service.markExpectedReceived(c.req.valid('param').id, c.var.user.id))
    return c.body(null, 204)
  })
  finance.openapi(forecastRoute, async (c) => {
    const { months } = c.req.valid('query')
    return c.json(await executeBusiness(() => service.forecast(months)), 200)
  })

  dashboard.openapi(dashboardRoute, async (c) => {
    return c.json(await executeBusiness(() => service.dashboard()), 200)
  })

  return { crm, dev, finance, dashboard }
}
