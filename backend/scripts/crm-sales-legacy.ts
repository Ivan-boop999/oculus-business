import 'dotenv/config'

import { createPrisma, type DbClient } from '../src/db'

/// Перенос legacy-данных CRM после миграции 20261017120000_crm_sales_upgrade (ТЗ §8.8).
///
/// Что делает (идемпотентно, повторный запуск ничего не меняет):
/// 1. Этапам без code/semanticType назначает стабильный machine-code и семантику
///    (won/lost — по флагам, intake — первый этап, остальные other). Это метаданные,
///    а не история: явное сопоставление существующих этапов требует §6 ТЗ.
/// 2. Сделкам без ownerId проставляет createdById (текущее состояние, не выдумка).
/// 3. Сделки без компании получают Company(name=title) — прежняя семантика карточки,
///    где заголовок сделки и есть компания; связь deal.companyId сохраняется.
/// 4. Строковые контакты сделок переносятся как Contact(isLegacy, status=published,
///    каналы status=published) с сохранением оригинала в полях сделки. Неподтверждённые
///    данные НЕ становятся подтверждёнными: статусы каналов остаются published, а не confirmed.
/// 5. Существующие строки DealHistory помечаются legacy=true (нет stageId, нет initial-entry;
///    пробелы истории помечены, а не дорисованы — CRM-06-AC06).
/// 6. Выигранные сделки получают subStatus=unconfirmed (НЕ active): периоды подписки
///    выдумывать нельзя — владельцу нужен список для подтверждения (§8.4 ТЗ).
/// 7. Компании с выигранными сделками → relationStatus=customer, остальные prospect;
///    с любыми сделками → researchStatus=dialogue, без сделок selected.
///
/// Запуск: bun scripts/crm-sales-legacy.ts (DATABASE_URL из окружения/.env).
/// Не запускать против production без отдельного поручения.

