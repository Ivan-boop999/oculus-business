import { PutObjectCommand, S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'

import type { DbClient } from './db'

/// Ежедневный автобэкап бизнес-данных: JSON-дамп → gzip → S3-совместимое хранилище
/// (Backblaze B2 через PRIVATE_STORAGE_* env). Хранит последние 14 копий.
/// Запускается фоновым таймером API-процесса (BACKUP_ENABLED=1).

const RETENTION_DAYS = 14

type BackupEnv = {
  BACKUP_ENABLED?: string
  PRIVATE_STORAGE_BUCKET?: string
  PRIVATE_STORAGE_REGION?: string
  PRIVATE_STORAGE_ENDPOINT?: string
  PRIVATE_STORAGE_ACCESS_KEY_ID?: string
  PRIVATE_STORAGE_SECRET_ACCESS_KEY?: string
}

export function startBackupLoop(db: DbClient, env: BackupEnv): void {
  if (env.BACKUP_ENABLED !== '1' || !env.PRIVATE_STORAGE_BUCKET) return

  const run = async () => {
    try {
      await createBackup(db, env)
    } catch (error) {
      console.error('backup failed', error)
    }
  }

  // первый бэкап — через час после старта, далее раз в сутки
  setTimeout(() => {
    void run()
    const timer = setInterval(() => void run(), 24 * 60 * 60 * 1000)
    timer.unref?.()
  }, 60 * 60 * 1000).unref?.()
  console.log('backup loop armed (daily)')
}

async function createBackup(db: DbClient, env: BackupEnv): Promise<void> {
  const [
    users,
    crmStages,
    deals,
    dealHistory,
    dealComments,
    devColumns,
    devTasks,
    devTaskComments,
    sprints,
    txns,
    recurringItems,
    expectedPayments,
    bizSettings,
    monthGoals,
  ] = await Promise.all([
    db.user.findMany({ select: { id: true, email: true, displayName: true, role: true, createdAt: true } }),
    db.crmStage.findMany(),
    db.deal.findMany(),
    db.dealHistory.findMany(),
    db.dealComment.findMany(),
    db.devColumn.findMany(),
    db.devTask.findMany(),
    db.devTaskComment.findMany(),
    db.sprint.findMany(),
    db.txn.findMany(),
    db.recurringItem.findMany(),
    db.expectedPayment.findMany(),
    db.bizSettings.findMany(),
    db.monthGoal.findMany(),
  ])

  const dump = {
    createdAt: new Date().toISOString(),
    version: 2,
    tables: {
      users, // без passwordHash — секретов в дампе нет
      crmStages,
      deals,
      dealHistory,
      dealComments,
      devColumns,
      devTasks,
      devTaskComments,
      sprints,
      txns,
      recurringItems,
      expectedPayments,
      bizSettings,
      monthGoals,
    },
  }

  const gzip = Bun.gzipSync(Buffer.from(JSON.stringify(dump), 'utf8'))
  const date = new Date().toISOString().slice(0, 10)
  const key = `backups/oculus-business-${date}.json.gz`

  const s3 = new S3Client({
    region: env.PRIVATE_STORAGE_REGION ?? 'us-east-005',
    endpoint: env.PRIVATE_STORAGE_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.PRIVATE_STORAGE_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.PRIVATE_STORAGE_SECRET_ACCESS_KEY ?? '',
    },
  })

  await s3.send(
    new PutObjectCommand({
      Bucket: env.PRIVATE_STORAGE_BUCKET,
      Key: key,
      Body: gzip,
      ContentType: 'application/gzip',
    }),
  )
  console.log(`backup saved: ${key} (${(gzip.length / 1024).toFixed(1)} KB)`)

  // Ротация: храним последние 14 по дате в имени
  const list = await s3.send(
    new ListObjectsV2Command({ Bucket: env.PRIVATE_STORAGE_BUCKET, Prefix: 'backups/' }),
  )
  const keys = (list.Contents ?? [])
    .map((item) => item.Key ?? '')
    .filter((k) => k.endsWith('.json.gz'))
    .sort()
  const excess = keys.slice(0, Math.max(0, keys.length - RETENTION_DAYS))
  if (excess.length > 0) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: env.PRIVATE_STORAGE_BUCKET,
        Delete: { Objects: excess.map((k) => ({ Key: k })) },
      }),
    )
    console.log(`backup rotation removed ${excess.length} old copies`)
  }
}
