# Install Checklist

This file is the intake record for this repository. The installing agent fills it in during first-run setup and keeps it current afterwards.

**For the agent:** ask the questions below in the user's language, in product terms, and write the answers into this file as you go. Do not start feature work until everything through _First-version capabilities_ and every conditional section activated by those answers is completed. Never ask the user anything under _Decided by the agent_ - make those calls yourself and explain them in product terms.

**For the product owner:** this is the record of what was decided about your project. If something here is wrong, say so - the agent treats this file as the source of truth about what your product needs.

Answer cells hold `_unanswered_` until the question is asked, and `n/a` when the question cannot apply to this project. Answers are written in the product owner's language, but the section headings and the capability-ledger state words stay in English: other documents refer to them by those exact names. Keep every section heading, even when its rows are all `n/a`.

**Install status:** `completed 2026-09-12`

---

## 1. Project identity

| Question                                                        | Answer       |
| --------------------------------------------------------------- | ------------ |
| New project from this template, or work on the template itself? | Новый проект из шаблона vibe |
| Project name / slug                                             | «Окулус Бизнес» / `oculus-business` |
| Your own GitHub repository URL, if you have one                 | https://github.com/Ivan-boop999/oculus-business |

## 2. Product

| Question                                                  | Answer       |
| --------------------------------------------------------- | ------------ |
| What product do you want to build first?                  | Полноценный адаптивный веб-сайт для ведения бизнеса ОРДИКС/OCULUS (ПК: боковое меню и широкие таблицы; телефон: нижняя навигация): 1) CRM с канбан-доской сделок, 2) учёт доходов и расходов (разовых и ежемесячных) с прогнозом и runway, 3) канбан-доска доработок и багов продукта |
| What is the first user journey that must work end to end? | CEO заходит с телефона, видит канбан сделок, создаёт сделку, двигает её по этапам, оставляет комментарий; добавляет разовый/ежемесячный доход или расход, видит прогноз на 6 месяцев и runway; заводит баг/доработку на доске задач |

## 3. Active surfaces

Mark what is active now, and set the install status to `in progress` as soon as this section is answered. From then on, everything unmarked is deferred and must be left alone: no features, no setup, no test flows. While the status is still `not started` nothing has been decided yet, so unmarked boxes mean "not asked", not "forbidden".

- [x] `backend` - API, database, auth
- [x] `webapp` - browser screens behind sign-in (no SEO)
- [ ] `website` - public pages that must rank in search or preview when shared
- [ ] `mobile` - Expo app (lives on the `mobile` branch; switch branches before setup)

| Question                                                                                                             | Answer       |
| -------------------------------------------------------------------------------------------------------------------- | ------------ |
| Why the unmarked surfaces are deferred, if it needs explaining                                                       | Инструмент только для команды ОРДИКС за логином; публичных SEO-страниц нет. По прямому указанию владельца (2026-09-12) продукт — «не столько мобильное приложение, сколько полноценный рабочий сайт для работы с ПК», при этом обязательна работа и с телефона: адаптивный интерфейс (ПК — боковое меню и таблицы, телефон — нижняя навигация). Нативное приложение — ветка `mobile` шаблона, отдельным шагом по решению владельца. |
| If `mobile` is active: are Expo/EAS builds, Expo Push, and Maestro E2E needed now, or left unconfigured until later? | n/a (mobile не активна) |

## 4. First-version capabilities

Ask about product needs, not implementations. Mark what the first version actually needs, then fill the row below even when nothing was ticked, so a later session can tell "asked, and the answer was no" from "not asked yet".

- [x] Accounts / sign-in
- [x] Saved data that survives a restart
- [ ] File, image, or media uploads → also answer _Files, images, and media_
- [ ] Paid subscriptions or one-off payments → also answer _Payments_
- [x] Admin tools or roles
- [ ] External integrations (which: не нужны в первой версии)
- [ ] Real-time chat, presence, collaboration, or live updates

| Question                                                                                          | Answer       |
| ------------------------------------------------------------------------------------------------- | ------------ |
| What the first version explicitly should NOT do (write "nothing ruled out" if that is the answer) | Без загрузки файлов, без онлайн-платежей, без интеграций с 1С/банком, без real-time (обновление — рефетчем). Регистрация закрыта кодом приглашения (`SIGNUP_INVITE_CODE` в окружении продакшена). Язык интерфейса — русский. Продуктовые термины: сделка, этап, канбан, доход/расход, регулярный платёж, прогноз, runway, MRR, доработка/баг. Деньги — рубли, целые числа. |

## 5. Files, images, and media

