#!/usr/bin/env bun
/**
 * CLI-клиент CRM «Окулус Бизнес» для ИИ-агента из отдельного чата (AGENT-02).
 *
 * Использование:
 *   CRM_BASE_URL=http://localhost:3000 bun tools/crm-agent-client.ts <command> [args]
 *
 * Аутентификация: CRM_AGENT_EMAIL, CRM_AGENT_PASSWORD в окружении.
 * Access-токен короткоживущий; refresh автоматический при 401.
 *
 * Команды:
 *   status                          — проверка подключения, роль
 *   search <query>                  — поиск компаний
 *   get-company <id>                — карточка компании
 *   get-deal <id>                   — карточка сделки
 *   list-tasks [companyId]          — открытые задачи
 *   plan-company <json>             — dry-run план создания/обновления (без записи)
 *   apply-plan <planJson>           — применение просмотренного плана
 *   upsert-company <json> [--idempotency-key <key>] — быстрый путь (plan+apply за один шаг)
 *   add-contact <companyId> <json>  — контакт с каналами
 *   add-fact <companyId> <json>     — факт исследования
 *   add-draft <companyId> <json>    — черновик обращения
 *   add-task <json>                 — задача
 *   add-activity <json>             — фактическое взаимодействие
 *   result <operation> <key>        — итог операции по operationId
 *
 * Выходные коды:
 *   0 — успех
 *   1 — ошибка клиента (невалидный JSON, нет аргументов)
 *   2 — 401 Unauthorized (проверьте credentials)
 *   3 — 403 Forbidden (нет права)
 *   4 — 409 Conflict (дубль/версия/ключ)
 *   5 — 429 Rate limited
 *   6 — серверная ошибка 5xx
 *   7 — таймаут
 *   8 — результат неизвестен (потеря ответа; проверьте result <op> <key>)
 *
 * Идемпотентность: --idempotency-key <key>. Повтор с тем же ключом и той же
 * нагрузкой возвращает сохранённый результат без второй записи.
 */

