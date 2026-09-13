import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { notificationsResponseSchema } from '@oculus-business/contracts'
import { useAuth } from '@/features/auth'

/// Колокольчик уведомлений: просроченные действия и новые комментарии по сделкам.
/// Опрашивает раз в минуту; «Прочитано» фиксирует момент (users.lastSeenNotificationsAt).
export function NotificationsBell() {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: ({ signal }) =>
      transport.request('/api/dashboard/notifications', notificationsResponseSchema, { signal }),
    refetchInterval: 60_000,
  })

  const seen = useMutation({
    mutationFn: () =>
      transport.raw('/api/dashboard/notifications/seen', { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const data = notifications.data
  const total = data ? data.overdueCount + data.newCommentsCount : 0

  return (
    <div className="relative" ref={wrapRef}>
      <button
        aria-label="Уведомления"
        className={`relative grid size-9 place-items-center rounded-lg border transition-colors ${
          open || total > 0
            ? 'border-[#6366F1]/40 bg-[rgba(99,102,241,0.12)] text-[#A5B4FC]'
            : 'border-white/10 bg-white/5 text-muted-foreground hover:text-white'
        }`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="text-base leading-none">🔔</span>
        {total > 0 && (
          <span className="absolute -top-1 -right-1 grid min-w-4.5 place-items-center rounded-full border border-background bg-gradient-to-br from-[#7B5CFA] to-[#4338CA] px-1 text-[10px] font-bold text-white shadow-[0_0_10px_rgba(99,102,241,0.6)] tabular-nums">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-11 right-0 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#121926] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
            <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Уведомления
            </p>
            {total > 0 && (
              <button
                className="text-[11px] text-[#A5B4FC] hover:text-white"
                disabled={seen.isPending}
                onClick={() => seen.mutate()}
              >
                Прочитано
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {notifications.isPending && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">Загружаем…</p>
            )}
            {data && data.items.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Всё прочитано — просрочек и новых комментариев нет
              </p>
            )}
            {data?.items.map((item, index) => (
              <div
                className={`rounded-xl px-3 py-2 ${item.kind === 'overdue' ? 'bg-[#F43F5E]/8' : 'bg-white/[0.03]'}`}
                key={`${item.kind}-${item.at}-${index}`}
              >
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-white">
                  <span>{item.kind === 'overdue' ? '⚠' : '💬'}</span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                </p>
                <p
                  className={`mt-0.5 line-clamp-2 text-xs leading-snug ${
                    item.kind === 'overdue' ? 'text-[#FB7185]' : 'text-muted-foreground'
                  }`}
                >
                  {item.subtitle}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
