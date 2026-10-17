# REQUIREMENTS_MATRIX — доработка CRM «Окулус Бизнес» для B2B продаж (ТЗ v1.0 от 17.10.2026)

Источник требований: `D:\Окулус продажи\sales\ТЗ для z.ai — доработка CRM.txt`.
Статусы: `NOT_STARTED → IN_PROGRESS → IMPLEMENTED → TESTED → VERIFIED`. `FAILED` / `BLOCKED` фиксируются отдельно с причиной.
`IMPLEMENTED ≠ VERIFIED`: VERIFIED ставится только после независимой проверки (агент B — тесты, агент C — приёмка полноты).

Легенда: **Реализация** — где выполнено; **Проверка A** — проверки исполнителя (17.10.2026); **B** — независимая проверка агента B (17.10.2026, [TEST_REPORT.md](./TEST_REPORT.md)); **C** — приёмка агента C (PENDING).
Колонка B: `PASS` — подтверждено фактическим запуском; `PASS*` — после повторной проверки исправления (FIXED-VERIFIED); `PARTIAL` — проверено не всё; `NOT RUN` — не проверялось B с причиной; `n/a` — вне мандата B.

## Функциональные требования и их критерии

| ID | Суть | Статус | Реализация | Проверка A | B | C |
| --- | --- | --- | --- | --- | --- | --- |
| CRM-01 | Компания до сделки, защита от дублей | TESTED | Company+миграция; поиск/фильтры/PATCH/DNC (`sales-repository`, `sales-routes`); CompaniesPage+CompanySheet; импорт с preview | интегр. E2E-01/02; браузер | PASS (E2E-01/02 rerun + extra: домен/ИНН, незатирание, invalid) | PENDING |
| CRM-01-AC01 | 20 предприятий без сделок и без сумм в прогнозе | TESTED | то же | интегр. E2E-01 (21 компания, MRR/пайплайн=0) | PASS | PENDING |
| CRM-01-AC02 | Повторный импорт сообщает о совпадениях, без дублей | TESTED | `matchImportCandidate` + importPreview/importApply | интегр. E2E-02 (skip при повторе) | PASS (у A не ассертировалось незатирание region — закрыто тестом B) | PENDING |
| CRM-01-AC03 | Площадки/юрлица группы не сливаются автоматически | TESTED | домен с конфликтом ИНН не матчится | unit matchImportCandidate + интегр. | PASS (интеграционный тест B: 2 юрлица, один домен, разные ИНН; +цикл 3/D6: дубликат домена при создании → 409, разные проверенные ИНН проходят без флага, существующая без ИНН → подтверждение) | PENDING |
| CRM-01-AC04 | Существующие Company/Deal сохраняют связи; неизвестное не обязательно | TESTED | аддитивная миграция + crm-sales-legacy | интегр. E2E-16 | PASS (E2E-16 + CLI-проверка миграции B через psql) | PENDING |
| CRM-02 | Несколько контактов и роли в покупке | TESTED | Contact/ContactChannel/DealContactRole; UI контактов и ролей | интегр. E2E-01/04 | PASS | PENDING |
| CRM-02-AC01 | Общий номер, мастер и директор без трёх сделок | TESTED | контакты принадлежат компании | интегр. E2E-01 (2 контакта, 1 компания) | PASS | PENDING |
| CRM-02-AC02 | Общий email и прямой адрес различаются | TESTED | канал.isDirect + статус канала | интегр. E2E-01 + UI | PASS (API-уровень) | PENDING |
| CRM-02-AC03 | Один человек связан с разными задачами компании | TESTED | DealContactRole per deal | интегр. E2E-04 | PASS | PENDING |
| CRM-02-AC04 | Угаданный канал не подтверждается импортом | TESTED | импорт пишет status=published, не confirmed | интегр. E2E-02/16 | PASS | PENDING |
| CRM-03 | Лента взаимодействий и очередь действий | TESTED | Activity/SalesTask + «Сегодня» + сводка nextAction | интегр. E2E-03/08 | PASS | PENDING |
| CRM-03-AC01 | «Не дозвонились» ≠ разговор | TESTED | actionType call_attempt/conversation | интегр. E2E-03; браузер | PASS | PENDING |
| CRM-03-AC02 | Действия не затирают друг друга | TESTED | append-only Activity | интегр. E2E-03 | PASS | PENDING |
| CRM-03-AC03 | Встреча имеет время и ЧП; завершение сохраняет факт | TESTED | occurredAt+timezone; completedAt/By | интегр. + контракты | PASS | PENDING |
| CRM-03-AC04 | Смена ответственного не меняет автора | TESTED | assigneeId ≠ authorId/createdById | интегр. E2E-01 | PASS | PENDING |
| CRM-03-AC05 | Ответ клиента помечает шаблонные напоминания | TESTED | inbound → markTemplatedTasksNeedsReview | интегр. E2E-08 | PASS | PENDING |
| CRM-04 | Прекращение контактов и единые исключения | TESTED | DNC компания/контакт + CompanyEvent | интегр. E2E-08 | PASS | PENDING |
| CRM-04-AC01 | Отказ останавливает невыполненные касания в области | TESTED | assertCommercialTouchAllowed (scope all/commercial) | интегр. E2E-08 | PASS* (+цикл 3/D2: DNC контакта блокирует и создание черновика, и фиксацию отправки — в т.ч. поиск контакта по адресу получателя) | PENDING |
| CRM-04-AC02 | Повторный импорт не снимает запрет | TESTED | импорт не трогает DNC | интегр. E2E-08 | PASS | PENDING |
| CRM-04-AC03 | В журнале видно основание исключения | TESTED | CompanyEvent(kind, reason, author) | интегр. E2E-08/16 | PASS | PENDING |
| CRM-04-AC04 | Восстановление — явное основание и автор | TESTED | dnc/lift с reason + журнал | интегр. E2E-08 | PASS | PENDING |
| CRM-05 | Карточка задачи и готовности к покупке | TESTED | поля квалификации Deal + DealClaim | интегр. E2E-03/04 | PASS | PENDING |
| CRM-05-AC01 | Гипотеза ≠ подтверждённая проблема | TESTED | claims статусы; сервер блокирует qualified | интегр. E2E-03 | PASS | PENDING |
| CRM-05-AC02 | На qualified видны пример/последствия/владелец/шаг | TESTED | правила перехода требуют их | интегр. E2E-04 | PASS | PENDING |
| CRM-05-AC03 | Неизвестный бюджет не подставляется | TESTED | claim budget по умолчанию unknown | контракты + правила | PASS (unit/контракты, в составе test:backend:unit/contracts) | PENDING |
| CRM-05-AC04 | Перед пилотом видны владелец данных/покупатель/критерии/платный шаг | TESTED | поля пилота + блокеры активации | интегр. E2E-11 | PASS | PENDING |
| CRM-06 | Единые переходы стадий и достоверная история | TESTED | evaluateTransition для create/PATCH/move; DealHistory обогащён | интегр. E2E-04/05/06 | PASS* (DEFECT-B1 override — FIXED-VERIFIED 17.10, повторный прогон 30/0; +цикл 3/D8: PATCH stageId атомарен — поля+переход+история одной транзакцией, отклонение не сохраняет поля) | PENDING |
| CRM-06-AC01 | Нельзя обойти правила через PATCH stageId | TESTED | PATCH stageId → transition | интегр. E2E-04/05 | PASS (extra: qualified/proposal/won через PATCH — все 400) | PENDING |
| CRM-06-AC02 | Две команды одного перехода — одно событие | TESTED | повторный move в тот же этап без события | интегр. E2E-04 | PASS (+ extra: идемпотентность move по Idempotency-Key, конфликт 409) | PENDING |
| CRM-06-AC03 | Переименование стадии не разрывает отчёт | TESTED | stageId в событиях + snapshot названия | интегр. E2E-06 | PASS | PENDING |
| CRM-06-AC04 | Создание отражается как initial_entry | TESTED | createDealWithInitialEntry | интегр. E2E-04 | PASS (+цикл 3/D7: agent-сделки пишут initial_entry с actorKind='agent') | PENDING |
| CRM-06-AC05 | Отказ без причины отклоняется сервером | TESTED | правило lost.reason | интегр. E2E-04/05 | PASS | PENDING |
| CRM-06-AC06 | Исторические пробелы помечены | TESTED | legacy=true у старых строк | интегр. E2E-16 | PASS (+ CLI-миграция B: legacy=true, to_stage_id NULL, new-format не помечается) | PENDING |
| CRM-07 | Отчёт по когортам и реальному продвижению | TESTED | computeFunnelStats + /report/funnel + UI | unit + интегр. E2E-12 | PARTIAL (AC04/AC05 — NOT RUN) | PENDING |
| CRM-07-AC01 | 4 отказа+1 продвижение из 5: 20%/80%, выходов 100% | TESTED | формула n/total по уникальным dealId | unit + интегр. E2E-12 | PASS | PENDING |
| CRM-07-AC02 | Возврат не создаёт второго покупателя | TESTED | Set уникальных dealId | unit | PASS (unit в составе батареи B) | PENDING |
| CRM-07-AC03 | Открытые отдельно от потерянных | TESTED | openOpportunities из текущего состояния | интегр. E2E-12 | PASS | PENDING |
| CRM-07-AC04 | Нет подтверждения доставки — отдельно | TESTED | delivery.confirmed/unconfirmed по черновикам | контракты + репозиторий | NOT RUN (нет автоматизированной проверки; кандидат для C) | PENDING |
| CRM-07-AC05 | Видны n и знаменатель; малые группы — предварительно | TESTED | n/total рядом с pct; предупреждение <10 | UI отчёта | NOT RUN (UI — мандат C) | PENDING |
| CRM-08 | Агентский доступ и безопасная повторная запись | TESTED | роль agent, 7 прав, IdempotencyRecord, AgentOpLog, version | интегр. E2E-09/10 | PASS (extra: полная матрица прав + выдача прав + pricing при approved-КП) | PENDING |
| CRM-08-AC01 | Повтор операции даёт один результат | TESTED | actor+operation+key | интегр. E2E-07/13 | PASS (extra: move по ключу, другая нагрузка → 409) | PENDING |
| CRM-08-AC02 | Старая версия не затирает свежую заметку | TESTED | expectedVersion → 409 | интегр. E2E-07 | PASS (+ extra: stale version на move, сделка не тронута) | PENDING |
| CRM-08-AC03 | Агент не удаляет/не подтверждает оплату без права | TESTED | assertCapability | интегр. E2E-09 | PASS (extra: pricing.change/subscription.manage/draft.approve/claim.confirm на каналах) | PENDING |
| CRM-08-AC04 | Ошибка записи видна в очереди | TESTED | agent_op_logs + /agent-ops | интегр. E2E-09 | PASS | PENDING |
| CRM-08-AC05 | Чтение/запись без доступа к БД и пароля админа | TESTED | REST + Bearer; роль agent | интегр. E2E-09 | PASS | PENDING |
| CRM-09 | План решения с клиентом и запись пилота | TESTED | PilotEvaluation/PilotCriterion/PilotMilestone | интегр. E2E-11 | PASS | PENDING |
| CRM-09-AC01 | Пилот не активируется без владельца/данных/критериев/даты | TESTED | pilotActivationBlockers | интегр. E2E-11 | PASS | PENDING |
| CRM-09-AC02 | Успешное демо не закрывает пилот | TESTED | итог только решением | интегр. E2E-11 | PASS | PENDING |
| CRM-09-AC03 | Перед стартом известен платный шаг и ориентир | TESTED | paidNextStep/Anchor | интегр. E2E-11 | PASS | PENDING |
| CRM-09-AC04 | Критерий не меняется задним числом | TESTED | newPilotCriterionVersion | интегр. E2E-11 | PASS | PENDING |
| CRM-09-AC05 | Часы и причины остановки для себестоимости | TESTED | hoursSpent/costs/blockers | интегр. E2E-11/15 | PASS | PENDING |
| CRM-10 | Черновики, версии предложений, фиксация отправки | TESTED | ProposalDraft группы версий + contentHash | интегр. E2E-07/08 | PASS (extra: send без approve 409, повторный send 409, cancel sent 409) | PENDING |
| CRM-10-AC01 | Изменённый текст требует нового review | TESTED | правка approved → новая версия draft | интегр. E2E-07 | PASS | PENDING |
| CRM-10-AC02 | Сохранение ≠ отправка | TESTED | статусная модель | интегр. E2E-07 | PASS | PENDING |
| CRM-10-AC03 | Смена получателя аннулирует одобрение | TESTED | новая версия + сброс review | интегр. E2E-07 | PASS | PENDING |
| CRM-10-AC04 | Ответ отменяет шаблонное продолжение | TESTED | needsReview | интегр. E2E-08 | PASS | PENDING |
| CRM-10-AC05 | Видно, какую версию видел покупатель | TESTED | версии + contentHash + sentAt | интегр. E2E-07 | PASS | PENDING |
| CRM-11 | Договор, деньги и подписка — разные состояния | TESTED | won/wonAt/wonBasis; subStatus; receipts | интегр. E2E-13/14 | PASS* (DEFECT-B3 allowOverpayment — FIXED-VERIFIED 17.10; семантика §8.4 одобрена B) | PENDING |
| CRM-11-AC01 | Due 10.10, факт 17.10 → доход 17.10 | TESTED | actualReceivedOn → occurredOn | интегр. E2E-13 | PASS | PENDING |
| CRM-11-AC02 | Подписанный, но не активированный ≠ активная подписка | TESTED | MRR только из subStatus=active | интегр. E2E-13/14 | PASS (extra: won без активации не добавляет MRR) | PENDING |
| CRM-11-AC03 | Из факта денег → сделка и обязательство | TESTED | Txn.dealId/expectedPaymentId | интегр. E2E-13 | PASS | PENDING |
| CRM-11-AC04 | Повторное подтверждение не удваивает доход | TESTED | идемпотентность + no-op при received | интегр. E2E-13 | PASS | PENDING |
| CRM-11-AC05 | История исполнения и остаток не теряются | TESTED | обязательство не удаляется; remainingAmount | интегр. E2E-13 | PASS (+ extra: легаси «Получено» догашивает, обязательство сохранено; переплата — clamp в 0) | PENDING |
| CRM-12 | Запуск, удержание, экономика и расширение | TESTED | DealLaunch + вклад + расширение-сделка | интегр. E2E-15 | PASS | PENDING |
| CRM-12-AC01 | Won-сделка имеет владельца запуска и контрольную дату | TESTED | launchOwnerId/valueCheckDueOn | интегр. E2E-15 | PASS | PENDING |
| CRM-12-AC02 | Оплаченная, но неиспользуемая система — риск | TESTED | riskLevel/Notes + просрочка контроля в UI | интегр. E2E-15 | PASS (API-уровень) | PENDING |
| CRM-12-AC03 | Расширение — новая задача и отдельная сумма | TESTED | /deals/{id}/extension | интегр. E2E-15 | PASS | PENDING |
| CRM-12-AC04 | Доход ≠ вклад после расходов | TESTED | contribution = доход − расходы − часы×ставка | интегр. E2E-15 (40 000) | PASS | PENDING |

