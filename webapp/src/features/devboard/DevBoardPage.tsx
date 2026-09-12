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
      <h1 className="text-lg font-semibold tracking-tight">Доработки и баги</h1>

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:gap-4 lg:px-0">
        {columns.map((column) => (
          <section
            className={`flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30 lg:w-80 ${
              dragOverColumnId === column.id ? 'border-primary' : ''
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
                <h2 className="truncate text-sm font-semibold">{column.title}</h2>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="secondary">{column.tasks.length}</Badge>
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
                  className="cursor-pointer rounded-lg border bg-background p-3 shadow-xs transition-shadow hover:shadow-sm active:scale-[0.99]"
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