| Question                                                                                      | Answer       |
| --------------------------------------------------------------------------------------------- | ------------ |
| What do users upload?                                                                         | n/a (аватары шаблона остаются, продуктовых загрузок нет) |
| Public, private, shared with selected people, or mixed?                                      | n/a |
| Who can upload, view, replace, and delete?                                                    | n/a |
| Maximum file size and allowed file types                                                      | n/a |
| Do images need thumbnails, resizing, format conversion, compression, cropping, or moderation? | n/a |
| How long do files live after the owning record is deleted?                                    | n/a |
| Should filenames be visible to users, or opaque?                                              | n/a |

## 6. Website data and freshness

| Question                                                                                    | Answer       |
| ------------------------------------------------------------------------------------------- | ------------ |
| Which public product or content data comes from the backend/database at website build time? | n/a (website не активна) |
| How soon after that data changes must the public website show the change?                   | n/a |
| Which changes require an automatic rebuild/redeploy rather than a manual release?           | n/a |

## 7. Payments

| Question                                                                                                                    | Answer       |
| --------------------------------------------------------------------------------------------------------------------------- | ------------ |
| What exactly do users pay for?                                                                                              | n/a |
| Recurring subscription, one-off purchase, or both?                                                                          | n/a |
| Does the public website need a local cart or offer selection before registration/sign-in?                                   | n/a |
| Which active surfaces need payment: browser checkout, App Store / Google Play, native card entry, Apple Pay, or Google Pay? | n/a |
| What stops working when someone does not pay?                                                                               | n/a |

## 8. Deployment

| Question                                                       | Answer       |
| -------------------------------------------------------------- | ------------ |
| Is deployment needed now, or local-only for the moment? | Нужен сразу: владелец уходит и хочет смотреть/дорабатывать онлайн по ссылке |
| Where are your users, and must the data stay in Russia? | Пользователи — команда ОРДИКС (Россия). Жёсткого требования «данные только в РФ» владелец не ставил: рабочие инструменты команды уже в облаке (GitHub, Render, Neon) |
| Hosting, picked by the agent from the answer above: DigitalOcean / Yandex Cloud / own server | **Render free tier — решение владельца (как в ПромМаркете), ради бесплатности. DigitalOcean / Yandex Cloud / Own server отклонены владельцем в пользу бесплатного Render; при появлении бюджета — миграция на Yandex Cloud.** БД — Neon PostgreSQL (проект oculusivan, база `oculus_business`). Каталоги `infra/` Terraform удалены. |
| Production domains / URLs for API, webapp, and website; is Yandex CDN needed now? | API: https://oculus-business-api.onrender.com · Webapp: https://oculus-business.onrender.com · Website: n/a · CDN: нет |
| Which surfaces are released first | backend + webapp |

**Ask the audience question, not the provider question.** A product owner knows where their users are and whether data must stay in Russia; they should not be asked to compare clouds. The agent picks the hosting from that answer:

| Hosting      | Chosen when                                        | What the template gives you |
| ------------ | -------------------------------------------------- | --------------------------- |
| DigitalOcean | Default for an audience outside Russia. | Terraform creates App Platform API/static sites, a scheduler worker, migration gate, Managed PostgreSQL, DOCR, private media Spaces, and remote state. (Not used in this project: owner chose Render free.) |
| Yandex Cloud | Users in Russia, or data must stay there. | Terraform creates Serverless Containers/timers, Managed PostgreSQL, API Gateway, static and private media Object Storage, remote state, and opt-in CDN. (Planned migration target when budget appears.) |
| Own server   | Full control wanted, no vendor lock-in. | The same Docker image plus the in-repo scheduler. (Not chosen.) |

Pick exactly one and record it above. In this project the owner overrode the default to **Render free tier** (recorded above); the provider Terraform directories were removed from the repo.


## 9. Decided by the agent - do not ask the user

The user is a product owner, not an engineer. These are engineering decisions the agent owns, makes, and explains only in product terms:

- Which browser surface a feature belongs to (`website` for SEO/public, `webapp` for behind-login).
- Which email provider the recorded hosting implies: Yandex Cloud means Postbox, anything else means Resend.
- SSG plus build-time backend data and rebuild/redeploy for public product information unless a recorded freshness or personalization need requires runtime rendering.
- One browser checkout in authenticated `webapp`.
- Monolithic backend; no microservices during setup.
- Docker Compose for local PostgreSQL on every OS; never a native install unless the user insists.
- Astro for `website`; Next.js only if Vercel-style ISR is a stated product requirement.
- The selected Terraform launch profile, machine sizes, serverless/static shape, and when an HA or CDN upgrade is justified.
- Which hosting the recorded audience implies.
- Managed Redis-compatible Pub/Sub only when real-time needs to scale across instances.
- Alerting uses only what the recorded hosting already offers.
- Test boundaries follow the failure mechanism.
- Libraries, file layout, naming, refactors, and validation scope.

