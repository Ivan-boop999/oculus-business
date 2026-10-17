# RUNBOOK — запуск, остановка, диагностика

## Локальный запуск

```bash
# 1. Docker Desktop запущен
docker compose version && docker info

# 2. PostgreSQL (порт 54329 по умолчанию; если занят — см. «Диагностику»)
docker compose --env-file backend/.env up -d postgres

# 3. Миграции
DATABASE_URL="postgresql://superuser:superpassword@localhost:54329/oculus_business?schema=public" bun run --cwd backend prisma:deploy

# 4. Legacy-перенос (однократно после миграции; повтор безопасен)
DATABASE_URL="postgresql://superuser:superpassword@localhost:54329/oculus_business?schema=public" bun run --cwd backend crm:legacy

# 5. Запуск backend + webapp
bun run dev
# webapp: http://localhost:5173, backend: http://localhost:3000
```

## Остановка

`Ctrl+C` в окне `bun run dev`. Контейнер PostgreSQL продолжает работать — это нормально.
Не убивайте чужие процессы ради порта.

## Проверки перед коммитом

```bash
bun run typecheck
bun run architecture:check
bun run test:contracts
bun run test:backend:unit       # 1 фейл — известный Windows-baseline в storage
bun run test:webapp
bun run --cwd backend prisma:validate
```

Интеграционные (нужна тестовая БД):
```bash
# Тестовый PostgreSQL на 54330 (запускается контейнером postgres_test)
DATABASE_URL="postgresql://superuser:superpassword@localhost:54330/oculus_business_test?schema=public" \
  bun run --cwd backend prisma:deploy

TEST_DATABASE_URL="postgresql://superuser:superpassword@localhost:54330/oculus_business_test?schema=public" \
  NO_PROXY=localhost,127.0.0.1 \
  bun run --cwd backend test:integration
```

## Резервное копирование

```bash
# Бэкап (замените <db> на имя базы):
docker exec oculus-business-postgres-1 pg_dump -U superuser -d <db> > backup-$(date +%Y%m%d).sql

# Восстановление в отдельную тестовую БД:
docker exec oculus-business-postgres-1 psql -U superuser -d postgres -c "CREATE DATABASE restore_test"
docker exec -i oculus-business-postgres-1 psql -U superuser -d restore_test < backup-YYYYMMDD.sql
```

Production (Neon): используйте `pg_dump` через `DATABASE_URL` с SSL.

## Диагностика

### Порт 54329 занят
Используйте альтернативный порт:
```bash
POSTGRES_PORT=54332 docker compose --env-file backend/.env up -d postgres
DATABASE_URL="postgresql://superuser:superpassword@localhost:54332/oculus_business?schema=public" bun run --cwd backend prisma:deploy
```

### Прокси блокирует localhost
```bash
curl --noproxy '*' http://localhost:3000/
export NO_PROXY=localhost,127.0.0.1
```

### Интеграционный раннер зависает
Известная проблема на этой машине (`deploy-database.integration.test.ts` — prisma CLI).
Запускайте файлы напрямую:
```bash
TEST_DATABASE_URL="postgresql://superuser:superpassword@localhost:54330/oculus_business_test?schema=public" \
  NO_PROXY=localhost,127.0.0.1 \
  bun run --cwd backend test src/modules/business/sales.integration.test.ts
```

### Lint
`bun run lint` падает по всему webapp на typographyPolicy — известный baseline шаблона.

## Подключение агента

См. [AGENT_CONNECTION.md](./AGENT_CONNECTION.md).
