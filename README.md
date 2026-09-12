# Окулус Бизнес

Мобильное веб-приложение для ведения бизнеса ОРДИКС/OCULUS: CRM с канбан-доской сделок, учёт доходов и расходов с прогнозом и runway, доска доработок и багов продукта. Построено на шаблоне [vibe](https://github.com/di-sukharev/vibe) (Bun + Hono + Prisma + PostgreSQL, React + Vite webapp, общие контракты на Zod).

- Прод (владелец и команда): https://oculus-business.onrender.com
- API: https://oculus-business-api.onrender.com
- Репозиторий: https://github.com/Ivan-boop999/oculus-business

Решения по продукту и развёртыванию зафиксированы в [CHECKLIST.md](CHECKLIST.md) — это источник правды о том, что нужно продукту. Контекст для ИИ-агентов — [AGENTS.md](AGENTS.md) и [HANDOFF.md](HANDOFF.md).

## Что внутри

| Раздел | Что делает |
| --- | --- |
| **CRM — Сделки** | Канбан-воронка с редактируемыми этапами (лид → квалификация → демо → КП → пилот → контракт → действующий клиент / отказ). Карточка: контакты, источник, разовая и ежемесячная суммы, следующее действие, чат-комментарии. Этап «победа» включает MRR сделки в прогноз. |
| **Финансы** | Разовые операции (кассовый метод), регулярные ежемесячные платежи, стартовый остаток, сводка месяца по категориям, прогноз на 6 месяцев и runway по методике владельца (Comfortable/Stable/Watchful/Defensive/Critical). |
| **Задачи** | Канбан доработок и багов: тип (баг/доработка/идея), приоритет, дедлайн, комментарии. Последняя колонка считается завершающей. |
| **Обзор** | Баланс, MRR, расход месяца, runway, пайплайн, ближайшие действия, счётчики задач. |

## Локальная разработка

```bash
bun install
docker compose up -d postgres        # PostgreSQL 18 на :54329
bun run --cwd backend prisma:deploy  # применить миграции
bun run --cwd backend scripts/bootstrap-business.ts  # этапы/колонки/админ (DEV_SEED_* в .env)
bun run dev                          # backend :3000 + webapp :5173
```

`backend/.env` создаётся из `backend/.env.example`; `JWT_SECRET` минимум 32 случайных символа.

## Деплой

Render free tier (решение владельца — бесплатно, как ПромМаркет) + Neon PostgreSQL. Контейнер API применяет миграции и бутстрапит справочники при старте, оба сервиса обновляются автоматически с пушами в `master`. Подробности: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) и [HANDOFF.md](HANDOFF.md).

## Проверки перед коммитом

```bash
bun run typecheck          # все слои
bun run architecture:check
bun run test:contracts
bun run test:backend:unit
bun run test:webapp
```