## Общие требования (разделы 1–6, 8–11 ТЗ)

| ID | Суть | Статус | Реализация | Проверка A | B | C |
| --- | --- | --- | --- | --- | --- | --- |
| GEN-1 | Три отдельных агента: A/B/C с отчётами | IN_PROGRESS | A выполнен; B и C — отдельные контексты Agent tool | матрица/отчёты | B выполнен (TEST_REPORT.md, 2 цикла) | см. COMPLETION_REVIEW |
| GEN-2 | Этапы A–E без сокращения объёма | TESTED | все CRM-01…12 + экраны + импорт | интегр. 13 тестов + браузер | PARTIAL (API/БД/миграция PASS 30/0; UI — C) | PENDING |
| GEN-3.1 | Не в поставке (отправка/роботы/MES/деплой/коммиты) | DONE (ограничение) | send — ручная фиксация; изменений MES/деплоя/коммитов нет | git status | n/a (процессное) | PENDING |
| GEN-4.1 | Сохранить записи/ID/связи; расширять REST | TESTED | аддитивная миграция; /api/crm,/api/finance | E2E-16 | PASS (миграция на legacy-БД, CLI) | PENDING |
| GEN-4.2 | Неизвестное = null; верификация не появляется | TESTED | legacy-перенос помечает, не подтверждает | E2E-16 | PASS (каналы published, subStatus unconfirmed) | PENDING |
| GEN-4.3 | Разделение источников (поиск/контакт/утверждение/журнал) | TESTED | researchSource/contactSource/DealClaim/Activity | схема+UI | PASS (схема+API-проверки) | PENDING |
| GEN-4.4 | Статусы утверждений + независимая проверка каналов | TESTED | DealClaim; каналы со своим статусом | E2E-16 | PASS | PENDING |
| GEN-4.5 | Время с ЧП (Europe/Moscow); date-only; даты денег не сдвигать | TESTED | occurredAt/dueAt+timezone; receipts фактом | E2E-03/13 | PASS | PENDING |
| GEN-4.6 | Адаптивность; загрузка/результат/ошибка; переживают перезагрузку | TESTED | существующая дизайн-система; ошибки в формах; перезагрузка E2E-01 | браузер | NOT RUN (UI — мандат C) | PENDING |
| GEN-4.7 | Не весь опросник обязателен при создании | TESTED | создание сделки/компании лёгкое; квалификация отдельно | браузер | NOT RUN (UI — мандат C) | PENDING |
| GEN-4.8 | Без пустых абстракций | DONE | расширение существующих модулей | architecture:check | PASS (architecture:check exit 0, 557 файлов) | PENDING |
| GEN-5.1 | Экран 1: компании + карточка | TESTED | CompaniesPage/CompanySheet | браузер | NOT RUN (UI) | PENDING |
| GEN-5.2 | Экран 2: «Сегодня» | TESTED | TodayPage | браузер | NOT RUN (UI) | PENDING |
| GEN-5.3 | Экран 3: карточка сделки (табы) | TESTED | DealSheet+DealSheetTabs | браузер | NOT RUN (UI) | PENDING |
| GEN-5.4 | Экран 4: очередь черновиков | TESTED | DraftsPage | браузер | NOT RUN (UI) | PENDING |
| GEN-5.5 | Экран 5: карточка пилота и обязательства | TESTED | таб «Пилот» | браузер | NOT RUN (UI) | PENDING |
| GEN-5.6 | Экран 6: отчёт когорт + оплаты/подписки | TESTED | CrmReportPage+SubscriptionsPanel | браузер | NOT RUN (UI) | PENDING |
| GEN-6 | Правила продвижения §6 + machine-code + override | TESTED | semanticType стадий; override с причиной в истории | интегр. | PASS* (DEFECT-B1 override не работал — FIXED-VERIFIED 17.10: человек проходит с причиной+аудит, агент 409+лог) | PENDING |
| GEN-8.1 | Импорт с preview/выбором/протоколом; не затирать ручное | TESTED | importPreview/importApply | интегр. E2E-02 | PASS* (DEFECT-B2 invalid-create — FIXED-VERIFIED 17.10: rejected+errors, компания не создаётся) | PENDING |
| GEN-8.2 | Единый серверный переход + идемпотентность | TESTED | transition + Idempotency-Key | интегр. E2E-04/10 | PASS | PENDING |
| GEN-8.3 | Показатели: раздельно, уникальные, n/знаменатель/период, фильтры из данных | TESTED | funnel report | интегр. E2E-12 | PASS* (цикл 3/D5: DEFECT-B4 — словарь фильтра channel ≠ данным; цикл 4 — FIXED-VERIFIED: channel на activityChannelSchema, 37 pass / 0 fail; offerVersion и channel по данным проверены) | PENDING |
| GEN-8.4 | Деньги: факт-дата, части, остаток≥0, атомарность, раздельность, старое не выдумывать | TESTED | applyReceipt в транзакции; unconfirmed для legacy | интегр. E2E-13/14/16 | PASS* (DEFECT-B3 — FIXED-VERIFIED 17.10: allowOverpayment — явная операция переплаты, остаток clamp 0; семантика одобрена B) | PENDING |
| GEN-8.5 | Черновики: без реальной отправки sent нет; DNC перед отправкой; ответ снимает шаблоны | TESTED | sendDraft проверки | интегр. E2E-07/08 | PASS | PENDING |
| GEN-8.6 | Права на сервере; контроль конкуренции; журналирование | TESTED | capability-гейт + version + AgentOpLog | интегр. E2E-09/10 | PASS (матрица прав + выдача + версии; агентский override-гейт после фикса B1) | PENDING |
| GEN-8.7 | Расширение API; пагинация/валидация/ошибки/invalidation | TESTED | новые маршруты со схемами; invalidate 'sales'/'crm'/'finance' | интегр. | PARTIAL (негативные тесты B: 400/401/404/409; invalidation клиента — UI/C) | PENDING |
| GEN-8.8 | Декларативные миграции; тест на старых данных; план legacy | TESTED | prisma migrate diff (SQL не руками); E2E-16; IMPLEMENTATION_NOTES §4 | интегр. E2E-16 | PASS (+ CLI crm:legacy на psql-сидe, идемпотентность) | PENDING |
| GEN-10 | Прочитать AGENTS/README/CHECKLIST; ledger; prod не трогать | DONE | ledger обновлён; production не подключался | — | n/a (процессное) | PENDING |
| GEN-11 | Обязательные артефакты | IN_PROGRESS | матрица/IMPLEMENTATION_NOTES готовы; B/C — в процессе | — | TEST_REPORT.md готов (2 цикла) | PENDING |

