# TEST_REPORT — независимое тестирование (агент B)

- **Агент**: B (независимый тестировщик, отдельный контекст от исполнителя A)
- **Дата**: 2026-10-17
- **Диапазон времени**: цикл 1 — 15:43–16:20; цикл 2 — 16:24–16:28; цикл 3 — 17:10–17:19; цикл 4 — 17:21–17:24; цикл 5 (фикс R1, финальный) — 17:44–17:47 (МСК, по логам команд)
- **Объект**: рабочая дерево `master` репозитория `oculus-business` (незакоммиченные изменения исполнителя A; HEAD `00769d4`), тестовая БД `oculus_business_test` (Docker, порт 54330)
- **Метод**: самостоятельный выбор проверок по ТЗ v1.0 от 17.10.2026; запуск существующих suite'ов; критический анализ покрытия `sales.integration.test.ts`; добавление собственного интеграционного файла `backend/src/modules/business/sales-extra.integration.test.ts` (17 тестов); прямые проверки БД через `docker exec psql`; независимый запуск CLI-миграции. Утверждения исполнителя (REQUIREMENTS_MATRIX/IMPLEMENTATION_NOTES) читались как заявление, не как факт.
- **Ограничение по заданию**: браузерные проверки UI не выполнялись (их делают A/C отдельно); фокус — API, БД, права, миграции, негативные сценарии.

## 1. Таблица прогонов

| # | Команда | Дата/время | Exit code | Результат |
|---|---------|------------|-----------|-----------|
| 1 | `bun run architecture:check` | 17.10 15:44 | 0 | pass (556 файлов) |
| 2 | `bun run test:contracts` | 17.10 15:45 | 0 | pass — 25 тестов, 0 fail |
| 3 | `bun run --cwd backend prisma:validate` | 17.10 15:45 | 0 | pass — схема валидна |
| 4 | `bun run typecheck` (все workspaces) | 17.10 15:45:05–15:45:35 | 0 | pass |
| 5 | `bun run test:backend:unit` | 17.10 15:45 | 1 | **322 pass / 1 fail** — единственный фэйл `backend/src/storage/config.test.ts` «produces a filesystem configuration by default…» (baseline-дефект Windows: путь не начинается с `/`; не связан с задачей) |
| 6 | `bun run test:webapp` | 17.10 15:44:59 | 0 | pass — 71 тест, 0 fail |
| 7 | `bun test src/modules/business/sales.integration.test.ts` (TEST_DATABASE_URL → 54330) | 17.10 15:44:21 | 0 | pass — **13 тестов / 0 fail** (suite исполнителя воспроизведён независимо) |
| 8 | `bun test src/modules/business/sales-extra.integration.test.ts` (новый файл агента B) | 17.10 15:51:54 (финальный прогон) | 1 | **14 pass / 3 fail** — все 3 фэйла документируют дефекты (см. §3: DEFECT-B1 ×2 теста, DEFECT-B2 ×1); первые прогоны 15:49/15:51 — итеративная отладка самого тест-файла (3 моих ошибки: отсутствие этапов, порядок approve, дубликат переменной), к результатам не относятся |
| 9 | `bun test sales.integration.test.ts sales-extra.integration.test.ts` (оба вместе) | 17.10 15:53:14 | 1 | 27 pass / 3 fail (те же 3 дефектных) — файлы не конфликтуют |
| 10 | `bun run --cwd backend typecheck` (с новым тест-файлом B) | 17.10 15:53 | 0 | pass |
| 11 | `bun test src/db.integration.test.ts` (прямой) | 17.10 15:54 | 0 | 6 pass / 0 fail |
| 12 | `bun test src/modules/auth/auth.integration.test.ts` (прямой) | 17.10 15:55 | 0 | 16 pass / 0 fail (первый прогон 15:54 падал из-за остатка моего сида миграции — RESTRICT FK; после очистки pass; не регрессия продукта) |
| 13 | `bun test src/modules/uploads/uploads.integration.test.ts` (прямой) | 17.10 15:55 | 0 | 14 pass / 0 fail (аналогично п.12) |
| 14 | `bun test src/outbox/outbox.integration.test.ts` (прямой) | 17.10 15:54 | 0 | 9 pass / 0 fail |
| 15 | `bun test src/rate-limit/rate-limit.integration.test.ts` (прямой) | 17.10 15:54 | 0 | 5 pass / 0 fail |
| 16 | `bun test src/modules/users/users.integration.test.ts` (прямой, `--timeout=30000/60000`, 3 попытки суммарно >20 мин) | 17.10 15:54–16:18 | — | **NOT RUN (зависание)** — suite не завершается на этой машине при прямом запуске (advisory-lock гейты); см. §5 |
| 17 | `bun run lint` | 17.10 15:56 | 1 | **1437 ошибок** `typographyPolicy/use-typography-component` по всему webapp — подтверждённый baseline-дефект шаблона (не связан с задачей) |
| 18 | `bun scripts/crm-sales-legacy.ts` (CLI, DATABASE_URL → тестовая БД с legacy-данными, посеянными через psql) | 17.10 15:52:55 | 0 | Все счётчики = 1 (см. §2, «Миграция») |
| 19 | повтор №2 того же CLI | 17.10 15:53 | 0 | `alreadyApplied: true`, все счётчики 0 — идемпотентность подтверждена |
| 20 | `bun scripts/test-integration.mjs` (полный раннер) | — | — | **NOT RUN (BLOCKED)** — известное зависание раннера на этой машине на `deploy-database.integration.test.ts` (prisma CLI shelling); обход — прямые запуски п.7–15 |

