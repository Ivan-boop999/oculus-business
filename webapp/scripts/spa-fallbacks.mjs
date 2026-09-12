// SPA-фолбеки для статического хостинга: копируем index.html в каталог каждого маршрута,
// чтобы прямые ссылки (/app/crm из письма или закладки) открывались без серверного rewrite.
// Render static не даёт управлять rewrite через API после создания сервиса, поэтому
// держим копии страниц сами. Список маршрутов синхронен src/routes.tsx.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webappRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(webappRoot, 'dist')
const indexPath = join(dist, 'index.html')

const ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/app',
  '/app/crm',
  '/app/crm/report',
  '/app/finance',
  '/app/finance/recurring',
  '/app/finance/forecast',
  '/app/tasks',
  '/app/profile',
  '/app/settings',
  '/admin',
  '/admin/users',
  '/admin/settings',
]

for (const route of ROUTES) {
  const target = join(dist, route, 'index.html')
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(indexPath, target)
}

console.log(`SPA-фолбеки: ${ROUTES.length} маршрутов получили index.html`)
