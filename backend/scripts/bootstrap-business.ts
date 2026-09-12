import 'dotenv/config'

import {
  bootstrapAdmin,
  parseAdminSeedConfig,
} from '../src/modules/users/infrastructure/admin-bootstrap'
import { createPrisma } from '../src/db'

/// Идемпотентный бутстрап бизнес-данных. Запускается при каждом старте контейнера
/// (после `prisma migrate deploy`): создаёт отсутствующие справочники, админа и,
/// если SEED_DEMO_DATA=1 и данных ещё нет, — демо-строки с префиксом «Пример:».

const DEFAULT_STAGES: Array<{ title: string; isWon?: boolean; isLost?: boolean }> = [
  { title: 'Новый лид' },
  { title: 'Квалификация' },
  { title: 'Демо' },
  { title: 'КП / расчёт' },
  { title: 'Пилот' },
  { title: 'Контракт' },
  { title: 'Действующий клиент', isWon: true },
  { title: 'Отказ', isLost: true },
]

const DEFAULT_DEV_COLUMNS = ['Бэклог', 'В работе', 'На проверке', 'Готово']

async function main() {
  const db = createPrisma()

  // --- Справочники ------------------------------------------------------------
  const stageCount = await db.crmStage.count()
  if (stageCount === 0) {
    for (let index = 0; index < DEFAULT_STAGES.length; index += 1) {
      const stage = DEFAULT_STAGES[index]!
      await db.crmStage.create({
        data: {
          title: stage.title,
          position: index,
          isWon: stage.isWon ?? false,
          isLost: stage.isLost ?? false,
        },
      })
    }
    console.log(`Создано этапов CRM: ${DEFAULT_STAGES.length}`)
  }

  const columnCount = await db.devColumn.count()
  if (columnCount === 0) {
    for (let index = 0; index < DEFAULT_DEV_COLUMNS.length; index += 1) {
      await db.devColumn.create({
        data: { title: DEFAULT_DEV_COLUMNS[index]!, position: index },
      })
    }
    console.log(`Создано колонок задач: ${DEFAULT_DEV_COLUMNS.length}`)
  }

  await db.bizSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', openingBalanceDate: new Date(), openingBalance: 0 },
  })

  // --- Админ ------------------------------------------------------------------
  const adminExists = await db.user.findFirst({ where: { role: 'admin' }, select: { id: true } })
  if (adminExists === null) {
    const config = parseAdminSeedConfig(process.env as Record<string, string | undefined>, {
      requirePassword: process.env.NODE_ENV === 'production',
    })
    const result = await bootstrapAdmin(db, config)
    console.log(`Создан администратор: ${result.email}`)
  }

  // --- Демо-данные ------------------------------------------------------------
  if (process.env.SEED_DEMO_DATA === '1') {
    const [dealCount, txnCount] = await Promise.all([db.deal.count(), db.txn.count()])
    if (dealCount === 0 && txnCount === 0) {
      await seedDemoData(db)
      console.log('Добавлены демо-данные (помечены «Пример:» — удалите их)')
    }
  }

  await db.$disconnect()
}

type DemoDb = ReturnType<typeof createPrisma>

async function seedDemoData(db: DemoDb) {
  const stages = await db.crmStage.findMany({ orderBy: { position: 'asc' } })
  const columns = await db.devColumn.findMany({ orderBy: { position: 'asc' } })
  const admin = await db.user.findFirst({ where: { role: 'admin' } })
  if (stages.length === 0 || columns.length === 0 || admin === null) return

  const stageByTitle = new Map(stages.map((stage) => [stage.title, stage]))

  await db.deal.createMany({
    data: [
      {
        title: 'Пример: ООО Ромашка',
        contactName: 'Иван Петров',
        contactPhone: '+7 900 000-00-00',
        source: 'Прямой входящий',
        monthlyAmount: 30_000,
        stageId: stageByTitle.get('Квалификация')!.id,
        position: 0,
        createdById: admin.id,
        nextAction: 'Созвониться, уточнить периметр цеха',
        nextActionAt: new Date(),
      },
      {
        title: 'Пример: ВБ Индустри (обследование)',
        contactName: 'Отдел закупок',
        source: 'Холодный аутрич',
        oneTimeAmount: 495_000,
        stageId: stageByTitle.get('Пилот')!.id,
        position: 0,
        createdById: admin.id,
        nextAction: 'Согласовать акт этапа 1',
        nextActionAt: new Date(),
      },
    ],
  })

  await db.dealComment.create({
    data: {
      dealId: stageByTitle.get('Квалификация')
        ? (await db.deal.findFirst({ where: { stageId: stageByTitle.get('Квалификация')!.id } }))!.id
        : (await db.deal.findFirstOrThrow()).id,
      authorId: admin.id,
      body: 'Пример комментария: клиент смотрит полный пакет, 50 человек на производстве.',
    },
  })

  await db.devTask.createMany({
    data: [
      {
        title: 'Пример: баг — отчёт по простоям не выгружается в Excel',
        type: 'bug',
        priority: 'high',
        columnId: columns[0]!.id,
        position: 0,
        createdById: admin.id,
      },
      {
        title: 'Пример: доработка — виджет OEE на главном экране мастера',
        type: 'feature',
        priority: 'medium',
        columnId: columns[0]!.id,
        position: 1,
        createdById: admin.id,
      },
    ],
  })

  const today = new Date()
  const day = (offsetDays: number) =>
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offsetDays))

  await db.txn.createMany({
    data: [
      {
        kind: 'income',
        amount: 495_000,
        occurredOn: day(-10),
        category: 'Возмездное обследование',
        comment: 'Пример: аванс этапа 1',
        createdById: admin.id,
      },
      {
        kind: 'expense',
        amount: 5_000,
        occurredOn: day(-9),
        category: 'Сервер / хостинг',
        createdById: admin.id,
      },
      {
        kind: 'expense',
        amount: 10_000,
        occurredOn: day(-8),
        category: 'Обслуживание ООО',
        createdById: admin.id,
      },
    ],
  })

  await db.recurringItem.createMany({
    data: [
      {
        kind: 'expense',
        amount: 5_000,
        category: 'Сервер / хостинг',
        dayOfMonth: 5,
        activeFrom: day(-30),
        createdById: admin.id,
      },
      {
        kind: 'expense',
        amount: 10_000,
        category: 'Обслуживание ООО',
        dayOfMonth: 10,
        activeFrom: day(-30),
        createdById: admin.id,
      },
    ],
  })

  // Стартовый остаток из baseline cash-flow (400 000 ₽ на 2026-05-07).
  await db.bizSettings.update({
    where: { id: 'singleton' },
    data: {
      openingBalance: 400_000,
      openingBalanceDate: new Date('2026-05-07T00:00:00.000Z'),
    },
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