export type LegacyMigrationReport = {
  stagesCoded: number
  dealsOwnerBackfilled: number
  companiesCreatedFromDeals: number
  legacyContactsCreated: number
  legacyChannelsCreated: number
  historyRowsMarkedLegacy: number
  wonDealsMarkedUnconfirmed: number
  companiesRelationBackfilled: number
  alreadyApplied: boolean
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

export function stageCodeFromTitle(title: string, position: number): string {
  const slug = title
    .toLowerCase()
    .split('')
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug.length >= 2 ? slug : `stage-${position + 1}`
}

export async function migrateLegacyCrmData(db: DbClient): Promise<LegacyMigrationReport> {
  const report: LegacyMigrationReport = {
    stagesCoded: 0,
    dealsOwnerBackfilled: 0,
    companiesCreatedFromDeals: 0,
    legacyContactsCreated: 0,
    legacyChannelsCreated: 0,
    historyRowsMarkedLegacy: 0,
    wonDealsMarkedUnconfirmed: 0,
    companiesRelationBackfilled: 0,
    alreadyApplied: true,
  }

  // 1. Machine-code и семантика этапов.
  const stages = await db.crmStage.findMany({ orderBy: { position: 'asc' } })
  const usedCodes = new Set<string>()
  for (const stage of stages) {
    if (stage.code !== '') continue
    report.alreadyApplied = false
    let code = stageCodeFromTitle(stage.title, stage.position)
    while (usedCodes.has(code)) code = `${code}-x`
    usedCodes.add(code)
    const semanticType = stage.isWon
      ? 'won'
      : stage.isLost
        ? 'lost'
        : stage.position === 0
          ? 'intake'
          : 'other'
    await db.crmStage.update({ where: { id: stage.id }, data: { code, semanticType } })
    report.stagesCoded += 1
  }

  // 2. Владелец сделки = создатель (до разделения ownerId/createdById они совпадали).
  const dealsWithoutOwner = await db.deal.findMany({
    where: { ownerId: null },
    select: { id: true, createdById: true },
  })
  for (const deal of dealsWithoutOwner) {
    report.alreadyApplied = false
    await db.deal.update({
      where: { id: deal.id },
      data: { ownerId: deal.createdById },
    })
    report.dealsOwnerBackfilled += 1
  }

  // 3–4. Компании из заголовков сделок + legacy-контакты из строковых полей.
  const deals = await db.deal.findMany({
    select: {
      id: true,
      title: true,
      companyId: true,
      contactName: true,
      contactPhone: true,
      contactTelegram: true,
      stage: { select: { isWon: true } },
    },
  })
  const companyByExactName = new Map(
    (await db.company.findMany({ select: { id: true, name: true } })).map((row) => [
      row.name,
      row.id,
    ]),
  )
  for (const deal of deals) {
    let companyId = deal.companyId
    if (companyId === null) {
      const existing = companyByExactName.get(deal.title)
      if (existing) {
        companyId = existing
      } else {
        report.alreadyApplied = false
        const created = await db.company.create({ data: { name: deal.title } })
        companyByExactName.set(deal.title, created.id)
        companyId = created.id
        report.companiesCreatedFromDeals += 1
      }
      await db.deal.update({ where: { id: deal.id }, data: { companyId } })
    }

    const hasLegacyContact = await db.contact.findFirst({
      where: { companyId, legacyDealId: deal.id },
      select: { id: true },
    })
    const anyContactData =
      (deal.contactName ?? '').trim() !== '' ||
      (deal.contactPhone ?? '').trim() !== '' ||
      (deal.contactTelegram ?? '').trim() !== ''
    if (!hasLegacyContact && anyContactData) {
      report.alreadyApplied = false
      const contact = await db.contact.create({
        data: {
          companyId,
          name: deal.contactName ?? null,
          status: 'published',
          source: 'legacy:deal',
          isLegacy: true,
          legacyDealId: deal.id,
          note: 'Перенесено из строкового поля сделки; оригинал сохранён в сделке.',
        },
      })
      report.legacyContactsCreated += 1
      const channels: Array<{ kind: string; value: string }> = []
      if ((deal.contactPhone ?? '').trim() !== '') {
        channels.push({ kind: 'phone', value: (deal.contactPhone ?? '').trim() })
      }
      if ((deal.contactTelegram ?? '').trim() !== '') {
        channels.push({ kind: 'telegram', value: (deal.contactTelegram ?? '').trim() })
      }
      for (const channel of channels) {
        await db.contactChannel.create({
          data: {
            contactId: contact.id,
            kind: channel.kind,
            value: channel.value,
            status: 'published',
            source: 'legacy:deal',
          },
        })
        report.legacyChannelsCreated += 1
      }
    }
  }

  // 5. Прежняя история — без stageId и initial-entry: помечаем пробел, не дорисовываем.
  const historyMarked = await db.dealHistory.updateMany({
    where: { legacy: false, toStageId: null },
    data: { legacy: true },
  })
  if (historyMarked.count > 0) {
    report.alreadyApplied = false
    report.historyRowsMarkedLegacy = historyMarked.count
  }

  // 6. Выигранные сделки: подписка требует подтверждения периодов человеком.
  const wonStages = await db.crmStage.findMany({ where: { isWon: true }, select: { id: true } })
  const wonStageIds = wonStages.map((stage) => stage.id)
  if (wonStageIds.length > 0) {
    const wonMarked = await db.deal.updateMany({
      where: { stageId: { in: wonStageIds }, subStatus: 'none' },
      data: { subStatus: 'unconfirmed' },
    })
    if (wonMarked.count > 0) {
      report.alreadyApplied = false
      report.wonDealsMarkedUnconfirmed = wonMarked.count
    }
  }

  // 7. Текущее отношение компаний — вывод из текущего состояния, не из истории.
  const companies = await db.company.findMany({
    select: {
      id: true,
      relationStatus: true,
      researchStatus: true,
      deals: { select: { stage: { select: { isWon: true } } } },
    },
  })
  for (const company of companies) {
    const hasWonDeal = company.deals.some((deal) => deal.stage.isWon)
    const hasAnyDeal = company.deals.length > 0
    const relationStatus = hasWonDeal ? 'customer' : 'prospect'
    const researchStatus = hasAnyDeal ? 'dialogue' : 'selected'
    if (
      (company.relationStatus === 'prospect' || company.relationStatus === '') &&
      relationStatus === 'customer'
    ) {
      report.alreadyApplied = false
      await db.company.update({
        where: { id: company.id },
        data: { relationStatus, researchStatus },
      })
      report.companiesRelationBackfilled += 1
    }
  }

  return report
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }
  if (process.argv.includes('--help')) {
    console.log('bun scripts/crm-sales-legacy.ts — перенос legacy-данных CRM (идемпотентно)')
    return
  }
  const prisma = createPrisma(databaseUrl)
  try {
    const report = await migrateLegacyCrmData(prisma)
    console.log(JSON.stringify(report, null, 2))
    if (report.alreadyApplied) {
      console.log('Перенос уже выполнен ранее — изменений нет.')
    }
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1]?.includes('crm-sales-legacy')) {
  void main()
}
