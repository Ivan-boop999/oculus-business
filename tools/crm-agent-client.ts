#!/usr/bin/env bun
/**
 * CLI-клиент CRM «Окулус Бизнес» для ИИ-агента из отдельного чата (AGENT-02).
 *
 * Использование:
 *   CRM_BASE_URL=http://localhost:3000 bun tools/crm-agent-client.ts <command> [args]
 *
 * Аутентификация: email+password агентской записи в переменных окружения
 *   CRM_AGENT_EMAIL, CRM_AGENT_PASSWORD (никогда не печатайте их в чат).
 * Клиент логинится через /api/auth/token/login и получает пару токенов.
 * Access-токен живёт коротко; refresh автоматический при 401.
 *
 * Команды:
 *   status                    — проверка подключения, роль, права
 *   search <query>            — поиск компаний (домен/ИНН/название)
 *   get-company <id>          — карточка компании с контактами
 *   get-deal <id>             — карточка сделки с квалификацией
 *   list-tasks [companyId]    — открытые задачи
 *   upsert-company <json>     — dry-run/apply создание/обновление компании
 *   add-contact <companyId> <json> — контакт с каналами
 *   add-fact <companyId> <json> — факт исследования
 *   add-draft <companyId> <json>  — черновик обращения
 *   add-task <json>           — задача
 *   add-activity <json>       — фактическое взаимодействие
 *   result <operation> <key>  — итог операции по operationId
 *
 * Идемпотентность: --idempotency-key <key> для записывающих команд.
 * Dry-run: --dry-run для upsert-company показывает план без записи.
 */

const BASE_URL = (process.env.CRM_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const EMAIL = process.env.CRM_AGENT_EMAIL
const PASSWORD = process.env.CRM_AGENT_PASSWORD

type Tokens = { accessToken: string; refreshToken: string }
let tokens: Tokens | null = null

async function login(): Promise<void> {
  if (!EMAIL || !PASSWORD) {
    console.error('Задайте CRM_AGENT_EMAIL и CRM_AGENT_PASSWORD в окружении')
    process.exit(1)
  }
  const response = await fetch(`${BASE_URL}/api/auth/token/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!response.ok) {
    console.error(`Логин отклонён: ${response.status} ${await response.text()}`)
    process.exit(1)
  }
  const body = (await response.json()) as Tokens
  tokens = body
}

async function refresh(): Promise<boolean> {
  if (tokens === null) return false
  const response = await fetch(`${BASE_URL}/api/auth/token/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  })
  if (!response.ok) return false
  tokens = (await response.json()) as Tokens
  return true
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  if (tokens === null) await login()
  const makeCall = () =>
    fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokens!.accessToken}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  let response = await makeCall()
  if (response.status === 401 && (await refresh())) {
    response = await makeCall()
  }
  const text = await response.text()
  return { status: response.status, body: text === '' ? {} : JSON.parse(text) }
}

function output(label: string, data: unknown): void {
  console.log(`--- ${label} ---`)
  console.log(JSON.stringify(data, null, 2))
}

function error(data: unknown): never {
  console.error(JSON.stringify(data, null, 2))
  process.exit(1)
}

