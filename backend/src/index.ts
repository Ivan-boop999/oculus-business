import { createApp } from './app'
import { startBackupLoop } from './backups'
import { createBackendRuntime } from './runtime'
import { shutdownBackend } from './shutdown'

const runtime = createBackendRuntime()
const app = createApp({
  backgroundTasks: runtime.backgroundTasks,
  emailDelivery: runtime.emailDelivery,
  env: runtime.env,
  prisma: runtime.prisma,
  privateStorage: runtime.privateStorage,
})

// Ежедневный автобэкап бизнес-данных в S3 (включается BACKUP_ENABLED=1).
startBackupLoop(runtime.prisma, {
  BACKUP_ENABLED: process.env.BACKUP_ENABLED,
  PRIVATE_STORAGE_BUCKET: process.env.PRIVATE_STORAGE_BUCKET,
  PRIVATE_STORAGE_REGION: process.env.PRIVATE_STORAGE_REGION,
  PRIVATE_STORAGE_ENDPOINT: process.env.PRIVATE_STORAGE_ENDPOINT,
  PRIVATE_STORAGE_ACCESS_KEY_ID: process.env.PRIVATE_STORAGE_ACCESS_KEY_ID,
  PRIVATE_STORAGE_SECRET_ACCESS_KEY: process.env.PRIVATE_STORAGE_SECRET_ACCESS_KEY,
})

const server = Bun.serve({
  port: runtime.env.PORT,
  fetch: app.fetch,
})

console.log(`Backend listening on ${server.url}`)

let shuttingDown = false

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true

  console.log(`Backend received ${signal}; shutting down`)
  await shutdownBackend(
    server,
    runtime,
    runtime.env.SHUTDOWN_GRACE_SECONDS * 1000,
  )
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})