## 2. Проверенные сценарии (с привязкой к ID)

### Suite исполнителя (прогнан мной независимо — 13/13 pass)
E2E-01 (компания без сделки, контакты, задача, персистентность, MRR/pipeline=0, 20+1 компаний), E2E-02 (импорт preview/apply/re-apply, дубли, протокол), E2E-03 (call_attempt ≠ conversation; гипотеза не становится болью; блок qualified), E2E-04/05 (законный путь через PATCH/move; PATCH stageId lost без причины → 400; initial_entry; повтор move — одно событие), E2E-06 (переименование стадии; возврат и повторное продвижение; отчёт), E2E-12 (4 отказа+1 продвижение = 100/20/80; openOpportunities), E2E-07/10 (версии черновика; идемпотентность задач; конфликт версии заметки), E2E-08 (DNC: задача/отправка блокируются; импорт не снимает; входящий помечает needsReview; dnc_set/lift в журнале), E2E-09 (агенту отказано в delete/claim/won/receipt; человеку можно; agent-ops с ошибками), E2E-13/14 (частичная оплата фактической датой 17.10 вместо dueDate 10.10; повтор не удваивает; обязательство не удаляется; MRR только после активации; конец периода гасит MRR), E2E-11 (пилот: блокеры активации; критерий версионируется; решение явное), E2E-15 (запуск: владелец/контроль/риск/вклад 40 000; расширение отдельной сделкой), E2E-16 (функция миграции: пометки legacy, unconfirmed, published).