function parseJsonArg(arg: string | undefined): Record<string, unknown> {
  if (arg === undefined) {
    console.error('Ожидается JSON-аргумент')
    process.exit(1)
  }
  try {
    return JSON.parse(arg) as Record<string, unknown>
  } catch {
    console.error(`Некорректный JSON: ${arg}`)
    process.exit(1)
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)
  const idemKey = (() => {
    const idx = args.indexOf('--idempotency-key')
    if (idx >= 0 && args[idx + 1] !== undefined) {
      args.splice(idx, 2)
      return args[idx + 1] ?? null
    }
    return null
  })()
  const dryRun = args.includes('--dry-run')
  const dryRunIdx = args.indexOf('--dry-run')
  if (dryRunIdx >= 0) args.splice(dryRunIdx, 1)

  const headers: Record<string, string> = {}
  if (idemKey !== null) headers['Idempotency-Key'] = idemKey

  switch (command) {
    case 'status': {
      const me = await request('GET', '/api/auth/me')
      output('whoami', me.body)
      return
    }
    case 'search': {
      const query = args[0] ?? ''
      const result = await request('GET', `/api/crm/companies?search=${encodeURIComponent(query)}&limit=20`)
      output('search', result.body)
      return
    }
    case 'get-company': {
      const id = args[0] ?? error({ error: 'Укажите companyId' })
      const result = await request('GET', `/api/crm/companies/${id}`)
      output('company', result.body)
      return
    }
    case 'get-deal': {
      const id = args[0] ?? error({ error: 'Укажите dealId' })
      const result = await request('GET', `/api/crm/deals/${id}`)
      output('deal', result.body)
      return
    }
    case 'list-tasks': {
      const companyId = args[0]
      const path = companyId !== undefined ? `/api/crm/tasks?companyId=${companyId}&status=open` : '/api/crm/tasks?status=open'
      const result = await request('GET', path)
      output('tasks', result.body)
      return
    }
    case 'upsert-company': {
      const input = parseJsonArg(args[0])
      if (dryRun) {
        const preview = await request('POST', '/api/crm/import/preview', {
          version: 1,
          accounts: [{ id: `cli-${Date.now()}`, company_name: String(input.name ?? ''), ...input }],
        })
        output('dry-run preview', preview.body)
        return
      }
      // Ищем существующую по домену/названию; если нет — создаём
      const search = String(input.name ?? '')
      const existing = (await request('GET', `/api/crm/companies?search=${encodeURIComponent(search)}&limit=5`)) as {
        body: { items?: Array<{ id: string; name: string }> }
      }
      const match = existing.body.items?.find((company) => company.name === search)
      if (match !== undefined) {
        const result = await request('PATCH', `/api/crm/companies/${match.id}`, input, headers)
        output('updated', result.body)
      } else {
        const result = await request('POST', '/api/crm/companies', input, headers)
        output('created', result.body)
      }
      return
    }
    case 'add-contact': {
      const companyId = args[0] ?? error({ error: 'Укажите companyId' })
      const input = parseJsonArg(args[1])
      const result = await request('POST', `/api/crm/contacts`, { companyId, ...input }, headers)
      output('contact', result.body)
      return
    }
    case 'add-fact': {
      const companyId = args[0] ?? error({ error: 'Укажите companyId' })
      const input = parseJsonArg(args[1])
      const result = await request('POST', `/api/crm/companies/${companyId}/facts`, input, headers)
      output('fact', result.body)
      return
    }
    case 'add-draft': {
      const companyId = args[0] ?? error({ error: 'Укажите companyId' })
      const input = parseJsonArg(args[1])
      const result = await request('POST', `/api/crm/drafts`, { companyId, ...input }, headers)
      output('draft', result.body)
      return
    }
    case 'add-task': {
      const input = parseJsonArg(args[0])
      const result = await request('POST', `/api/crm/tasks`, input, headers)
      output('task', result.body)
      return
    }
    case 'add-activity': {
      const input = parseJsonArg(args[0])
      const result = await request('POST', `/api/crm/activities`, input, headers)
      output('activity', result.body)
      return
    }
    case 'result': {
      const operation = args[0] ?? error({ error: 'Укажите operation' })
      const key = args[1] ?? error({ error: 'Укажите key' })
      const result = await request('GET', `/api/crm/idempotency/${operation}/${key}`)
      output('result', result.body)
      return
    }
    default:
      console.log('Команды: status | search <q> | get-company <id> | get-deal <id> | list-tasks [companyId]')
      console.log('  upsert-company <json> [--dry-run] | add-contact <companyId> <json> | add-fact <companyId> <json>')
      console.log('  add-draft <companyId> <json> | add-task <json> | add-activity <json> | result <op> <key>')
      console.log('Флаги: --idempotency-key <key> — идемпотентность записи')
      process.exit(command === undefined ? 0 : 1)
  }
}

void main()
