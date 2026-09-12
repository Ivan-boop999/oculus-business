/// Telegram-уведомления команде (шаблонные, без ИИ). Включаются env-переменными
/// TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID; без них — тихо выключены.
export type TeamNotifier = {
  notify(message: string): Promise<void>
}

export function createTelegramNotifier(env: {
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
}): TeamNotifier {
  const token = env.TELEGRAM_BOT_TOKEN
  const chatId = env.TELEGRAM_CHAT_ID

  return {
    async notify(message: string) {
      if (!token || !chatId) return
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
          signal: AbortSignal.timeout(8_000),
        })
        if (!response.ok) {
          console.warn('telegram notify failed', response.status)
        }
      } catch (error) {
        console.warn('telegram notify error', error)
      }
    },
  }
}

export const silentNotifier: TeamNotifier = {
  async notify() {
    // выключено: токен не задан
  },
}