### Мои дополнительные проверки (`sales-extra.integration.test.ts`, 14 pass / 3 fail)
| ID | Что проверено | Результат |
|----|---------------|-----------|
| CRM-06-AC01 | PATCH stageId в qualified/proposal/won без условий → 400 у каждого; сделка осталась в intake; ни одного события | PASS |
| CRM-06/8.2 | move с `Idempotency-Key`: та же нагрузка → тот же результат, одно событие; другая нагрузка с тем же ключом → 409 | PASS |
| CRM-06 (§6 override, человеком) | move в qualified с `overrideReason` без claims → ожидание 200 + аудит в истории | **FAIL → DEFECT-B1** |
| CRM-06/8.6 (override агентом) | агентский move с `overrideReason` → ожидание 409 | **FAIL (400) → DEFECT-B1 + латентная дыра** |
| CRM-06/8.2 | устаревший `expectedVersion` на move → 409, свежая заметка и стадия не тронуты | PASS |
| CRM-08-AC03 (расширение) | агент: PATCH цены при approved-КП → 409; approve/send черновика → 409; subscription → 409; канал `confirmed` → 409; delete → 409 | PASS |
| CRM-08 (выдача прав) | `agentPermissions`: claim.confirm снимает отказ; won.confirm открывает won; finance.confirm открывает поступление; право не шире выданного (won без права — отказ) | PASS |
| CRM-08 (pricing.change) | выдача права открывает правку цены при approved-КП (20 000) | PASS |
| CRM-10 | send без approve → 409; review→правка сбрасывает до draft; повторный send → 409; cancel sent → 409 | PASS |
| CRM-11/8.4 | поступление больше остатка → 409 (и с `allowOverpayment: true`); остаток не отрицателен; состояние и транзакции не изменились | PASS (но см. DEFECT-B3 — флаг мёртвый) |
| CRM-11 | легаси `POST /expected/{id}/received`: догашивает остаток, обязательство сохранено | PASS |
| CRM-11-AC02 | активация подписки без won → 400; с overrideReason → 200; won-этап сам MRR не включает (7 000, не 16 000) | PASS |
| 8.1 | ручное значение (region) **не затирается** повторным импортом update — ассертировано фактическое значение (у исполнителя ассерта значения не было) | PASS |
| CRM-01-AC03 | две компании с одним доменом и разными ИНН: импорт не сливает и не создаёт третью; ИНН на месте | PASS |
| 8.1 | невалидная запись (пустое имя): preview → invalid+skip; apply с явным `create` | **FAIL → DEFECT-B2** |
| Негативные | без токена 401; кривые payload'ы 400 (компания без имени, сумма строкой, кривая дата задачи, пустой DNC-reason); несуществующие ID 404 (company/deal/tasks/drafts/receipts/move-stage); активность со сделкой чужой компании 400 | PASS |
| CRM-06-AC06/8.8 (расширение E2E-16) | миграция: сделка без компании получает компанию из заголовка; новый формат истории (initial_entry со stageId) не помечается legacy; канал legacy published; третий прогон `alreadyApplied=true` | PASS |

### Миграция (независимо от теста исполнителя)
- Применённые миграции тестовой БД включают `20261017120000_crm_sales_upgrade` (проверено `_prisma_migrations`).
- Legacy-данные посеяны напрямую через psql (user, won-стадия с `code=''`, сделка со строковым контактом без компании, старая история, комментарий), затем запущен **CLI** `bun scripts/crm-sales-legacy.ts` (exit 0). Факты в БД после: этапу назначен `code=vyigrana-staraya`, `semantic_type=won`; у сделки `owner_id` проставлен, `sub_status='unconfirmed'` (НЕ active — периоды не выдуманы), `monthly_amount=30000` и `contact_name` сохранены; компания создана из заголовка, `relation_status='customer'`; legacy-контакт `is_legacy=t, status=published` со ссылкой на сделку; канал `status=published` (не confirmed); строка истории `legacy=t`, `to_stage_id=NULL` (не дорисовано); комментарий сохранён. Повторный запуск — `alreadyApplied: true`, нулевые счётчики, exit 0.

## 3. Найденные дефекты

### DEFECT-B1 — Override перехода стадий не работал вообще (major) — **FIXED-VERIFIED (цикл 2, 17.10 16:26)**
- **ID требований**: CRM-06 (§6 ТЗ «Override допускается с причиной и аудитом»), GEN-6, частично 8.2.
- **Шаг воспроизведения**: (тест `CRM-06: human override with reason passes and is audited in history`) создать сделку в intake; `POST /api/crm/deals/{id}/move` с `stageId=<qualified>`, `overrideReason: "…"` при отсутствии подтверждённых claims.
- **Ожидание**: 200, переход выполнен, в истории `overrideReason` зафиксирован. **Факт**: 400 «Переход отклонён: Подтверждённый пример задачи обязателен…».
- **Корень** (найден чтением кода, не правился): `backend/src/modules/business/application/sales-service.ts`, метод `transition()` — объект-аргумент `evaluateTransition({ deal, fromStage, toStage, reason, lostReasonInRequest, claims, hasProcessOwnerRole, hasApprovedOrSentDraft, actorIsAgent })` **не содержит `overrideReason`**; доменная функция `evaluateTransition` готова его учитывать (`overridden()` в `backend/src/modules/business/domain/sales-rules.ts`), но значение до неё не доходит. Поле живёт только в контракте и в записи истории.
- **Сопутствующая латентная дыра**: вход `actorIsAgent` в `evaluateTransition` объявлен и передаётся, но в теле функции ни разу не используется. Если DEFECT-B1 починить без агентского гейта, агент сможет `overrideReason` обходить обязательные условия (запрет «факт клиента по одному выводу модели», §8.6). Мой тест агента ожидает 409 — сейчас он падает с 400 тем же DEFECT-B1.
- **Серьёзность**: major — предусмотренная ТЗ функция не работает ни для одного пользователя; безопасность переходов при этом не нарушена (права агента на delete/won/receipts/subscription/pricing подтверждены отдельными тестами).
- **Исправление (агент A, проверено B по коду и прогоном)**: `SalesService.transition()` теперь передаёт `overrideReason` в `evaluateTransition` (строка 524) и содержит серверный гейт: агент с непустым `overrideReason` получает 409 «Агент не может обходить обязательные условия перехода» с записью в `agent_op_logs` (строки 512–517). Оба моих теста (человек 200 + аудит `overrideReason` в истории; агент 409) проходят; 409 у агентского override мог прийти только от нового гейта (нарушения правил дают 400). Примечание: гейт не срабатывает на move в тот же этап (same-stage branch) — там правила не проверяются и обходить нечего, риск отсутствует.