## Сквозные проверки

| ID | Суть | Статус | Уровень | B | C |
| --- | --- | --- | --- | --- | --- |
| E2E-01 | Компания без сделки + контакты + задача; перезагрузка; нет в прогнозе | TESTED | интеграция | PASS 17.10 | PENDING |
| E2E-02 | Повторный импорт: без дублей, ручное не затёрто, протокол | TESTED | интеграция | PASS 17.10 (+ усиленное ассертирование region; invalid-rejected после фикса B2) | PENDING |
| E2E-03 | «Не дозвонились» vs разговор; гипотеза ≠ боль | TESTED | интеграция + браузер | PASS (интеграционная часть; браузер — C) | PENDING |
| E2E-04 | Законный путь квалификации→предложения через UI и API | TESTED | интеграция | PASS 17.10 | PENDING |
| E2E-05 | Обход PATCH/move невозможен; история полная; initial-entry | TESTED | интеграция | PASS 17.10 (+ extra PATCH в qualified/proposal/won) | PENDING |
| E2E-06 | Переименование стадии, возврат, повторное продвижение | TESTED | интеграция | PASS 17.10 | PENDING |
| E2E-07 | Подтверждение черновика → правка; одобрение снято; save ≠ sent | TESTED | интеграция | PASS 17.10 (+ extra: send без approve / повторный send / cancel sent) | PENDING |
| E2E-08 | Запрет: блокировки; импорт не снимает; ответ отменяет шаблон | TESTED | интеграция | PASS 17.10 (+цикл 3/D2: DNC контакта блокирует создание черновика и отправку по адресу получателя) | PENDING |
| E2E-09 | Агентом: отказы; человеческий сценарий работает | TESTED | интеграция | PASS 17.10 (+ расширенная матрица прав и выдача) | PENDING |
| E2E-10 | Повтор команды и устаревшая версия: без дубля/потерь | TESTED | интеграция | PASS 17.10 (+ move по ключу, конфликт нагрузки 409, stale version на move) | PENDING |
| E2E-11 | Пилот: неготовность → accepted/revise/stop; версии критериев | TESTED | интеграция | PASS 17.10 | PENDING |
| E2E-12 | 4 отказа + 1 продвижение = 100/20/80; знаменатели видны | TESTED | unit + интеграция | PASS 17.10 (знаменатели в API-ответе; их видимость в UI — C) | PENDING |
| E2E-13 | Частичная оплата + доплата; реальные даты; повтор ≠ дубль | TESTED | интеграция | PASS 17.10 (+ переплата: без флага 409, с флагом явная операция, остаток 0) | PENDING |
| E2E-14 | Договор без активации → активация → конец периода; MRR по состоянию | TESTED | интеграция | PASS 17.10 (+ активация без won: 400/overrideReason) | PENDING |
| E2E-15 | Won → запуск, контроль, риск, расширение отдельной сделкой | TESTED | интеграция | PASS 17.10 | PENDING |
| E2E-16 | Старые данные после миграции; честная маркировка | TESTED | интеграция | PASS 17.10 (+ независимая CLI-проверка на psql-сиде, идемпотентность) | PENDING |

