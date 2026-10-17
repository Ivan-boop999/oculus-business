import {
  companiesExportResponseSchema,
  companyFactSchema,
  companyFactsResponseSchema,
  createCompanyFactRequestSchema,
  draftDeliveredRequestSchema,
  idempotencyResultResponseSchema,
  partnerAgreementResponseSchema,
  partnerAgreementSchema,
  partnerAgreementUpsertRequestSchema,
  receiptReverseRequestSchema,
  receiptReverseResponseSchema,
  agentOpLogsResponseSchema,
  activitiesResponseSchema,
  apiErrorSchema,
  companiesQuerySchema,
  companiesResponseSchema,
  companyDncLiftRequestSchema,
  companyDncRequestSchema,
  companyEventsSchema,
  companyResponseSchema,
  contactChannelResponseSchema,
  contactResponseSchema,
  contactsResponseSchema,
  createActivityRequestSchema,
  createCompanyRequestSchema,
  createContactChannelRequestSchema,
  createContactRequestSchema,
  createDealRequestSchema,
  createDraftRequestSchema,
  createSalesTaskRequestSchema,
  crmFunnelReportQuerySchema,
  crmFunnelReportResponseSchema,
  dealContactRoleSchema,
  dealDetailResponseSchema,
  dealLaunchResponseSchema,
  dealLaunchSchema,
  dealLaunchUpsertRequestSchema,
  dealResponseSchema,
  dealSubscriptionRequestSchema,
  draftApproveRequestSchema,
  draftCancelRequestSchema,
  draftResponseSchema,
  draftReviewRequestSchema,
  draftSendRequestSchema,
  draftsResponseSchema,
  importApplyRequestSchema,
  importApplyResponseSchema,
  importPipelinePayloadSchema,
  importPreviewResponseSchema,
  pilotCriterionRequestSchema,
  pilotCriterionSchema,
  pilotDecisionRequestSchema,
  pilotMilestoneRequestSchema,
  pilotMilestoneSchema,
  pilotMilestoneUpdateRequestSchema,
  paymentReceiptRequestSchema,
  paymentReceiptResponseSchema,
  pilotResponseSchema,
  pilotSchema,
  pilotUpsertRequestSchema,
  proposalDraftsResponseSchema,
  saveDealClaimRequestSchema,
  saveDealContactRoleRequestSchema,
  salesTaskResponseSchema,
  salesTasksResponseSchema,
  todayResponseSchema,
  updateCompanyRequestSchema,
  updateContactChannelRequestSchema,
  updateContactRequestSchema,
  updateDraftRequestSchema,
  updateSalesTaskRequestSchema,
  businessUsersResponseSchema,
  activityResponseSchema,
  claimResponseSchema,
} from '@oculus-business/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import { z } from 'zod'

import { validationErrorHook } from '../../../http/errors'
import type { AuthHttpEnv } from '../../auth'
import type { ActorContext, SalesService } from '../application/sales-service'
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

export type CreateSalesRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  salesService: SalesService
}

/// Актор запроса: пользователь + агентские заголовки идемпотентности и runId (§8.6).
export function actorOf(c: { var: { user: { id: string; role: 'user' | 'admin' | 'agent' } } }, headers: Headers): ActorContext {
  return {
    userId: c.var.user.id,
    role: c.var.user.role,
    runId: headers.get('x-run-id'),
    idempotencyKey: headers.get('idempotency-key'),
  }
}

const emptyBody = { content: json(z.object({}).strict()) }