Дополнительные решения агента для этого проекта: единый модуль `backend/src/modules/business/` (CRM + финансы + доска доработок); деньги — целые рубли (Int); категория платежа — свободная строка с подсказками (без отдельной таблицы); канбан — перетаскивание на десктопе (HTML5 DnD) + кнопка «Переместить» на телефоне; Shell — мобильная нижняя навигация (веб-приложение PWA-стиля, с телефона открывается как приложение).

## 10. Capability ledger

What this project actually contains. The agent updates it whenever a capability is added or removed.

| Capability                      | State    | Note                                                                                                                                                                                              |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth (email + password)         | included | Template baseline. Регистрация дополнительно закрыта кодом приглашения: если задан `SIGNUP_INVITE_CODE`, он обязателен при регистрации. Первый администратор создаётся при деплое из `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD`. |
| Admin roles                     | included | Roles and seeding in `backend`; admin UI in `webapp`.                                                                                                                                             |
| Password reset email delivery   | included | Провайдеры Postbox/Resend за одним портом. На Render задано `disabled` (почтового провайдера у владельца нет; сброс пароля — через админа).                                                        |
| File/media storage              | included | Private uploads + аватары (filesystem по умолчанию). Продуктовых загрузок нет.                                                                                                                    |
| Infrastructure as code          | removed  | Хостинг — Render free (решение владельца, см. Deployment). Каталоги `infra/` удалены; `scripts/infra.mjs` остаётся, но не используется.                                                            |
| Static asset precompression     | included | own-server tooling, unchanged.                                                                                                                                                                    |
| Storybook component catalogs    | included | Not deployed.                                                                                                                                                                                     |
| CRM (канбан сделок)             | included | `modules/business`: редактируемые этапы, сделки (контакты, источник, разовая и ежемесячная суммы, следующее действие), комментарии-чат, drag&drop + перемещение кнопкой.                          |
| Finance (доходы/расходы)        | included | Разовые операции, регулярные платежи (ежемесячные, день месяца), стартовый остаток, сводка месяца, MRR по выигранным сделкам, прогноз 6 месяцев с runway.                                        |
| Dev board (доработки/баги)      | included | Редактируемые колонки, карточки (тип баг/доработка/идея, приоритет, дедлайн), комментарии.                                                                                                        |
| Website build-time backend data | absent   | website не активна.                                                                                                                                                                               |
| Automatic SSG rebuild           | absent   | n/a.                                                                                                                                                                                              |
| Website cart handoff            | absent   | n/a.                                                                                                                                                                                              |
| Browser checkout / payments     | absent   | Управленческий учёт, не платежи.                                                                                                                                                                  |
| Push notifications              | absent   | n/a.                                                                                                                                                                                              |
| Social sign-in (Apple / Google) | absent   | n/a.                                                                                                                                                                                              |
| Real-time / WebSockets          | absent   | Обновление — рефетч/TanStack Query invalidation.                                                                                                                                                  |
| Shared rate-limit state         | included | memory (один инстанс Render free).                                                                                                                                                                |
| Background jobs                 | included | Template baseline (outbox drain и т.п.).                                                                                                                                                          |
| Durable task outbox             | included | Template baseline; продуктовых задач не добавляет.                                                                                                                                                |
| Background job alerting         | removed  | Render free не даёт managed-алертов; мониторинг — логи Render.                                                                                                                                    |

## 11. Environment checks

Verified by the agent during setup, not asked.

- [x] `docker compose version` and `docker info` succeed (needed for backend/API, uploads, or DB-backed validation)
- [x] `git remote -v` inspected; template remote detached unless contributing to the template
- [x] App-local `.env` files created from `.env.example`, with a locally generated `JWT_SECRET` (never committed)
- [x] Smallest meaningful validation run for the active surfaces

## 12. After setup

- [x] Durable answers above filled in, install status set to `completed 2026-09-12`
- [x] Validation scope recorded for this project (which suites run before a change is called done): `bun run typecheck`, `bun run architecture:check`, `bun run test:contracts`, `bun run test:backend:unit`, `bun run test:webapp`; затем деплой на Render (autoDeploy из GitHub) и smoke-проверка боевых URL
- [x] Project renamed from the template identifiers (`web_app_demo`, `web-app-demo`, `vibecoding-template`, the `Vibe Coding Template` page title), `bun.lock` regenerated
- [x] Deferred-surface notes added to the READMEs of surfaces that are not active
- [x] `Bootstrap-Only Instructions` block deleted from `AGENTS.md`
- [x] Local URLs, commands run, and anything the user must authorize manually reported back to the user
