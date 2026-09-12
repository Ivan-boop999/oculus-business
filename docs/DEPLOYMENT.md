# Деплой — Render free tier + Neon PostgreSQL

Решение владельца (как в ПромМаркете): бесплатный Render вместо DigitalOcean/Yandex Cloud.
Полная фиксация выбора — в секции Deployment `CHECKLIST.md`. При появлении бюджета — миграция на Yandex Cloud (см. AGENTS.md Project Context).

## Что где живёт

| Компонент | Сервис Render | План | Источник |
| --- | --- | --- | --- |
| API (Bun/Hono, Docker) | `oculus-business-api` | free | `backend/Dockerfile`, ветка `master`, autoDeploy |
| Webapp (React/Vite, static) | `oculus-business` | free | `bun install --filter @oculus-business/webapp && cd webapp && bun run build` |
| PostgreSQL | Neon, проект `oculusivan`, база `oculus_business` | free | `DATABASE_URL` в окружении API |

## Порядок релиза

1. Пуш в `master` → Render сам пересобирает оба сервиса (autoDeploy).
2. Контейнер API при старте выполняет `prisma migrate deploy` и `scripts/bootstrap-business.ts`
   (идемпотентно: справочники этапов/колонок, стартовый остаток, админ из `ADMIN_SEED_*`).
3. Проверка: `https://oculus-business-api.onrender.com/health/ready` → `{"status":"ok"}`.

## Секреты

Все секреты задаются в окружении Render (services → Environment), в репозитории их нет:
`DATABASE_URL`, `JWT_SECRET`, `WEBAPP_ORIGIN`, `CORS_ORIGINS`, `SIGNUP_INVITE_CODE`,
`ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, `VITE_API_URL` (static site).
Локальные копии для восстановления — `C:\temp\prommarket-deploy\` и `C:\temp\oculus-business-deploy\` на ПК владельца.

## Известные ограничения free-тарифа

- API засыпает после ~15 минут без трафика; первый запрос после сна — медленный (~30–50 с).
- 750 часов инстансов в месяц: два сервиса укладываются.
- Cron/worker на Render free не запускаем: outbox-drain происходит при жизни API-процесса.

## Явно не используется

`scripts/infra.mjs` и Terraform-каталоги `infra/` удалены из проекта (хостинг не DO/YC).
Собственный сервер не рассматривается.
