# AGENT_CONNECTION — подключение ИИ-агента из отдельного чата к CRM «Окулус Бизнес»

Проект: `C:\Users\Admin\Desktop\Ведение бизнеса Окулус\oculus-business`
Клиент: `tools/crm-agent-client.ts` (Bun, типизированный REST, PostgreSQL не нужен)

## Быстрый старт для нового чата

1. Владелец создаёт агентскую запись (роль `agent`) в админ-панели CRM и выдаёт права.
2. В окружении нового чата задайте:
   ```bash
   export CRM_BASE_URL="http://localhost:3000"       # или прод-URL API
   export CRM_AGENT_EMAIL="agent@..."                 # email агентской записи
   export CRM_AGENT_PASSWORD="..."                    # пароль — вводит владелец локально
   ```
3. Проверьте:
   ```bash
   bun tools/crm-agent-client.ts status
   ```

## Что агент может (базовый доступ, без дополнительных прав)

- Читать компании, сделки, контакты, задачи, черновики, запреты
- Создавать/обновлять компании (с защитой от дублей)
- Добавлять контакты, факты исследования, черновики, задачи, взаимодействия
- dry-run для создания компании (предпросмотр плана без записи)

## Что агент НЕ может без отдельного права

| Право | Действие |
|---|---|
| `finance.confirm` | Подтверждение/изменение/удаление денег |
| `won.confirm` | Перевод сделки в «выиграна» |
| `deal.delete` | Удаление сделок |
| `subscription.manage` | Управление подписками |
| `pricing.change` | Изменение цен при одобренном КП |
| `claim.confirm` | Подтверждение фактов клиента |
| `draft.approve` | Одобрение и фиксация отправки КП |
| `pilot.decide` | Решение по пилоту (accepted/revise/stop) |
| `case.allow` | Разрешение публичного кейса |

Попытка запрещённого действия → **403** с объяснением, какая capability нужна.

## Идемпотентность

Для записывающих команд передавайте `--idempotency-key <unique-key>`:
```bash
bun tools/crm-agent-client.ts add-task '{"goal":"Позвонить","assigneeId":"...","dueAt":"2026-10-20T10:00:00+03:00"}' --idempotency-key task-001
```
Повтор с тем же ключом и той же нагрузкой → тот же результат (без дубля).
Другая нагрузка с тем же ключом → 409.

Узнать итог после потери ответа:
```bash
bun tools/crm-agent-client.ts result task.create task-001
```

## Обработка ошибок

- **401** → клиент автоматически пробует refresh; если не помогло — перепроверьте пароль
- **403** → стоп; запросите у владельца соответствующее право
- **409** → конфликт (дубль/версия); перечитайте данные и покажите различия
- **429** → превышен лимит запросов, подождите

## Безопасность

- Секреты (пароль) — только в переменных окружения, никогда в чате/URL/логах
- Прямой доступ к PostgreSQL и Prisma Studio агенту не нужен
- Отзыв прав: владелец снимает галочки в админ-панели — запрет действует немедленно

## Сценарий «добавить кандидата»

```bash
# 1. Поиск дубля
bun tools/crm-agent-client.ts search "ООО Ромашка"

# 2. Dry-run
bun tools/crm-agent-client.ts upsert-company '{"name":"ООО Ромашка","website":"https://romashka.ru"}' --dry-run

# 3. Применить
bun tools/crm-agent-client.ts upsert-company '{"name":"ООО Ромашка","website":"https://romashka.ru","segment":"Пищепром"}' --idempotency-key romashka-001

# 4. Добавить контакт
bun tools/crm-agent-client.ts add-contact <companyId> '{"name":"Иван","channels":[{"kind":"email","value":"ivan@romashka.ru"}]}'

# 5. Добавить факт исследования
bun tools/crm-agent-client.ts add-fact <companyId> '{"claim":"На сайте указаны участки с ЧПУ","sourceUrl":"https://romashka.ru","observedAt":"2026-10-17T10:00:00+03:00"}'

# 6. Задача следующего шага
bun tools/crm-agent-client.ts add-task '{"companyId":"<id>","assigneeId":"<userId>","goal":"Позвонить","dueAt":"2026-10-20T10:00:00+03:00"}'
```