const BASE_URL = (process.env.CRM_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const EMAIL = process.env.CRM_AGENT_EMAIL
const PASSWORD = process.env.CRM_AGENT_PASSWORD
const REQUEST_TIMEOUT_MS = 30_000

type Tokens = { accessToken: string; refreshToken: string }
let tokens: Tokens | null = null

// --- Коды выхода ---
const EXIT = {
  client: 1,
  unauthorized: 2,
  forbidden: 3,
  conflict: 4,
  rateLimited: 5,
  server: 6,
  timeout: 7,
  unknown: 8,
} as const

class ApiError extends Error {
  constructor(
    public readonly exitCode: number,
    public readonly httpStatus: number | null,
    public readonly apiCode: string | null,
    message: string,
  ) {
    super(message)
  }
}

async function login(): Promise<void> {
  if (!EMAIL || !PASSWORD) {
    console.error('Задайте CRM_AGENT_EMAIL и CRM_AGENT_PASSWORD в окружении')
    process.exit(EXIT.client)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${BASE_URL}/api/auth/token/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      signal: controller.signal,
    })
    if (!response.ok) {
      console.error(JSON.stringify({ outcome: 'unauthorized', httpStatus: response.status, detail: await response.text() }, null, 2))
      process.exit(EXIT.unauthorized)
    }
    tokens = (await response.json()) as Tokens
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(JSON.stringify({ outcome: 'timeout', phase: 'login' }, null, 2))
      process.exit(EXIT.timeout)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function refresh(): Promise<boolean> {
  if (tokens === null) return false
  try {
    const response = await fetch(`${BASE_URL}/api/auth/token/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    })
    if (!response.ok) return false
    tokens = (await response.json()) as Tokens
    return true
  } catch {
    return false
  }
}

interface ApiResult {
  status: number
  body: unknown
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<ApiResult> {
  if (tokens === null) await login()
  const makeCall = async (): Promise<Response> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      return await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${tokens!.accessToken}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...extraHeaders,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }
  let response: Response
  try {
    response = await makeCall()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(EXIT.timeout, null, null, `Таймаут запроса ${method} ${path}`)
    }
    throw new ApiError(EXIT.unknown, null, null, `Сетевая ошибка: ${String(error)}`)
  }
  if (response.status === 401 && (await refresh())) {
    response = await makeCall()
  }
  const text = await response.text()
  return { status: response.status, body: text === '' ? {} : JSON.parse(text) }
}

/// Вызов записывающей операции с проверкой HTTP-статуса (V2-R02).
/// Успех — только 200/201; всё остальное — структурированный отказ и ненулевой exit.
async function mutatingCall(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<ApiResult> {
  const result = await request(method, path, body, extraHeaders)
  if (result.status >= 200 && result.status < 300) return result
  const errorBody = result.body as { error?: { code?: string; message?: string } }
  const apiCode = errorBody?.error?.code ?? null
  const message = errorBody?.error?.message ?? `HTTP ${result.status}`
  const outcome =
    result.status === 401 ? 'unauthorized'
    : result.status === 403 ? 'forbidden'
    : result.status === 409 ? 'conflict'
    : result.status === 429 ? 'rate_limited'
    : result.status >= 500 ? 'server_error'
    : 'rejected'
  const exitCode =
    result.status === 401 ? EXIT.unauthorized
    : result.status === 403 ? EXIT.forbidden
    : result.status === 409 ? EXIT.conflict
    : result.status === 429 ? EXIT.rateLimited
    : result.status >= 500 ? EXIT.server
    : EXIT.client
  console.error(JSON.stringify({ outcome, httpStatus: result.status, apiCode, detail: message }, null, 2))
  process.exit(exitCode)
}

function output(label: string, data: unknown): void {
  console.log(`--- ${label} ---`)
  console.log(JSON.stringify(data, null, 2))
}

function parseJsonArg(arg: string | undefined, name: string): Record<string, unknown> {
  if (arg === undefined) {
    console.error(JSON.stringify({ outcome: 'client_error', detail: `Ожидается JSON-аргумент: ${name}` }))
    process.exit(EXIT.client)
  }
  try {
    return JSON.parse(arg) as Record<string, unknown>
  } catch {
    console.error(JSON.stringify({ outcome: 'client_error', detail: `Некорректный JSON в ${name}` }))
    process.exit(EXIT.client)
  }
}

// --- V2-R01: корректный разбор --idempotency-key (без splice-бага) ---
function extractIdempotencyKey(args: string[]): { key: string | null; remaining: string[] } {
  const remaining: string[] = []
  let key: string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--idempotency-key') {
      const value = args[i + 1]
      if (value === undefined) {
        console.error(JSON.stringify({ outcome: 'client_error', detail: '--idempotency-key требует значение' }))
        process.exit(EXIT.client)
      }
      key = value
      i++ // пропускаем значение
    } else {
      remaining.push(args[i])
    }
  }
  return { key, remaining }
}

async function main(): Promise<void> {
  const [command, ...rawArgs] = process.argv.slice(2)
  const { key: idemKey, remaining: args } = extractIdempotencyKey(rawArgs)
  const headers: Record<string, string> = {}
  if (idemKey !== null) headers['Idempotency-Key'] = idemKey

  switch (command) {
    case 'status': {
      const me = await mutatingCall('GET', '/api/auth/me')
      output('whoami', me.body)
      return
    }
    case 'search': {
      const query = args[0] ?? ''
      const result = await mutatingCall('GET', `/api/crm/companies?search=${encodeURIComponent(query)}&limit=20`)
      output('search', result.body)
      return
    }
    case 'get-company': {
      const id = args[0]
      if (id === undefined) { console.error(JSON.stringify({ outcome: 'client_error', detail: 'Укажите companyId' })); process.exit(EXIT.client) }
      const result = await mutatingCall('GET', `/api/crm/companies/${id}`)
      output('company', result.body)
      return
    }
    case 'get-deal': {
      const id = args[0]
      if (id === undefined) { console.error(JSON.stringify({ outcome: 'client_error', detail: 'Укажите dealId' })); process.exit(EXIT.client) }
      const result = await mutatingCall('GET', `/api/crm/deals/${id}`)
      output('deal', result.body)
      return
    }
    case 'list-tasks': {
      const companyId = args[0]
      const path = companyId !== undefined ? `/api/crm/tasks?companyId=${companyId}&status=open` : '/api/crm/tasks?status=open'
      const result = await mutatingCall('GET', path)
      output('tasks', result.body)
      return
    }
    case 'plan-company': {
      // V2-R04: единый план — те же правила, что apply
      const input = parseJsonArg(args[0], 'company JSON')
      const plan = await buildCompanyPlan(input)
      output('plan', plan)
      return
    }
    case 'apply-plan': {
      const plan = parseJsonArg(args[0], 'plan JSON')
      const result = await applyCompanyPlan(plan, headers)
      output('applied', result)
      return
    }
    case 'upsert-company': {
      const input = parseJsonArg(args[0], 'company JSON')
      const plan = await buildCompanyPlan(input)
      // Если план нашёл конфликт — показываем и останавливаемся без записи
      if (plan.action === 'skip' || plan.action === 'conflict') {
        console.error(JSON.stringify({ outcome: 'plan_conflict', plan }, null, 2))
        process.exit(EXIT.conflict)
      }
      const result = await applyCompanyPlan(plan, headers)
      output(plan.action === 'create' ? 'created' : 'updated', result)
      return
    }
    case 'add-contact': {
      const companyId = args[0]
      if (companyId === undefined) { console.error(JSON.stringify({ outcome: 'client_error', detail: 'Укажите companyId' })); process.exit(EXIT.client) }
      const input = parseJsonArg(args[1], 'contact JSON')
      const result = await mutatingCall('POST', '/api/crm/contacts', { companyId, ...input }, headers)
      output('contact', result.body)
      return
    }
    case 'add-fact': {
      const companyId = args[0]
      if (companyId === undefined) { console.error(JSON.stringify({ outcome: 'client_error', detail: 'Укажите companyId' })); process.exit(EXIT.client) }
      const input = parseJsonArg(args[1], 'fact JSON')
      const result = await mutatingCall('POST', `/api/crm/companies/${companyId}/facts`, input, headers)
      output('fact', result.body)
      return
    }
    case 'add-draft': {
      const companyId = args[0]
      if (companyId === undefined) { console.error(JSON.stringify({ outcome: 'client_error', detail: 'Укажите companyId' })); process.exit(EXIT.client) }
      const input = parseJsonArg(args[1], 'draft JSON')
      const result = await mutatingCall('POST', '/api/crm/drafts', { companyId, ...input }, headers)
      output('draft', result.body)
      return
    }
    case 'add-task': {
      const input = parseJsonArg(args[0], 'task JSON')
      const result = await mutatingCall('POST', '/api/crm/tasks', input, headers)
      output('task', result.body)
      return
    }
    case 'add-activity': {
      const input = parseJsonArg(args[0], 'activity JSON')
      const result = await mutatingCall('POST', '/api/crm/activities', input, headers)
      output('activity', result.body)
      return
    }
    case 'result': {
      const operation = args[0]
      const keyArg = args[1]
      if (operation === undefined || keyArg === undefined) { console.error(JSON.stringify({ outcome: 'client_error', detail: 'Укажите operation и key' })); process.exit(EXIT.client) }
      const result = await mutatingCall('GET', `/api/crm/idempotency/${operation}/${encodeURIComponent(keyArg)}`)
      output('result', result.body)
      return
    }
    default:
      console.log('Команды: status | search <q> | get-company <id> | get-deal <id> | list-tasks [companyId]')
      console.log('  plan-company <json> | apply-plan <planJson> | upsert-company <json> [--idempotency-key <key>]')
      console.log('  add-contact <companyId> <json> | add-fact <companyId> <json> | add-draft <companyId> <json>')
      console.log('  add-task <json> | add-activity <json> | result <op> <key>')
      console.log('Флаги: --idempotency-key <key> — идемпотентность записи')
      console.log('Выход: 0=успех 1=ошибка_клиента 2=401 3=403 4=409 5=429 6=5xx 7=таймаут 8=неизвестно')
      process.exit(command === undefined ? 0 : EXIT.client)
  }
}

// --- V2-R04: единый план создания/обновления компании ---
interface CompanyPlan {
  action: 'create' | 'update' | 'skip' | 'conflict'
  companyId: string | null
  version: number | null
  fields: Record<string, unknown>
  reason: string | null
}

async function buildCompanyPlan(input: Record<string, unknown>): Promise<CompanyPlan> {
  const name = String(input.name ?? '').trim()
  if (name === '') {
    return { action: 'skip', companyId: null, version: null, fields: input, reason: 'Пустое название' }
  }
  // Ищем по точному названию (те же правила, что apply)
  const searchResult = await mutatingCall('GET', `/api/crm/companies?search=${encodeURIComponent(name)}&limit=10`)
  const searchBody = searchResult.body as { items?: Array<{ id: string; name: string; domain: string | null; version: number }> }
  const exact = searchBody.items?.find((company) => company.name === name)
  if (exact !== undefined) {
    return {
      action: 'update',
      companyId: exact.id,
      version: exact.version,
      fields: input,
      reason: `Совпадение по названию: ${exact.name} (id=${exact.id}, v=${exact.version})`,
    }
  }
  // Проверяем домен на конфликт
  const domain = input.website !== undefined ? String(input.website) : null
  if (domain !== null && domain.trim() !== '') {
    const domainCheck = await mutatingCall('GET', `/api/crm/companies?search=${encodeURIComponent(domain)}&limit=10`)
    const domainBody = domainCheck.body as { items?: Array<{ id: string; name: string; domain: string | null }> }
    const domainMatch = domainBody.items?.find((company) => company.domain !== null && domain.includes(company.domain ?? ''))
    if (domainMatch !== undefined) {
      return {
        action: 'conflict',
        companyId: domainMatch.id,
        version: null,
        fields: input,
        reason: `Домен уже связан с «${domainMatch.name}» (id=${domainMatch.id}). Если это другое юрлицо группы — используйте allowDomainDuplicate`,
      }
    }
  }
  return { action: 'create', companyId: null, version: null, fields: input, reason: 'Новая компания' }
}

async function applyCompanyPlan(plan: CompanyPlan, headers: Record<string, string>): Promise<unknown> {
  const input = { ...plan.fields }
  if (plan.action === 'update' && plan.companyId !== null && plan.version !== null) {
    input.expectedVersion = plan.version
    return (await mutatingCall('PATCH', `/api/crm/companies/${plan.companyId}`, input, headers)).body
  }
  return (await mutatingCall('POST', '/api/crm/companies', input, headers)).body
}

void main()