### DEFECT-B2 — import/apply проводил невалидную запись при явном `create` (minor) — **FIXED-VERIFIED (цикл 2, 17.10 16:26)**
- **ID требований**: §8.1 («невалидные записи» в preview; протокол), CRM-01.
- **Шаг воспроизведения**: (тест `8.1 extra: invalid account…`) `POST /api/crm/import/preview` с аккаунтом `company_name: "   "` → `summary.invalid=1, suggestedAction=skip`; затем `POST /api/crm/import/apply` с решением `{action: 'create'}` по этому externalId.
- **Ожидание**: apply отклоняет невалидную запись сервером (пустое имя нарушает `createCompanyRequestSchema` min(1) для обычного API). **Факт**: компания с именем из пробелов создаётся (в списке 1 компания вместо 0).
- **Корень**: `applyImport` (`backend/src/modules/business/infrastructure/sales-repository.ts`, ветка `decision.action === 'create'`) не перепроверяет валидность, хотя preview её вычисляет.
- **Серьёзность**: minor — требует явного сознательного выбора action, данные не портит, но создаёт мусор и обходит серверную валидацию.
- **Исправление (агент A, проверено B по коду и прогоном)**: `applyImport` до ветки create/update отклоняет запись с пустым `company_name` — `errors` + `protocol: action 'rejected', detail «Невалидная запись отклонена сервером»`, компания не создаётся. Мой тест (0 компаний после apply) проходит.

### DEFECT-B3 — Флаг `allowOverpayment` был объявлен в контракте, но не реализован (minor) — **FIXED-VERIFIED (цикл 2, 17.10 16:26)**
- **ID требований**: §8.4 («остаток не бывает отрицательным без отдельной явной операции переплаты»), CRM-11.
- **Факт (цикл 1)**: `paymentReceiptRequestSchema.allowOverpayment` (документация: «остаток остаётся 0, избыток фиксируется в комментарии») принимался маршрутом, но `SalesService.confirmReceipt` не передавал его в `applyReceipt`, а тот безусловно отклонял превышение остатка (409). Сам инвариант ТЗ (остаток ≥ 0) **соблюдался** — проверено тестом; дефект в расхождении контракта с реализацией (мёртвый флаг).
- **Серьёзность**: minor.
- **Исправление (агент A, проверено B по коду и прогоном)**: `allowOverpayment` доведён до `applyReceipt` (порт + репозиторий); с флагом поступление проводится, `receivedAmount` хранит фактическую сумму (например 110 000 при обязательстве 100 000), `remainingAmount` зажат в 0 через clamp, статус `received`, переплата фиксируется реальной транзакцией дохода.
- **Позиция B по трактовке §8.4**: **согласен**. ТЗ: «остаток не бывает отрицательным **без отдельной явной операции переплаты**» — то есть такая операция предусмотрена; `allowOverpayment: true` в явном запросе и есть эта операция: без флага — 409 (проверено), с флагом — остаток 0 (не отрицательный), факт денег не искажён (receivedAmount = фактическая сумма поступлений). Тест B обновлён A строго в согласии с этой семантикой (правка просмотрена B: изменён только блок переплаты, остальные 16 тестов не тронуты — проверено сверкой ожиданий).