export function createSalesRoutes({ requireAuth, salesService }: CreateSalesRoutesOptions) {
  const crm = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })
  const finance = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })
  for (const router of [crm, finance]) {
    router.use('*', requireAuth)
  }

  // ------------------------------------------------------------ Участники

  const usersRoute = createRoute({
    method: 'get',
    path: '/users',
    security: bearerSecurity,
    responses: {
      200: { content: json(businessUsersResponseSchema), description: 'Business users' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(usersRoute, async (c) => {
    return c.json({ items: await executeBusiness(() => salesService.businessUsers()) }, 200)
  })

  // ------------------------------------------------------------ Компании

  const listCompaniesRoute = createRoute({
    method: 'get',
    path: '/companies',
    security: bearerSecurity,
    request: { query: companiesQuerySchema },
    responses: {
      200: { content: json(companiesResponseSchema), description: 'Companies' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(listCompaniesRoute, async (c) => {
    return c.json(await executeBusiness(() => salesService.companies(c.req.valid('query'))), 200)
  })

  const createCompanySalesRoute = createRoute({
    method: 'post',
    path: '/companies',
    security: bearerSecurity,
    request: { body: { content: json(createCompanyRequestSchema) } },
    responses: {
      201: { content: json(companyResponseSchema), description: 'Created company' },
      ...standardErrors,
    },
  })
  crm.openapi(createCompanySalesRoute, async (c) => {
    const company = await executeBusiness(() =>
      salesService.createCompany(c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ company }, 201)
  })

  const companyRoute = createRoute({
    method: 'get',
    path: '/companies/{id}',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict() },
    responses: {
      200: { content: json(companyResponseSchema), description: 'Company' },
      ...standardErrors,
    },
  })
  crm.openapi(companyRoute, async (c) => {
    return c.json(
      { company: await executeBusiness(() => salesService.company(c.req.valid('param').id)) },
      200,
    )
  })

  const patchCompanyRoute = createRoute({
    method: 'patch',
    path: '/companies/{id}',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(updateCompanyRequestSchema) },
    },
    responses: {
      200: { content: json(companyResponseSchema), description: 'Updated company' },
      ...standardErrors,
    },
  })
  crm.openapi(patchCompanyRoute, async (c) => {
    const company = await executeBusiness(() =>
      salesService.updateCompany(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ company }, 200)
  })

  const companyDncRoute = createRoute({
    method: 'post',
    path: '/companies/{id}/dnc',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(companyDncRequestSchema) },
    },
    responses: {
      200: { content: json(companyResponseSchema), description: 'DNC set' },
      ...standardErrors,
    },
  })
  crm.openapi(companyDncRoute, async (c) => {
    const body = c.req.valid('json')
    const company = await executeBusiness(() =>
      salesService.setCompanyDnc(
        c.req.valid('param').id,
        { reason: body.reason, scope: body.scope, source: body.source ?? null },
        actorOf(c, c.req.raw.headers),
      ),
    )
    return c.json({ company }, 200)
  })

  const companyDncLiftRoute = createRoute({
    method: 'post',
    path: '/companies/{id}/dnc/lift',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(companyDncLiftRequestSchema) },
    },
    responses: {
      200: { content: json(companyResponseSchema), description: 'DNC lifted' },
      ...standardErrors,
    },
  })
  crm.openapi(companyDncLiftRoute, async (c) => {
    const company = await executeBusiness(() =>
      salesService.liftCompanyDnc(
        c.req.valid('param').id,
        c.req.valid('json').reason,
        actorOf(c, c.req.raw.headers),
      ),
    )
    return c.json({ company }, 200)
  })

  const companyEventsRoute = createRoute({
    method: 'get',
    path: '/companies/{id}/events',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict() },
    responses: {
      200: { content: json(companyEventsSchema), description: 'Company events' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(companyEventsRoute, async (c) => {
    return c.json(await executeBusiness(() => salesService.companyEvents(c.req.valid('param').id)), 200)
  })

  // ------------------------------------------------------------ Контакты

  const contactsRoute = createRoute({
    method: 'get',
    path: '/contacts',
    security: bearerSecurity,
    request: {
      query: z.object({ companyId: z.string().uuid() }).strict(),
    },
    responses: {
      200: { content: json(contactsResponseSchema), description: 'Contacts' },
      ...standardErrors,
    },
  })
  crm.openapi(contactsRoute, async (c) => {
    return c.json(await executeBusiness(() => salesService.contacts(c.req.valid('query').companyId)), 200)
  })

  const createContactRoute = createRoute({
    method: 'post',
    path: '/contacts',
    security: bearerSecurity,
    request: { body: { content: json(createContactRequestSchema) } },
    responses: {
      201: { content: json(contactResponseSchema), description: 'Created contact' },
      ...standardErrors,
    },
  })
  crm.openapi(createContactRoute, async (c) => {
    const contact = await executeBusiness(() =>
      salesService.createContact(c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ contact }, 201)
  })

  const patchContactRoute = createRoute({
    method: 'patch',
    path: '/contacts/{id}',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(updateContactRequestSchema) },
    },
    responses: {
      200: { content: json(contactResponseSchema), description: 'Updated contact' },
      ...standardErrors,
    },
  })
  crm.openapi(patchContactRoute, async (c) => {
    const contact = await executeBusiness(() =>
      salesService.updateContact(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ contact }, 200)
  })

  const contactDncRoute = createRoute({
    method: 'post',
    path: '/contacts/{id}/dnc',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(companyDncRequestSchema) },
    },
    responses: {
      200: { content: json(contactResponseSchema), description: 'DNC set' },
      ...standardErrors,
    },
  })
  crm.openapi(contactDncRoute, async (c) => {
    const body = c.req.valid('json')
    const contact = await executeBusiness(() =>
      salesService.setContactDnc(
        c.req.valid('param').id,
        { reason: body.reason, scope: body.scope, source: body.source ?? null },
        actorOf(c, c.req.raw.headers),
      ),
    )
    return c.json({ contact }, 200)
  })

  const contactDncLiftRoute = createRoute({
    method: 'post',
    path: '/contacts/{id}/dnc/lift',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(companyDncLiftRequestSchema) },
    },
    responses: {
      200: { content: json(contactResponseSchema), description: 'DNC lifted' },
      ...standardErrors,
    },
  })
  crm.openapi(contactDncLiftRoute, async (c) => {
    const contact = await executeBusiness(() =>
      salesService.liftContactDnc(c.req.valid('param').id, c.req.valid('json').reason, actorOf(c, c.req.raw.headers)),
    )
    return c.json({ contact }, 200)
  })

  const createChannelRoute = createRoute({
    method: 'post',
    path: '/contacts/{id}/channels',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(createContactChannelRequestSchema) },
    },
    responses: {
      201: { content: json(contactChannelResponseSchema), description: 'Created channel' },
      ...standardErrors,
    },
  })
  crm.openapi(createChannelRoute, async (c) => {
    const channel = await executeBusiness(() =>
      salesService.createChannel(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ channel }, 201)
  })

  const patchChannelRoute = createRoute({
    method: 'patch',
    path: '/channels/{id}',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(updateContactChannelRequestSchema) },
    },
    responses: {
      200: { content: json(contactChannelResponseSchema), description: 'Updated channel' },
      ...standardErrors,
    },
  })
  crm.openapi(patchChannelRoute, async (c) => {
    const channel = await executeBusiness(() =>
      salesService.updateChannel(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ channel }, 200)
  })

  // ------------------------------------------------------------ Сделка: детали, квалификация, роли

  const dealDetailRoute = createRoute({
    method: 'get',
    path: '/deals/{id}',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict() },
    responses: {
      200: { content: json(dealDetailResponseSchema), description: 'Deal detail' },
      ...standardErrors,
    },
  })
  crm.openapi(dealDetailRoute, async (c) => {
    return c.json({ deal: await executeBusiness(() => salesService.dealDetail(c.req.valid('param').id)) }, 200)
  })

  const dealClaimsRoute = createRoute({
    method: 'get',
    path: '/deals/{id}/claims',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict() },
    responses: {
      200: { content: json(z.object({ items: z.array(claimResponseSchema) }).strict()), description: 'Claims' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(dealClaimsRoute, async (c) => {
    return c.json(
      { items: await executeBusiness(() => salesService.dealClaims(c.req.valid('param').id)) },
      200,
    )
  })

  const saveDealClaimRoute = createRoute({
    method: 'put',
    path: '/deals/{id}/claims',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(saveDealClaimRequestSchema) },
    },
    responses: {
      200: { content: json(claimResponseSchema), description: 'Saved claim' },
      ...standardErrors,
    },
  })
  crm.openapi(saveDealClaimRoute, async (c) => {
    const claim = await executeBusiness(() =>
      salesService.saveDealClaim(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json(claim, 200)
  })

  const dealRolesRoute = createRoute({
    method: 'get',
    path: '/deals/{id}/contact-roles',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict() },
    responses: {
      200: {
        content: json(z.object({ items: z.array(dealContactRoleSchema) }).strict()),
        description: 'Contact roles',
      },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(dealRolesRoute, async (c) => {
    return c.json(
      { items: await executeBusiness(() => salesService.dealContactRoles(c.req.valid('param').id)) },
      200,
    )
  })

  const saveDealRoleRoute = createRoute({
    method: 'put',
    path: '/deals/{id}/contact-roles',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(saveDealContactRoleRequestSchema) },
    },
    responses: {
      200: { content: json(dealContactRoleSchema), description: 'Saved role' },
      ...standardErrors,
    },
  })
  crm.openapi(saveDealRoleRoute, async (c) => {
    return c.json(
      await executeBusiness(() =>
        salesService.saveDealContactRole(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
      ),
      200,
    )
  })

  const deleteDealRoleRoute = createRoute({
    method: 'delete',
    path: '/deals/{id}/contact-roles/{roleId}',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid(), roleId: z.string().uuid() }).strict(),
    },
    responses: {
      204: { description: 'Deleted' },
      401: { content: errorContent, description: 'Authentication required' },
      404: { content: errorContent, description: 'Not found' },
    },
  })
  crm.openapi(deleteDealRoleRoute, async (c) => {
    await executeBusiness(() => salesService.deleteDealContactRole(c.req.valid('param').roleId))
    return c.body(null, 204)
  })

  // ------------------------------------------------------------ Активности и задачи

  const activitiesRoute = createRoute({
    method: 'get',
    path: '/activities',
    security: bearerSecurity,
    request: {
      query: z
        .object({
          companyId: z.string().uuid().optional(),
          dealId: z.string().uuid().optional(),
          direction: z.enum(['inbound', 'outbound']).optional(),
          unprocessedOnly: z.coerce.boolean().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .strict(),
    },
    responses: {
      200: { content: json(activitiesResponseSchema), description: 'Activities' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(activitiesRoute, async (c) => {
    return c.json(await executeBusiness(() => salesService.activities(c.req.valid('query'))), 200)
  })

  const createActivityRoute = createRoute({
    method: 'post',
    path: '/activities',
    security: bearerSecurity,
    request: { body: { content: json(createActivityRequestSchema) } },
    responses: {
      201: { content: json(activityResponseSchema), description: 'Created activity' },
      ...standardErrors,
    },
  })
  crm.openapi(createActivityRoute, async (c) => {
    const activity = await executeBusiness(() =>
      salesService.createActivity(c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ activity }, 201)
  })

  const activityProcessedRoute = createRoute({
    method: 'post',
    path: '/activities/{id}/processed',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict(), body: emptyBody },
    responses: {
      204: { description: 'Marked processed' },
      ...standardErrors,
    },
  })
  crm.openapi(activityProcessedRoute, async (c) => {
    await executeBusiness(() =>
      salesService.markActivityProcessed(c.req.valid('param').id, actorOf(c, c.req.raw.headers)),
    )
    return c.body(null, 204)
  })

  const tasksRoute = createRoute({
    method: 'get',
    path: '/tasks',
    security: bearerSecurity,
    request: {
      query: z
        .object({
          status: z.enum(['open', 'done', 'cancelled']).optional(),
          assigneeId: z.string().uuid().optional(),
          companyId: z.string().uuid().optional(),
          dealId: z.string().uuid().optional(),
          dueBefore: z.string().datetime({ offset: true }).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .strict(),
    },
    responses: {
      200: { content: json(salesTasksResponseSchema), description: 'Sales tasks' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(tasksRoute, async (c) => {
    return c.json(await executeBusiness(() => salesService.tasks(c.req.valid('query'))), 200)
  })

  const createTaskRoute = createRoute({
    method: 'post',
    path: '/tasks',
    security: bearerSecurity,
    request: { body: { content: json(createSalesTaskRequestSchema) } },
    responses: {
      201: { content: json(salesTaskResponseSchema), description: 'Created task' },
      ...standardErrors,
    },
  })
  crm.openapi(createTaskRoute, async (c) => {
    const task = await executeBusiness(() =>
      salesService.createTask(c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ task }, 201)
  })

  const patchTaskRoute = createRoute({
    method: 'patch',
    path: '/tasks/{id}',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(updateSalesTaskRequestSchema) },
    },
    responses: {
      200: { content: json(salesTaskResponseSchema), description: 'Updated task' },
      ...standardErrors,
    },
  })
  crm.openapi(patchTaskRoute, async (c) => {
    const task = await executeBusiness(() =>
      salesService.updateTask(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ task }, 200)
  })

  const todayRoute = createRoute({
    method: 'get',
    path: '/today',
    security: bearerSecurity,
    responses: {
      200: { content: json(todayResponseSchema), description: 'Today screen data' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(todayRoute, async (c) => {
    return c.json(await executeBusiness(() => salesService.today()), 200)
  })

  // ------------------------------------------------------------ Черновики

  const draftsRoute = createRoute({
    method: 'get',
    path: '/drafts',
    security: bearerSecurity,
    request: {
      query: z
        .object({
          status: z.string().max(40).optional(),
          companyId: z.string().uuid().optional(),
          dealId: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .strict(),
    },
    responses: {
      200: { content: json(draftsResponseSchema), description: 'Drafts queue' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(draftsRoute, async (c) => {
    return c.json(await executeBusiness(() => salesService.drafts(c.req.valid('query'))), 200)
  })

  const createDraftRoute = createRoute({
    method: 'post',
    path: '/drafts',
    security: bearerSecurity,
    request: { body: { content: json(createDraftRequestSchema) } },
    responses: {
      201: { content: json(draftResponseSchema), description: 'Created draft' },
      ...standardErrors,
    },
  })
  crm.openapi(createDraftRoute, async (c) => {
    const draft = await executeBusiness(() =>
      salesService.createDraft(c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ draft }, 201)
  })

  const patchDraftRoute = createRoute({
    method: 'patch',
    path: '/drafts/{id}',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(updateDraftRequestSchema) },
    },
    responses: {
      200: { content: json(draftResponseSchema), description: 'Updated draft' },
      ...standardErrors,
    },
  })
  const getDraftRoute = createRoute({
    method: 'get',
    path: '/drafts/{id}',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict() },
    responses: {
      200: { content: json(draftResponseSchema), description: 'Draft by id' },
      ...standardErrors,
    },
  })
  crm.openapi(getDraftRoute, async (c) => {
    return c.json({ draft: await executeBusiness(() => salesService.draft(c.req.valid('param').id)) }, 200)
  })

  crm.openapi(patchDraftRoute, async (c) => {
    const draft = await executeBusiness(() =>
      salesService.updateDraft(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ draft }, 200)
  })

  const draftReviewRoute = createRoute({
    method: 'post',
    path: '/drafts/{id}/review',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict(), body: emptyBody },
    responses: {
      200: { content: json(draftResponseSchema), description: 'Reviewed' },
      ...standardErrors,
    },
  })
  crm.openapi(draftReviewRoute, async (c) => {
    const draft = await executeBusiness(() =>
      salesService.reviewDraft(c.req.valid('param').id, actorOf(c, c.req.raw.headers)),
    )
    return c.json({ draft }, 200)
  })

  const draftApproveRoute = createRoute({
    method: 'post',
    path: '/drafts/{id}/approve',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict(), body: emptyBody },
    responses: {
      200: { content: json(draftResponseSchema), description: 'Approved' },
      ...standardErrors,
    },
  })
  crm.openapi(draftApproveRoute, async (c) => {
    const draft = await executeBusiness(() =>
      salesService.approveDraft(c.req.valid('param').id, actorOf(c, c.req.raw.headers)),
    )
    return c.json({ draft }, 200)
  })

  const draftSendRoute = createRoute({
    method: 'post',
    path: '/drafts/{id}/send',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(draftSendRequestSchema) },
    },
    responses: {
      200: { content: json(draftResponseSchema), description: 'Send fixed manually' },
      ...standardErrors,
    },
  })
  crm.openapi(draftSendRoute, async (c) => {
    const draft = await executeBusiness(() =>
      salesService.sendDraft(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ draft }, 200)
  })

  const draftCancelRoute = createRoute({
    method: 'post',
    path: '/drafts/{id}/cancel',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(draftCancelRequestSchema) },
    },
    responses: {
      200: { content: json(draftResponseSchema), description: 'Cancelled' },
      ...standardErrors,
    },
  })
  crm.openapi(draftCancelRoute, async (c) => {
    const draft = await executeBusiness(() =>
      salesService.cancelDraft(c.req.valid('param').id, c.req.valid('json').reason),
    )
    return c.json({ draft }, 200)
  })

  const draftVersionsRoute = createRoute({
    method: 'get',
    path: '/drafts/{id}/versions',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict() },
    responses: {
      200: { content: json(proposalDraftsResponseSchema), description: 'Versions' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(draftVersionsRoute, async (c) => {
    const current = await executeBusiness(() => salesService.draft(c.req.valid('param').id))
    return c.json(await executeBusiness(() => salesService.draftVersions(current.groupId)), 200)
  })

  // ------------------------------------------------------------ Пилот

  const pilotRoute = createRoute({
    method: 'get',
    path: '/deals/{id}/pilot',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict() },
    responses: {
      200: { content: json(pilotResponseSchema), description: 'Pilot' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(pilotRoute, async (c) => {
    return c.json(
      { pilot: await executeBusiness(() => salesService.pilot(c.req.valid('param').id)) },
      200,
    )
  })

  const upsertPilotRoute = createRoute({
    method: 'put',
    path: '/deals/{id}/pilot',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(pilotUpsertRequestSchema) },
    },
    responses: {
      200: { content: json(pilotSchema), description: 'Saved pilot' },
      ...standardErrors,
    },
  })
  crm.openapi(upsertPilotRoute, async (c) => {
    return c.json(
      await executeBusiness(() => salesService.upsertPilot(c.req.valid('param').id, c.req.valid('json'))),
      200,
    )
  })

  const pilotActivateRoute = createRoute({
    method: 'post',
    path: '/deals/{id}/pilot/activate',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict(), body: emptyBody },
    responses: {
      200: { content: json(pilotSchema), description: 'Pilot running' },
      ...standardErrors,
    },
  })
  crm.openapi(pilotActivateRoute, async (c) => {
    return c.json(
      await executeBusiness(() =>
        salesService.activatePilot(c.req.valid('param').id, actorOf(c, c.req.raw.headers)),
      ),
      200,
    )
  })

  const pilotDecisionRoute = createRoute({
    method: 'post',
    path: '/deals/{id}/pilot/decision',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(pilotDecisionRequestSchema) },
    },
    responses: {
      200: { content: json(pilotSchema), description: 'Decision recorded' },
      ...standardErrors,
    },
  })
  crm.openapi(pilotDecisionRoute, async (c) => {
    return c.json(
      await executeBusiness(() =>
        salesService.decidePilot(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
      ),
      200,
    )
  })

  const pilotCriterionRoute = createRoute({
    method: 'post',
    path: '/deals/{id}/pilot/criteria',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(pilotCriterionRequestSchema) },
    },
    responses: {
      201: { content: json(pilotCriterionSchema), description: 'Criterion added' },
      ...standardErrors,
    },
  })
  crm.openapi(pilotCriterionRoute, async (c) => {
    return c.json(
      await executeBusiness(() =>
        salesService.addPilotCriterion(c.req.valid('param').id, {
          statement: c.req.valid('json').statement,
          method: c.req.valid('json').method ?? null,
        }),
      ),
      201,
    )
  })

  const pilotCriterionPatchRoute = createRoute({
    method: 'patch',
    path: '/pilot-criteria/{id}',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(pilotCriterionRequestSchema) },
    },
    responses: {
      200: { content: json(pilotCriterionSchema), description: 'New criterion version' },
      ...standardErrors,
    },
  })
  crm.openapi(pilotCriterionPatchRoute, async (c) => {
    return c.json(
      await executeBusiness(() =>
        salesService.updatePilotCriterion(c.req.valid('param').id, {
          statement: c.req.valid('json').statement,
          method: c.req.valid('json').method ?? null,
        }),
      ),
      200,
    )
  })

  const pilotCriterionAgreeRoute = createRoute({
    method: 'post',
    path: '/pilot-criteria/{id}/agree',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict(), body: emptyBody },
    responses: {
      200: { content: json(pilotCriterionSchema), description: 'Agreed' },
      ...standardErrors,
    },
  })
  crm.openapi(pilotCriterionAgreeRoute, async (c) => {
    return c.json(
      await executeBusiness(() =>
        salesService.agreePilotCriterion(c.req.valid('param').id, actorOf(c, c.req.raw.headers)),
      ),
      200,
    )
  })

  const pilotMilestoneRoute = createRoute({
    method: 'post',
    path: '/deals/{id}/pilot/milestones',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(pilotMilestoneRequestSchema) },
    },
    responses: {
      201: { content: json(pilotMilestoneSchema), description: 'Milestone added' },
      ...standardErrors,
    },
  })
  crm.openapi(pilotMilestoneRoute, async (c) => {
    return c.json(
      await executeBusiness(() =>
        salesService.addPilotMilestone(c.req.valid('param').id, {
          side: c.req.valid('json').side,
          commitment: c.req.valid('json').commitment,
          ownerId: c.req.valid('json').ownerId ?? null,
          dueOn: c.req.valid('json').dueOn ?? null,
        }),
      ),
      201,
    )
  })

  const pilotMilestonePatchRoute = createRoute({
    method: 'patch',
    path: '/pilot-milestones/{id}',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(pilotMilestoneUpdateRequestSchema) },
    },
    responses: {
      200: { content: json(pilotMilestoneSchema), description: 'Milestone updated' },
      ...standardErrors,
    },
  })
  crm.openapi(pilotMilestonePatchRoute, async (c) => {
    return c.json(
      await executeBusiness(() =>
        salesService.updatePilotMilestone(c.req.valid('param').id, c.req.valid('json')),
      ),
      200,
    )
  })

  // ------------------------------------------------------------ Запуск и расширение

  const launchRoute = createRoute({
    method: 'get',
    path: '/deals/{id}/launch',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict() },
    responses: {
      200: { content: json(dealLaunchResponseSchema), description: 'Launch' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(launchRoute, async (c) => {
    return c.json(
      { launch: await executeBusiness(() => salesService.launch(c.req.valid('param').id)) },
      200,
    )
  })

  const upsertLaunchRoute = createRoute({
    method: 'put',
    path: '/deals/{id}/launch',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(dealLaunchUpsertRequestSchema) },
    },
    responses: {
      200: { content: json(dealLaunchSchema), description: 'Saved launch' },
      ...standardErrors,
    },
  })
  crm.openapi(upsertLaunchRoute, async (c) => {
    return c.json(
      await executeBusiness(() =>
        salesService.upsertLaunch(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
      ),
      200,
    )
  })

  const extensionRoute = createRoute({
    method: 'post',
    path: '/deals/{id}/extension',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: {
        content: json(
          z
            .object({
              title: z.string().trim().min(1).max(120),
              monthlyAmount: z.number().int().min(0).max(1_000_000_000).default(0),
              oneTimeAmount: z.number().int().min(0).max(1_000_000_000).default(0),
              basis: z.string().trim().min(3).max(1000),
            })
            .strict(),
        ),
      },
    },
    responses: {
      201: { content: json(dealResponseSchema), description: 'Extension deal created' },
      ...standardErrors,
    },
  })
  crm.openapi(extensionRoute, async (c) => {
    const deal = await executeBusiness(() =>
      salesService.createExtensionDeal(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ deal }, 201)
  })

  // ------------------------------------------------------------ Отчёт и импорт

  const funnelReportRoute = createRoute({
    method: 'get',
    path: '/report/funnel',
    security: bearerSecurity,
    request: { query: crmFunnelReportQuerySchema },
    responses: {
      200: { content: json(crmFunnelReportResponseSchema), description: 'Funnel report' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(funnelReportRoute, async (c) => {
    return c.json(await executeBusiness(() => salesService.funnelReport(c.req.valid('query'))), 200)
  })

  const importPreviewRoute = createRoute({
    method: 'post',
    path: '/import/preview',
    security: bearerSecurity,
    request: { body: { content: json(importPipelinePayloadSchema) } },
    responses: {
      200: { content: json(importPreviewResponseSchema), description: 'Import preview' },
      ...standardErrors,
    },
  })
  crm.openapi(importPreviewRoute, async (c) => {
    return c.json(await executeBusiness(() => salesService.importPreview(c.req.valid('json'))), 200)
  })

  const importApplyRoute = createRoute({
    method: 'post',
    path: '/import/apply',
    security: bearerSecurity,
    request: { body: { content: json(importApplyRequestSchema) } },
    responses: {
      200: { content: json(importApplyResponseSchema), description: 'Import applied' },
      ...standardErrors,
    },
  })
  crm.openapi(importApplyRoute, async (c) => {
    return c.json(
      await executeBusiness(() =>
        salesService.importApply(c.req.valid('json'), actorOf(c, c.req.raw.headers)),
      ),
      200,
    )
  })

  const agentOpsRoute = createRoute({
    method: 'get',
    path: '/agent-ops',
    security: bearerSecurity,
    request: {
      query: z
        .object({
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .strict(),
    },
    responses: {
      200: { content: json(agentOpLogsResponseSchema), description: 'Agent op log' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(agentOpsRoute, async (c) => {
    return c.json(await executeBusiness(() => salesService.agentOps(c.req.valid('query'))), 200)
  })

  // ------------------------------------------------------------ Финансы: подписка и поступления

  const subscriptionRoute = createRoute({
    method: 'post',
    path: '/deals/{id}/subscription',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(dealSubscriptionRequestSchema) },
    },
    responses: {
      200: { content: json(dealResponseSchema), description: 'Subscription state saved' },
      ...standardErrors,
    },
  })
  finance.openapi(subscriptionRoute, async (c) => {
    const deal = await executeBusiness(() =>
      salesService.setSubscription(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ deal }, 200)
  })

  const receiptRoute = createRoute({
    method: 'post',
    path: '/expected/{id}/receipts',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(paymentReceiptRequestSchema) },
    },
    responses: {
      201: { content: json(paymentReceiptResponseSchema), description: 'Receipt applied' },
      ...standardErrors,
    },
  })
  finance.openapi(receiptRoute, async (c) => {
    const body = c.req.valid('json')
    const receipt = await executeBusiness(() =>
      salesService.confirmReceipt(
        c.req.valid('param').id,
        {
          amount: body.amount,
          actualReceivedOn: body.actualReceivedOn,
          comment: body.comment ?? null,
          allowOverpayment: body.allowOverpayment ?? false,
        },
        actorOf(c, c.req.raw.headers),
      ),
    )
    return c.json({ receipt }, 201)
  })

  // ------------------------------------------------------------ V2 (FIX/OWNER/AGENT)

  const factsRoute = createRoute({
    method: 'get',
    path: '/companies/{id}/facts',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict() },
    responses: {
      200: { content: json(companyFactsResponseSchema), description: 'Research facts' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(factsRoute, async (c) => {
    return c.json(await executeBusiness(() => salesService.companyFacts(c.req.valid('param').id)), 200)
  })

  const createFactRoute = createRoute({
    method: 'post',
    path: '/companies/{id}/facts',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(createCompanyFactRequestSchema) },
    },
    responses: {
      201: { content: json(z.object({ fact: companyFactSchema }).strict()), description: 'Fact added' },
      ...standardErrors,
    },
  })
  crm.openapi(createFactRoute, async (c) => {
    const fact = await executeBusiness(() =>
      salesService.addCompanyFact(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ fact }, 201)
  })

  const partnerRoute = createRoute({
    method: 'get',
    path: '/deals/{id}/partner',
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }).strict() },
    responses: {
      200: { content: json(partnerAgreementResponseSchema), description: 'Partner agreement' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(partnerRoute, async (c) => {
    return c.json(await executeBusiness(() => salesService.partnerAgreement(c.req.valid('param').id)), 200)
  })

  const upsertPartnerRoute = createRoute({
    method: 'put',
    path: '/deals/{id}/partner',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(partnerAgreementUpsertRequestSchema) },
    },
    responses: {
      200: { content: json(partnerAgreementSchema), description: 'Saved partner terms' },
      ...standardErrors,
    },
  })
  crm.openapi(upsertPartnerRoute, async (c) => {
    return c.json(
      await executeBusiness(() =>
        salesService.upsertPartnerAgreement(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
      ),
      200,
    )
  })

  const draftDeliveredRoute = createRoute({
    method: 'post',
    path: '/drafts/{id}/delivered',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }).strict(),
      body: { content: json(draftDeliveredRequestSchema) },
    },
    responses: {
      200: { content: json(draftResponseSchema), description: 'Delivery proof recorded' },
      ...standardErrors,
    },
  })
  crm.openapi(draftDeliveredRoute, async (c) => {
    const draft = await executeBusiness(() =>
      salesService.deliveredDraft(c.req.valid('param').id, c.req.valid('json'), actorOf(c, c.req.raw.headers)),
    )
    return c.json({ draft }, 200)
  })

  const reverseReceiptRoute = createRoute({
    method: 'post',
    path: '/expected/{id}/receipts/{txnId}/reverse',
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid(), txnId: z.string().uuid() }).strict(),
      body: { content: json(receiptReverseRequestSchema) },
    },
    responses: {
      200: { content: json(receiptReverseResponseSchema), description: 'Receipt reversed' },
      ...standardErrors,
    },
  })
  finance.openapi(reverseReceiptRoute, async (c) => {
    const body = c.req.valid('json')
    const result = await executeBusiness(() =>
      salesService.reverseReceipt(
        c.req.valid('param').id,
        c.req.valid('param').txnId,
        { reason: body.reason, reversalDate: body.reversalDate },
        actorOf(c, c.req.raw.headers),
      ),
    )
    return c.json(result, 200)
  })

  const exportRoute = createRoute({
    method: 'get',
    path: '/companies/export',
    security: bearerSecurity,
    responses: {
      200: { content: json(companiesExportResponseSchema), description: 'Own data export with ids' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(exportRoute, async (c) => {
    return c.json(await executeBusiness(() => salesService.exportCompanies()), 200)
  })

  const idempotencyResultRoute = createRoute({
    method: 'get',
    path: '/idempotency/{operation}/{key}',
    security: bearerSecurity,
    request: {
      params: z.object({ operation: z.string().min(1).max(80), key: z.string().min(1).max(200) }).strict(),
    },
    responses: {
      200: { content: json(idempotencyResultResponseSchema), description: 'Operation result by id' },
      401: { content: errorContent, description: 'Authentication required' },
    },
  })
  crm.openapi(idempotencyResultRoute, async (c) => {
    const actor = actorOf(c, c.req.raw.headers)
    const result = await executeBusiness(() =>
      salesService.idempotencyResult(actor, c.req.valid('param').operation, c.req.valid('param').key),
    )
    return c.json(result as never, 200)
  })

  return { salesCrm: crm, salesFinance: finance }
}
