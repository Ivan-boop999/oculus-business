import { useState, type DragEvent } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { DevColumn, DevTask } from '@oculus-business/contracts'

export type ColumnWithTasks = DevColumn & { tasks: DevTask[] }
import { dateLabel, PRIORITY_LABELS } from '@/platform/format'

import {
  useCreateDevColumnMutation,
  useDevBoardQuery,
  useMoveDevTaskMutation,
  useUpdateDevColumnMutation,
  useDeleteDevColumnMutation,
} from './queries'
import { TaskSheet } from './TaskSheet'

const PRIORITY_BADGE_CLASS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  high: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  urgent: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
}

const TYPE_ICON: Record<string, string> = {
  bug: '🐞',
  feature: '🚀',
  idea: '💡',
}

/// Канбан доработок и багов продукта OCULUS.
export function DevBoardPage() {
  const board = useDevBoardQuery()
  const moveTask = useMoveDevTaskMutation()
  const createColumn = useCreateDevColumnMutation()
  const [selectedTask, setSelectedTask] = useState<DevTask | null>(null)
  const [createColumnId, setCreateColumnId] = useState<string | null>(null)
  const [menuColumnId, setMenuColumnId] = useState<string | null>(null)
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null)

  if (board.isPending) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Загружаем доску…</p>
  }
  if (board.isError) {
    return (
      <div className="grid gap-3 py-12 text-center">
        <p className="text-sm text-destructive">Не удалось загрузить доску задач</p>
        <Button onClick={() => void board.refetch()} variant="outline">
          Повторить
        </Button>
      </div>
    )
  }

  const columns = board.data.columns

  const onDrop = (column: ColumnWithTasks, event: DragEvent) => {
    event.preventDefault()
    setDragOverColumnId(null)
    const taskId = event.dataTransfer.getData('text/plain')
    if (!taskId) return
    if (column.tasks.some((task) => task.id === taskId)) return
    moveTask.mutate({ id: taskId, columnId: column.id, position: column.tasks.length })
  }

  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold tracking-tight text-white lg:text-2xl">Доработки и баги</h1>

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:gap-4 lg:px-0">
        {columns.map((column) => (
          <section
            className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-gradient-to-b from-white/[0.04] to-white/[0.01] transition-colors lg:w-80 ${
              dragOverColumnId === column.id
                ? 'border-[#818CF8] shadow-[0_0_32px_-6px_rgba(99,102,241,0.5)]'
                : 'border-white/6'
            }`}
            key={column.id}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOverColumnId(column.id)
            }}
            onDragLeave={() => setDragOverColumnId(null)}
            onDrop={(event) => onDrop(column, event)}
          >
            <header className="flex items-center justify-between gap-2 px-3 pt-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-[#6366F1] shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                <h2 className="truncate text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{column.title}</h2>
              </div>
              <div className="flex items-center gap-1">
                <Badge className="min-w-6 justify-center border-white/10 bg-white/5 text-[11px] text-[#C9D0E2] tabular-nums">{column.tasks.length}</Badge>
                <button
                  aria-label={`Меню колонки ${column.title}`}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setMenuColumnId(menuColumnId === column.id ? null : column.id)}
                >
                  ⋯
                </button>
              </div>
            </header>

            {menuColumnId === column.id && (
              <ColumnMenu column={column} onDone={() => setMenuColumnId(null)} />
            )}

            <div className="flex flex-1 flex-col gap-2 p-2">
              {column.tasks.map((task) => (
                <article
                  className="cursor-pointer rounded-xl border border-white/8 bg-[#101724] p-3 transition-all duration-150 hover:-translate-y-0.5 hover:border-[#6366F1]/40 hover:shadow-[0_8px_28px_-12px_rgba(99,102,241,0.45)] active:scale-[0.99]"
                  draggable
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', task.id)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm leading-snug font-medium">
                      <span className="mr-1">{TYPE_ICON[task.type] ?? '•'}</span>
                      {task.title}
                    </h3>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge className={PRIORITY_BADGE_CLASS[task.priority]}>
                      {PRIORITY_LABELS[task.priority]}
                    </Badge>
                    {task.dueDate && (
                      <Badge variant="secondary">до {dateLabel(task.dueDate)}</Badge>
                    )}
                    {task.commentsCount > 0 && <Badge variant="outline">💬 {task.commentsCount}</Badge>}
                  </div>
                </article>
              ))}
              {column.tasks.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/8 px-3 py-3 text-center text-[11px] text-muted-foreground/70">
                  Пусто
                </p>
              )}
              <Button onClick={() => setCreateColumnId(column.id)} size="sm" variant="ghost">
                + Задача
              </Button>
            </div>
          </section>
        ))}

        <div className="w-40 shrink-0 pt-3">
          <Button
            onClick={() => {
              const title = window.prompt('Название новой колонки')
              if (title && title.trim()) createColumn.mutate({ title: title.trim() })
            }}
            variant="outline"
          >
            + Колонка
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Типы: 🐞 баг · 🚀 доработка · 💡 идея. Последняя колонка считается завершающей.
      </p>

      <TaskSheet
        columnId={createColumnId}
        columns={columns}
        onClose={() => {
          setSelectedTask(null)
          setCreateColumnId(null)
        }}
        open={selectedTask !== null || createColumnId !== null}
        task={selectedTask}
      />
    </div>
  )
}

function ColumnMenu({ column, onDone }: { column: ColumnWithTasks; onDone: () => void }) {
  const updateColumn = useUpdateDevColumnMutation()
  const deleteColumn = useDeleteDevColumnMutation()

  return (
    <div className="mx-3 mt-2 grid gap-1 rounded-lg border bg-background p-2 text-sm">
      <button
        className="rounded-md px-2 py-1.5 text-left hover:bg-muted"
        onClick={() => {
          const title = window.prompt('Новое название колонки', column.title)
          if (title && title.trim()) updateColumn.mutate({ id: column.id, input: { title: title.trim() } })
          onDone()
        }}
      >
        Переименовать
      </button>
      <button
        className="rounded-md px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
        onClick={() => {
          if (window.confirm(`Удалить колонку «${column.title}»?`)) deleteColumn.mutate(column.id)
          onDone()
        }}
      >
        Удалить колонку
      </button>
    </div>
  )
}