### Наблюдение (не дефект, фиксация слабости теста исполнителя)
- В `sales.integration.test.ts` (E2E-02) после повторного импорта с `update` значение `region` **не ассертировалось** (проверялся только непустой протокол). Поведение продукта корректно (моим тестом подтверждено: дозаполняются только пустые поля), но критерий «ручное значение не затирается» suite'ом исполнителя фактически не проверялся.

### DEFECT-B4 — Словарь фильтра `channel` отчёта воронки не совпадал со словарём данных (major; найден в цикле 3, **FIXED-VERIFIED в цикле 4, 17.10 17:23**)
- **ID требований**: §8.3 («канал … должны существовать в данных, а не быть неработающими фильтрами интерфейса»), CRM-07, GEN-8.3, фикс D5.
- **Шаг воспроизведения**: (тест `D5: funnel report filters channel and offerVersion from actual data`) создать сделку с активностью `channel: 'call'`; `GET /api/crm/report/funnel?channel=call`.
- **Ожидание**: 200, opportunities отфильтрованы по звонковым сделкам. **Факт**: 400 — `crmFunnelReportQuerySchema.channel` использует `channelKindSchema` (`email/phone/telegram/other`, словарь контактных каналов), а `channelsByDeal` строится из `Activity.channel` (`activityChannelSchema`: `call/email/telegram/meeting/other`).
- **Последствия**: `call` и `meeting` (основные каналы продаж) невозможно отфильтровать (400); `phone` принимается, но **молча** возвращает пустой отчёт — взаимодействий с `channel='phone'` не существует. `email`/`telegram`/`other` работают; `offerVersion` работает корректно (проверено).
- **Корень**: `packages/contracts/src/business.ts` — `crmFunnelReportQuerySchema` (`channel: channelKindSchema`) против `activityChannelSchema` данных; фикс — использовать словарь активностей (или явно маппить phone→call).
- **Серьёзность**: major — молча пустой отчёт по `phone` выдаёт неверную картину за правильную; ТЗ §8.3 прямо запрещает такой фильтр.
- **Исправление (агент A, проверено B по коду и прогоном)**: `crmFunnelReportQuerySchema.channel` переведён на `activityChannelSchema` (call/email/telegram/meeting/other) — словарь фильтра совпадает со словарём `Activity.channel`. Мой D5-тест позеленел без правок (`channel=call` → 200, opportunities=1).

### Baseline-дефекты (не регрессия данной задачи; зафиксированы как baseline)
1. `backend/src/storage/config.test.ts` — падает на Windows (путь без ведущего `/`); единственный фэйл `test:backend:unit` (322/1).
2. `bun run lint` — 1437 ошибок `typographyPolicy` по webapp, включая нетронутые файлы.
3. `bun scripts/test-integration.mjs` — зависание на этой машине на `deploy-database.integration.test.ts`; `users.integration.test.ts` также не завершается при прямом запуске (advisory-lock гейты) — обе проблемы окружения, не продукта (auth/uploads/db/outbox/rate-limit прямым запуском проходят).

## 4. Проверено частично / уточнения

