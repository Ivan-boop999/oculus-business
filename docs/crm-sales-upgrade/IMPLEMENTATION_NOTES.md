# IMPLEMENTATION_NOTES — доработка CRM «Окулус Бизнес» для B2B продаж (ТЗ v1.0 от 17.10.2026)

Исполнитель: агент A (основной контекст ZCode). Дата: 2026-10-17.
Матрица требований: [REQUIREMENTS_MATRIX.md](./REQUIREMENTS_MATRIX.md). Независимые проверки: TEST_REPORT.md (агент B), COMPLETION_REVIEW.md (агент C).

## 1. Состав изменений

### База данных (`backend/prisma/schema.prisma`, миграция `20261017120000_crm_sales_upgrade`)

Новые модели: `CompanyEvent`, `Contact`, `ContactChannel`, `DealContactRole`, `DealClaim`, `Activity`, `SalesTask`, `ProposalDraft`, `PilotEvaluation`, `PilotCriterion`, `PilotMilestone`, `DealLaunch`, `IdempotencyRecord`, `AgentOpLog`.

Расширены: `CrmStage` (+`code`, `semanticType`), `Company` (исследование/домен/ИНН/DNC/`version`), `Deal` (квалификация, коммерческие поля, won/подписка, `ownerId`, `version`), `DealHistory` (stageId, event, actor, idempotencyKey, snapshot, `legacy`), `Txn` (+`dealId`, `expectedPaymentId`), `ExpectedPayment` (+`status`, `receivedAmount`), `BizSettings` (+`laborHourRate`), `User` (+`agentPermissions`, роль `agent` в enum).

Миграция сгенерирована инструментом Prisma (`prisma migrate diff --from-config-datasource --to-schema --script`, т.к. `prisma migrate dev` в Prisma 7 требует интерактивного подтверждения на добавление unique-констрейнтов в не-TTY среде). SQL не писался вручную. Миграция применена и проверена на тестовых БД; **на production не применялась** (деплой вне поставки).

### Перенос legacy-данных — `backend/scripts/crm-sales-legacy.ts` (`bun run --cwd backend crm:legacy`)

Идемпотентный перенос ПОСЛЕ применения миграции:
1. Этапам назначается machine-code (транслит названия) и semanticType (won/lost/intake/other) — метаданные, не история.
2. `deal.ownerId` ← `createdById` (текущее состояние).
3. Сделка без компании получает `Company(name=title)` (прежняя семантика заголовка).
4. Строковые контакты сделок → `Contact(isLegacy, status=published)` + каналы `status=published`; оригиналы остаются в полях сделки. Ничего не помечается confirmed.
5. Прежние строки `DealHistory` помечаются `legacy=true` — без stageId и initial-entry; пробелы помечены, не дорисованы.
6. Выигранные сделки → `subStatus='unconfirmed'` (НЕ active): периоды подписки не выдумываются — владельцу нужно подтвердить в карточке сделки (см. §4).
7. `Company.relationStatus` ← вывод из текущего состояния (customer при won-сделке).

### Контракты (`packages/contracts/src/business.ts`, `auth.ts`)

Новые схемы: компании (поиск/фильтры/DNC/события), контакты и каналы, роли в сделке, claims, активности, задачи, «Сегодня», черновики (+условия КП), пилот (+критерии/вехи), запуск, подписка, поступления, отчёт воронки v2, импорт (preview/apply/протокол), журнал агента, `dealDetail`. Роль `agent` в `userRoleSchema`. `bizSettings` + `laborHourRate`. Все существующие схемы расширены аддитивно.

### Бэкенд (`backend/src/modules/business/`)

- `domain/sales-rules.ts` — чистые правила: единый переход (CRM-06, семантика этапов, override), DNC-области, сопоставление импорта (внешний ID → ИНН → домен → имя; домен с конфликтом ИНН не сливается), расчёт воронки по уникальным объектам (CRM-07), блокеры активации пилота, вклад запуска, хэш содержания черновика, сводка nextAction.
- `application/sales-service.ts` — оркестрация: компании/контакты/активности/задачи/переходы/черновики/пилот/запуск/подписка/поступления/отчёт/импорт; права агента (7 capability: finance.confirm, won.confirm, deal.delete, subscription.manage, pricing.change, claim.confirm, draft.approve); идемпотентность actor+operation+key (заголовки `Idempotency-Key`, `X-Run-Id`); контроль конкуренции по `version`/`rowVersion`.
- `infrastructure/sales-repository.ts` — Prisma-реализация порта `sales-ports.ts`, включая транзакции переходов и поступлений, импорт с дозаполнением только пустых полей.
- `transport/sales-routes.ts` — новые маршруты (см. §3).
- Изменённые существующие: сделки идут через SalesService (единый переход, initial_entry при создании); MRR/прогноз считаются из активных подписок, а не won-этапа; «Получено» датит доход фактической датой и сохраняет обязательство.

### Веб-приложение (`webapp/src/features/crm`, `finance`)

