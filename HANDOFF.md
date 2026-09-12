# HANDOFF — Окулус Бизнес

**Этот файл — для следующего ИИ-ассистента (Codex/Claude/ZCode). Прочитай целиком перед работой.**
Здесь: что это, где что лежит, как деплоится, и где грабли.

## Продукт одним абзацем

«Окулус Бизнес» — мобильное веб-приложение для управления бизнесом ОРДИКС/OCULUS (MES для
промышленных предприятий, ordiks.ru): 1) CRM с канбан-воронкой сделок (подписки от 25К ₽/мес,
возмездные обследования ~165К ₽/мес × 3), 2) финансы — разовые операции + регулярные ежемесячные
платежи + прогноз на 6 месяцев и runway (методика владельца: Comfortable/Stable/Watchful/Defensive/Critical),
3) канбан доработок и багов продукта. Построено на шаблоне vibe (ветка master), стиль UX — по образцу
YouGile (быстрые карточки, чат-комментарии на карточке, редактируемые колонки).

## Адреса и доступы

- Вебапп: https://oculus-business.onrender.com
- API: https://oculus-business-api.onrender.com (`/health/ready` — проверка живости)
- Репозиторий: https://github.com/Ivan-boop999/oculus-business (public, ветка master)
- БД: Neon, проект `oculusivan`, база `oculus_business` (non-pooler `ep-proud-pond-ax88a5v7`, pooler `…-pooler`)
- Локальные секреты: `C:\temp\oculus-business-deploy\` (admin-email, admin-password, invite-code, jwt-secret, JSON-ответы Render API). Render API-ключ — в `C:\temp\prommarket-deploy\render-api-key`.
- Первый админ: `ceo@oculus.business` + пароль из `C:\temp\oculus-business-deploy\admin-password`.
  Владелец может зарегистрировать свой аккаунт по коду приглашения (`invite-code`) и выдать себе
  роль admin на странице «Пользователи» (ссылка из Настроек), аккаунт ceo@ — запасной.
- Регистрация закрыта: env `SIGNUP_INVITE_CODE` обязателен при signup.
- Файлы (аватары): Backblaze B2, бакет `prommarket-uploads` (общий с ПромМаркетом; ключ ограничен
  этим бакетом, отдельный бакет создать нечем — ключи объектов случайные, коллизий нет).

## Деплой (Render free, как ПромМаркет — решение владельца)

- API: web service `oculus-business-api`, Docker, **Dockerfile в КОРНЕ репозитория** (Render ищет
  его в корне контекста; `backend/Dockerfile` — тот же файл для локальной сборки). Free plan, autoDeploy
  с `master`. CMD: `prisma migrate deploy && bun scripts/bootstrap-business.ts && bun src/index.ts`
  — деплой самоподдерживающийся: миграции + идемпотентный бутстрап (этапы/колонки/settings/админ/
  демо-данные при `SEED_DEMO_DATA=1` и пустых сделках).
- Вебапп: static site `oculus-business`, build `bun install --filter @oculus-business/webapp && cd webapp && bun run build`,
  publish `./webapp/dist`, env `VITE_API_URL=https://oculus-business-api.onrender.com`.
  ВАЖНО: НЕ `npm i -g bun && …` — на Render bun уже установлен по `.bun-version`, npm-установка падает.
- Изменение env: `PUT /v1/services/{id}/env-vars` (полный список!) — задать env НЕ достаточно для
  деплоя, после PUT нужен `POST /v1/services/{id}/deploys`. Все вызовы через VPN-прокси
  `http://127.0.0.1:10809` (api.render.com блокирован провайдером напрямую).
- Логи сборки/рантайма: `GET /v1/logs?ownerId=tea-…&resource=srv-…&type=build|app&direction=backward&startTime=…&endTime=…`.
- Free-нюансы: API засыпает ~15 мин без трафика (первый запрос до ~50 с); worker/cron не запускаем.

## Архитектура