- **CRM-08-AC03 (изменение цены)**: гейт `pricing.change` срабатывает только при наличии по сделке черновика в статусе `approved`/`sent` — соответствует букве ТЗ («изменение **утверждённой** цены»). Изменение цены агентом при неотправленном/неодобренном КП разрешено — расцениваю как корректное (агент «предлагает изменения»).
- **Идемпотентность `transition` при отсутствии заголовка**: повторный move в тот же этап не создаёт второго события и без ключа (проверено suite'ом A) — соответствует 8.2.
- **Обход прав через `updateDeal` без `stageId`**: PATCH не принимает `overrideReason` (всегда null) — override возможен только через явный move; единственная работоспособная схема правил.

## 5. НЕпроверенные условия (NOT RUN / BLOCKED)

| Что | Причина |
|-----|--------|
| Браузерные/UI-проверки всех экранов (GEN-4.6, 4.7, 5.1–5.6, CRM-07-AC05 «n и знаменатель, предупреждение малых групп», части E2E-03) | Вне мандата агента B (по заданию: браузер проверяют A/C отдельно) |
| CRM-07-AC04 (доставка подтверждена/неподтверждена — отдельные показатели) | Автоматизированной интеграционной проверки нет ни у A, ни у B; в коде признак есть (`proposal_drafts.status`), но API-проверку не писал — времени на расширение не хватило; кандидата на проверку агентом C |
| `users.integration.test.ts` (14 тестов) | Зависает при прямом запуске на этой машине (3 попытки, >20 мин, гейты advisory-локов); официальный раннер тоже зависает раньше (deploy-database). Модуль users в git status не изменён задачей |
| `bun scripts/test-integration.mjs` полный прогон | Известное зависание раннера на этой машине (обход — прямые запуски, выполнено для 7 файлов из 9) |
| `deploy-database.integration.test.ts` | То же зависание (prisma CLI shelling на Windows) |
| `bun run build:backend`, `bun run build:webapp`, `bun run e2e:webapp` | Не входят в минимальный список проверок агента B; не запускались |
| Миграция на production | Исключена ТЗ (деплой вне поставки); на тестовой БД проверена полностью |
| `bun run audit`, `template:check` | Вне списка обязательных команд задания |

## 6. Вердикт по матрице (независимая проверка B)

### Цикл 1 (15:43–16:20)

- **Функциональные критерии (CRM-01…CRM-12, 56 AC): PASS 54, FAIL 0, NOT RUN 2** (CRM-07-AC04, CRM-07-AC05 — см. §5).
- **Сквозные E2E-01…E2E-16 (интеграционный уровень): PASS 16/16.**
- **Общие требования**: GEN-6 (override) — **FAIL** (DEFECT-B1); GEN-8.1 — **FAIL частично** (DEFECT-B2); GEN-8.4 — дефект B3 при соблюдённом инварианте.
- **Дефекты к устранению до приёмки**: DEFECT-B1 (major), DEFECT-B2 (minor), DEFECT-B3 (minor).

### Цикл 2 — повторная проверка после исправлений (16:24–16:28)

- **DEFECT-B1 / B2 / B3 → FIXED-VERIFIED** (по коду и прогонам, см. §3). Открытых дефектов у B нет.
- **Функциональные критерии (56 AC): PASS 54 / FAIL 0 / NOT RUN 2** (CRM-07-AC04 — нет автоматизированной проверки доставки; CRM-07-AC05 — UI; обе переданы агенту C).
- **E2E-01…16 (интеграционный уровень): PASS 16/16.**
- **Общие требования**: GEN-6 — **PASS**; GEN-8.1 — **PASS**; GEN-8.4 — **PASS** (семантика переплаты §8.4 одобрена B); GEN-8.2/8.6/8.8, GEN-4.1/4.2 — PASS; UI-зависимые GEN-4.6/4.7/5.x и части 8.7 — NOT RUN (агент C).
- **Вывод (цикл 2)**: проверяемая агентом B часть ТЗ (API, права, идемпотентность, деньги, импорт, миграция, негативные сценарии) работает; блокирующих дефектов нет. Для полной приёмки остаются: UI-приёмка агентом C (GEN-4.6/4.7/5.1–5.6, CRM-07-AC05), проверка CRM-07-AC04 и полноты по всем пунктам (COMPLETION_REVIEW), а также не зависящие от продукта зависания раннера/users-теста на этой машине (см. §5).

### Цикл 3 — перепроверка после фиксов D1–D9 (17:10–17:19)

- **D2 / D6 / D7 / D8 → VERIFIED** (код + тесты A + мои extra-тесты; см. §6c).
- **D5 → PARTIAL**: `offerVersion` и `channel` для email/telegram/other работают; найден **DEFECT-B4 (major)** — словарь фильтра `channel` (контактные каналы) не совпадает со словарём данных (каналы активностей): `call`/`meeting` → 400, `phone` молча пусто. Требует исправления и повторной проверки.
- Открытые дефекты у B: **DEFECT-B4 (major)**. DEFECT-B1/B2/B3 остаются FIXED-VERIFIED (регрессии нет — все их тесты зелёные в цикле 3).
- **Функциональные критерии (56 AC): PASS 54 / FAIL 0 / NOT RUN 2** (без изменений: CRM-07-AC04, AC05).
- **E2E-01…16: PASS 16/16** (E2E-08 усилен D2-проверками A).
- **Общие требования**: GEN-8.3 — **FAIL** (DEFECT-B4; было PARTIAL); GEN-6/GEN-8.1/GEN-8.4 — PASS (цикл 2, регрессии нет).
- **Вывод (цикл 3)**: проверяемая B часть ТЗ работает, кроме фильтра `channel` отчёта воронки (DEFECT-B4). До полной приёмки: исправить DEFECT-B4, UI-приёмка и CRM-07-AC04/AC05 (агент C).

## 6a. Повторная проверка после исправлений (цикл 2) — команды и exit codes

| Команда | Дата/время | Exit code | Результат |
|---|---|---|---|
| `bun test sales.integration.test.ts sales-extra.integration.test.ts` (TEST_DATABASE_URL → 54330) | 17.10 16:26:35 | 0 | **30 pass / 0 fail** (13 suite A + 17 тестов B; все 3 дефектных теста позеленели) |
| `bun run architecture:check` | 17.10 16:27 | 0 | pass (557 файлов) |
| `bun run test:contracts` | 17.10 16:27 | 0 | 25 pass / 0 fail |
| `bun run test:backend:unit` | 17.10 16:27 | 1 | 322 pass / 1 fail — единственный фэйл baseline `storage/config.test.ts` (без изменений) |
| `bun run test:webapp` | 17.10 16:27 | 0 | 71 pass / 0 fail |
| `bun run typecheck` | 17.10 16:27:26 | 0 | pass |

Проверка правок product-кода по существу (чтением, до прогонов): `transition()` передаёт `overrideReason` в `evaluateTransition` и гейтит агента (409 + agent_op_logs); `applyImport` отклоняет невалидную запись до create; `applyReceipt` принимает `allowOverpayment` и клампит остаток в 0. Правка моего теста агентом A коснулась только блока переплаты (B3) — сверена, остальные ожидания не тронуты.

## 6c. Перепроверка после исправлений D1–D9 из COMPLETION_REVIEW (цикл 3, 17.10 17:10–17:19)

Заявленные A исправления проверены по коду (до прогонов) и прогонами; в моём extra-файле добавлены 3 теста цикла 3 (D6-сценарий «разные ИНН без флага» + «существующая без ИНН → 409», D8-успех атомарности + stale-версия, D5-фильтры).

| Команда | Дата/время | Exit code | Результат |
|---|---|---|---|
| `bun test sales.integration.test.ts sales-extra.integration.test.ts` (TEST_DATABASE_URL → 54330) | 17.10 17:17:09 | 1 | **36 pass / 1 fail** (37 тестов: 21 suite A c новыми D-тестами + 20 B). Единственный фэйл — документация DEFECT-B4 (`channel=call` → 400) |
| `bun run architecture:check` | 17.10 17:17 | 0 | pass (557 файлов) |
| `bun run test:contracts` | 17.10 17:17 | 0 | 25 pass / 0 fail |
| `bun run test:webapp` | 17.10 17:17 | 0 | 71 pass / 0 fail |
| `bun run test:backend:unit` | 17.10 17:18 | 1 | 322 pass / 1 fail — baseline `storage/config.test.ts` (без изменений) |
| `bun run typecheck` | 17.10 17:18 | 0 | pass |

Статусы D-фиксов со стороны B:

| Фикс | Вердикт B | Чем подтверждён |
|---|---|---|
| D2 (DNC контакта блокирует создание черновика и отправку, поиск контакта по адресу получателя) | **VERIFIED** | код (`createDraft`/`sendDraft` → `assertCommercialTouchAllowed` c контактом + `findChannelInCompany`); тест A (создание с contactId → 409; отправка по адресу запрещённого без contactId → 409); обновлённый A тест E2E-08 (DNC компании → создание 409) прошёл в моём прогоне |
| D6 (дубль домена → 409 + `allowDomainDuplicate`; разные проверенные ИНН проходят) | **VERIFIED** | код (`createCompany`: differentLegalEntities только при разных непустых ИНН с обеих сторон); тесты A + мой extra: разные ИНН без флага → 201 ×2; существующая без ИНН + новый домен-матч → 409 |
| D7 (agent-сделки пишут initial_entry с actorKind 'agent') | **VERIFIED** | код (`createDeal` → `actorKind: this.actorKind(actor)`); тест A прошёл |
| D8 (PATCH со stageId атомарен: поля+переход+история одной транзакцией) | **VERIFIED** | код (`updateDeal` передаёт fieldPatch в `transition` → `dealSideEffects` внутри `transitionDealTx` `db.$transaction`); тест A (отклонённый переход — поля не сохранены) + мой extra (успешный PATCH: note+stage за одну транзакцию, version +1, одно событие; stale expectedVersion → 409 без сохранения) |
| D5 (фильтры channel/offerVersion) | **PARTIAL → DEFECT-B4** | `offerVersion` работает (1/0 по данным); `channel` работает только для email/telegram/other; `call`/`meeting` → 400, `phone` молча пусто — словарь фильтра не равен словарю данных (см. §3 DEFECT-B4) |

Примечание: расхождение с заявлением A «34 pass / 0 fail» объяснимо — A гонял до добавления моих 3 тестов цикла 3; из 34 исходных все проходят и у меня, фэйл даёт только новый D5-тест, фиксирующий DEFECT-B4.

## 6d. Цикл 4 — фикс DEFECT-B4 (17.10 17:23)

Код проверен до прогона: `crmFunnelReportQuerySchema.channel` → `activityChannelSchema` (словарь совпадает с `Activity.channel`).

| Команда | Дата/время | Exit code | Результат |
|---|---|---|---|
| `bun test sales.integration.test.ts sales-extra.integration.test.ts` (TEST_DATABASE_URL → 54330) | 17.10 17:23:24 | 0 | **37 pass / 0 fail** — D5-тест B позеленел без правок (`channel=call` → 200, фильтрует) |
| `bun run test:contracts` | 17.10 17:23 | 0 | 25 pass / 0 fail (контракт менялся — проверен) |

**DEFECT-B4 → FIXED-VERIFIED.** Открытых дефектов у B нет (B1–B4 все FIXED-VERIFIED, регрессий в финальных прогонах нет). Итоговый вердикт B: функциональные AC — PASS 54 / FAIL 0 / NOT RUN 2 (CRM-07-AC04/AC05 — агент C); E2E-01…16 — 16/16; GEN-8.3 — PASS. Проверяемая агентом B часть ТЗ выполнена; финальная сверка полноты — за агентом C.

## 6e. Цикл 5 — фикс R1 из остатка агента C (17.10 17:46)

R1: в `webapp/src/features/crm/sales-api.ts` `saveDealClaim`/`saveDealContactRole` парсили ответ схемами **запроса**; в `DealSheetTabs` артефакт `String.fromCharCode` в disabled-кнопках «Назначить».

- Код проверен до прогона: ответ парсируется `claimResponseSchema`/`dealContactRoleSchema` (совпадают с фактической формой PUT-ответов сервера — тело без обёртки, что подтверждено интеграционными тестами B), тело запроса валидируется `saveDealClaimRequestSchema`/`saveDealContactRoleRequestSchema`; `fromCharCode` в crm-фичах отсутствует.
- Браузерный smoke (назначение роли → assigned, смена статуса утверждения, отсутствие «Unrecognized keys») выполнен агентом A; B браузер не поднимал (вне мандата, см. §5) и подтверждает R1 уровнем код-ревью + тестов.

| Команда | Дата/время | Exit code | Результат |
|---|---|---|---|
| `bun run test:webapp` | 17.10 17:46:25 | 0 | 71 pass / 0 fail |
| `bun run typecheck` | 17.10 17:46 | 0 | pass |

**R1 → FIXED-VERIFIED.** Работа агента B завершена: B1–B4 и R1 закрыты, открытых дефектов нет.

## 7. Артефакты

- Тест-файл: `backend/src/modules/business/sales-extra.integration.test.ts` (20 тестов: 17 циклов 1–2 + 3 теста цикла 3 — D6-сценарии, D8-атомарность, D5-фильтры; цикл 4 — все 20 pass, включая D5 после фикса DEFECT-B4).
- `docs/crm-sales-upgrade/REQUIREMENTS_MATRIX.md` — колонка B заполнена по итогам циклов 1–3 (PASS / PASS* FIXED-VERIFIED / PARTIAL / NOT RUN с причинами).
- Временные артефакты агента B (SQL-сид, логи) удалены из `.scratch/agent-b/`; тестовая БД очищена от сида миграции.
- Коммитов нет; product-код агентом B не правился.