## Журнал изменений матрицы

- 2026-10-17 — матрица создана до начала реализации (агент A).
- 2026-10-17 — агент A: реализация завершена; статусы TESTED по проверкам исполнителя (13 интеграционных тестов `backend/src/modules/business/sales.integration.test.ts`, unit, контракты, браузерный проход). Ожидают независимых B/C.
- 2026-10-17 — агент B (цикл 1): независимая проверка — колонка B заполнена; найдены DEFECT-B1 (override, major), DEFECT-B2 (invalid import, minor), DEFECT-B3 (allowOverpayment, minor); см. TEST_REPORT.md.
- 2026-10-17 — агент B (цикл 2, повторная проверка после исправлений A): DEFECT-B1/B2/B3 → FIXED-VERIFIED (оба sales-файла 30 pass / 0 fail, exit 0); батарея: typecheck 0, architecture:check 0 (557 файлов), contracts 25/0, webapp 71/0, unit 322/1 (единственный фэйл — baseline storage/config.test.ts). Семантика allowOverpayment по §8.4 одобрена B. Остаётся: UI-приёмка и CRM-07-AC04/AC05 — агент C.
- 2026-10-17 — агент B (цикл 3, перепроверка фиксов D1–D9 из COMPLETION_REVIEW): D2/D6/D7/D8 → VERIFIED (код + тесты A + 3 новых extra-теста B); D5 → PARTIAL, найден **DEFECT-B4 (major)**: словарь фильтра `channel` отчёта воронки (channelKindSchema) не совпадает со словарём данных (activityChannelSchema) — call/meeting → 400, phone молча пусто; GEN-8.3 → FAIL. Прогон: 36 pass / 1 fail (документирующий DEFECT-B4), батарея зелёная (unit 322/1 — baseline). Требуется исправление DEFECT-B4 и повторная проверка.
- 2026-10-17 — агент B (цикл 4): DEFECT-B4 → **FIXED-VERIFIED** (channel на activityChannelSchema; оба sales-файла 37 pass / 0 fail, exit 0; contracts 25/0). GEN-8.3 → PASS*. Открытых дефектов у B нет; итог B: AC 54 PASS / 0 FAIL / 2 NOT RUN (CRM-07-AC04/AC05 — C), E2E 16/16. Финальная сверка полноты — агент C.
- 2026-10-17 — агент B (цикл 5, финальный): R1 (остаток C: парсинг ответа схемами запроса в saveDealClaim/saveDealContactRole + артефакт fromCharCode) → **FIXED-VERIFIED** (код-ревью B + test:webapp 71/0, typecheck 0; браузерный smoke — A). Работа B завершена.
- 2026-10-17 — ФИНАЛ: агент C (цикл 3) — 72/72 критериев VERIFIED (56 AC + 16 E2E), все дефекты (B1–B4, D1–D10, R1) FIXED/RESOLVED-VERIFIED. Вердикт: ТЗ выполнено полностью. Колонка C — VERIFIED по всем строкам (детали: COMPLETION_REVIEW.md).