- Backend: Bun + Hono + Prisma 7.9.0 (не повышать! 7.9.1+ ломается) + PostgreSQL (Neon, PG18, uuidv7).
  Модули: шаблонные `auth`/`users`/`uploads` + продуктовый **`modules/business`** (hexagonal:
  domain/forecast.ts — чистая математика прогноза; application/business-service.ts + ports;
  infrastructure/business-repository.ts (Prisma + маппинг в DTO); transport/routes.ts — три группы
  роутов + dashboard). Смонтировано в `src/app.ts`: `/api/crm`, `/api/dev`, `/api/finance`, `/api/dashboard`.
- Контракты: `packages/contracts/src/business.ts` — все Zod-схемы, даты-без-времени как 'YYYY-MM-DD',
  деньги — целые рубли (Int). Регистрация: `registerRequestSchema.inviteCode` + проверка в
  `auth/transport/routes.ts::assertInviteCode` (env `SIGNUP_INVITE_CODE`).
- Webapp: React 19 + Vite + TanStack Router/Query. Мобильный шелл `components/MobileShell.tsx`
  (нижняя навигация: Обзор/Сделки/Финансы/Задачи; профиль в шапке). Фичи: `features/dashboard`,
  `features/crm` (CrmBoardPage + DealSheet), `features/finance` (FinancePage/TxnSheet/RecurringPage/
  ForecastPage), `features/devboard`. Канбан: HTML5 drag&drop на десктопе + «Переместить» селектом
  в шите на телефоне. Админ-зона `/admin/*` — десктопный WorkspaceShell, вход из Настроек.
- Схема БД (`backend/prisma/schema.prisma`): CrmStage (isWon/isLost — терминальная семантика:
  isWon-этап кормит MRR прогноза), Deal (+comments), DevColumn/DevTask (+comments), Txn, RecurringItem,
  BizSettings (singleton: стартовый остаток и его дата).

## Денежная логика (важно!)

- Кассовый метод: Txn — только факты. «Выставленный счёт» — это сделка в CRM, не доход.
- Баланс = openingBalance + net(Txn с openingBalanceDate по сегодня).
- Прогноз месяца = регулярные доходы + MRR (monthlyAmount сделок на isWon-этапах) + будущие разовые
  Txn; расходы аналогично. Runway = баланс ÷ средний чистый расход за 3 ПОЛНЫХ месяца; если данных
  или burn ≤ 0 → runway=null, режим positive.
- Известное упрощение: пока нет истории полных месяцев, runway показывает «positive» — это «нет данных»,
  не «бесконечные деньги». Планируемое улучшение: считать burn из регулярных расходов + среднего расхода.

## Что дальше (естественные доработки)

1. Кнопка «отметить регулярный платёж фактом за месяц» (создаёт Txn из RecurringItem одним тапом).
2. Экспорт месяца в Excel/CSV для бухгалтера.
3. Уведомления о просроченных «следующих действиях» (сейчас — только список на дашборде).
4. Приложения оператора/клиента — ветка `mobile` шаблона не тронута.
5. Сброс пароля: EMAIL_DELIVERY=disabled (нет провайдера) — сменить может только адман через пересоздание;
   при появлении домена включить Postbox/Resend (`docs/EMAIL.md`).

## Локальная разработка

```bash
bun install
docker compose up -d postgres
bun run --cwd backend prisma:generate
bun run --cwd backend prisma:deploy
bun run dev   # backend :3000 (backend/.env из .env.example), webapp :5173
```

Проверки: `bun run typecheck && bun run architecture:check && bun run test:contracts && bun run test:webapp`;
юнит-тесты бэкенда на Windows запускать ПОФАЙЛОВО (параллельный bun test виснет):
`find src scripts -name "*.test.ts" ! -name "*.integration.test.ts" | xargs -n1 bun test`.

## Сетка ПК владельца

api.render.com и console.neon.tech блокированы провайдером — работать через VPN-прокси
127.0.0.1:10809 (v2rayN). GitHub и *.onrender.com доступны напрямую. Эндпоинты Neon-БД доступны напрямую.