- `TodayPage` (/app/today) — экран «Сегодня»: просрочка, задачи, встречи, ответы к разбору, сделки без шага.
- `CompaniesPage` + `CompanySheet` — поиск/фильтры, создание без сделки, карточка (профиль, контакты с каналами, активности, задачи, сделки, журнал решений), запрет/снятие запрета с основанием, импорт pipeline.json (вставка JSON → предпросмотр → выбор действий → протокол).
- `DealSheet` + `DealSheetTabs` (+`DealPilotLaunchTabs`) — табы: Основное/Квалификация (поля + статусы утверждений)/Контакты/Активность (фиксация взаимодействий и задач)/Черновики (версии, одобрение, ручная фиксация отправки)/Пилот (карточка, критерии, вехи, решение)/Запуск (владелец, контроль, риск, расширение отдельной сделкой)/Деньги (договорная стоимость, поступления, подписка, вклад).
- `DraftsPage` (/app/drafts) — очередь черновиков.
- `CrmReportPage` — блок «Продвижение и когорты»: уникальные возможности, любые выходы vs успешное продвижение vs отказы, пауза/открытые, доставка подтверждена/нет, legacy-исключения, фильтры период/когорта/сегмент.
- `FinancePage` + `SubscriptionsPanel` — состояние подписок и обязательств; ставка часа в настройках.
- Навигация: «Сегодня» и «Черновики» в меню; на телефоне «Сегодня» заменяет «Обзор» в нижней навигации (Обзор доступен в боковом меню ПК).

## 2. Запуск и проверка

```bash
docker compose --env-file backend/.env up -d postgres      # локальная БД (порт 54329)
bun run --cwd backend prisma:deploy                        # применить миграции
bun run --cwd backend crm:legacy                           # перенос legacy-данных (идемпотентно)
bun run dev                                                # backend + webapp
bun run typecheck && bun run architecture:check
bun run test:contracts && bun run test:backend:unit
bun run --cwd backend test:integration                     # тестовая PostgreSQL (docker)
bun run test:webapp
```

Нюанс Windows: точечный запуск интеграционного файла по прямому пути не срабатывает (Bun Glob возвращает пути с `\`), запускается весь набор; также `scripts/test-integration.mjs` конфликтует по порту с уже запущенным `postgres_test` — либо остановите его, либо `TEST_SKIP_DOCKER=1 TEST_DATABASE_URL=…`.

## 3. API (новые маршруты; все под Bearer-авторизацией)

CRM (`/api/crm`): `GET /users` · `GET|POST /companies`, `GET|PATCH /companies/{id}`, `POST /companies/{id}/dnc[/lift]`, `GET /companies/{id}/events` · `GET|POST /contacts`, `PATCH /contacts/{id}`, `POST /contacts/{id}/dnc[/lift]`, `POST /contacts/{id}/channels`, `PATCH /channels/{id}` · `GET /deals/{id}` (детали), `GET|PUT /deals/{id}/claims`, `GET|PUT|DELETE /deals/{id}/contact-roles[...]` · `GET|POST /activities`, `POST /activities/{id}/processed` · `GET|POST /tasks`, `PATCH /tasks/{id}` · `GET /today` · `GET|POST /drafts`, `GET|PATCH /drafts/{id}`, `POST /drafts/{id}/{review|approve|send|cancel}`, `GET /drafts/{id}/versions` · `GET|PUT /deals/{id}/pilot`, `POST /deals/{id}/pilot/{activate|decision}`, `POST /deals/{id}/pilot/criteria`, `PATCH /pilot-criteria/{id}`, `POST /pilot-criteria/{id}/agree`, `POST /deals/{id}/pilot/milestones`, `PATCH /pilot-milestones/{id}` · `GET|PUT /deals/{id}/launch`, `POST /deals/{id}/extension` · `GET /report/funnel` · `POST /import/preview`, `POST /import/apply` · `GET /agent-ops`.

Финансы (`/api/finance`): `POST /deals/{id}/subscription` · `POST /expected/{id}/receipts`. Легаси `POST /expected/{id}/received` сохранён и теперь закрывает остаток фактической датой (сегодня), не удаляя обязательство.

Агентский доступ: роль `agent` (выдаётся администратором через users API); права — `User.agentPermissions` (JSON-массив строк, см. `sales-service.ts`). Идемпотентность: заголовок `Idempotency-Key`; журнал: `X-Run-Id` → `agent_op_logs` → `GET /api/crm/agent-ops`.

## 4. Границы достоверной старой истории и ручные шаги после миграции

- `DealHistory` до доработки: `legacy=true`, без stageId; отчёт воронки v2 их исключает и показывает количество исключённых.
- Выигранные ранее сделки: подписка `unconfirmed` — MRR после миграции покажет 0, пока владелец не активирует подписки с реальными периодами (это осознанное требование ТЗ §8.4: периоды не выдумываются). Список таких сделок виден в `SubscriptionsPanel` («требуют подтверждения»).
- Старые `Txn` не связаны со сделками структурно (связи не выдуманы); новые поступления связываются автоматически.
- Legacy-контакты помечены `isLegacy`, оригиналы строк хранятся в полях сделки.

## 5. Известные ограничения

- Отправка писем не подключена (вне поставки): `POST /drafts/{id}/send` — ручная фиксация факта отправки человеком; точка интеграции с будущим провайдером — `SalesService.sendDraft`.
- Автоматизации P2 из старого backlog нет (исключена ТЗ).
- `bun run lint` падает по всему веб-приложению на правиле `typographyPolicy/use-typography-component` (≥132 ошибки на нетронутых файлах, всего ~1400) — базовый дрейф шаблона, не связан с этой задачей; линт не входит в зафиксированный объём проверек CHECKLIST.md.
- `backend/src/storage/config.test.ts` падает на Windows (ожидает корень пути `/…`) — базовый дефект окружения, не связан с задачей.
- Импорт принимает формат pipeline.json (version/accounts); другие форматы — через тот же JSON-контракт.

## 6. Production deployment

Не выполнялся (исключено ТЗ). Для выката: push → Render autoDeploy; затем `bun run --cwd backend prisma:deploy` и `bun run --cwd backend crm:legacy` против Neon (DATABASE_URL прод), либо через Render shell.
