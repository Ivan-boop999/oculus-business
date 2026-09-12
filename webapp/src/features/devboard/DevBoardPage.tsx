import { useState, type DragEvent } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { DevColumn, DevTask } from '@oculus-business/contracts'
import { PRIORITY_LABELS } from '@/platform/format'

import { useAuth } from '@/features/auth'
import {
  useCreateDevColumnMutation,
  useCreateSprintMutation,
  useDeleteDevColumnMutation,
  useDevBoardQuery,
  useMoveDevTaskMutation,
  useSprintsQuery,
  useUpdateDevColumnMutation,
  finishSprint,
} from './queries'
import { TaskSheet } from './TaskSheet'

export type ColumnWithTasks = DevColumn & { tasks: DevTask[] }

const PRIORITY_BADGE_CLASS: Record<string, string> = {
  low: 'border-white/10 bg-white/5 text-muted-foreground',
  medium: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  high: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  urgent: 'border-[#F43F5E]/25 bg-[#F43F5E]/10 text-[#FB7185]',
}

const TYPE_ICON: Record<string, string> = {
  bug: '🐞',
  feature: '🚀',
  idea: '💡',
}

/// Канбан доработок и багов продукта OCULUS: режимы «Доска» (колонки с drag&drop,
/// фильтры по версии и спринту) и «Релизы» (группировка по версиям + changelog).
export function DevBoardPage() {
  const board = useDevBoardQuery()
  const sprints = useSprintsQuery()
  const moveTask = useMoveDevTaskMutation()
  const createColumn = useCreateDevColumnMutation()
  const createSprint = useCreateSprintMutation()
  const { transport } = useAuth()
  const [view, setView] = useState<'board' | 'releases'>('board')
  const [versionFilter, setVersionFilter] = useState('')
  const [sprintFilter, setSprintFilter] = useState(false)
  const [selectedTask, setSelectedTask] = useState<DevTask | null>(null)
  const [createColumnId, setCreateColumnId] = useState<string | null>(null)
  const [menuColumnId, setMenuColumnId] = useState<string | null>(null)
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null)
  const [copiedVersion, setCopiedVersion] = useState<string | null>(null)

  if (board.isPending) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Загружаем доску…</p>
  }
  if (board.isError) {
    return (
      <div className="grid gap-3 py-12 text-center">
        <p className="text-sm text-[#FB7185]">Не удалось загрузить доску задач</p>
        <Button onClick={() => void board.refetch()} variant="outline">
          Повторить
        </Button>
      </div>
    )
  }

  const columns = board.data.columns
  const allTasks = columns.flatMap((column) => column.tasks)
  const versions = [...new Set(allTasks.map((task) => task.fixVersion).filter((v): v is string => v !== null))].sort()
  const activeSprint = (sprints.data?.items ?? []).find((sprint) => sprint.isActive) ?? null

  const taskMatches = (task: DevTask) => {
    if (versionFilter && task.fixVersion !== versionFilter) return false
    if (sprintFilter && activeSprint && task.sprintId !== activeSprint.id) return false
    if (sprintFilter && !activeSprint) return false
    return true
  }

  const visibleColumns: ColumnWithTasks[] = columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter(taskMatches),
  }))

  const onDrop = (column: ColumnWithTasks, event: DragEvent) => {
    event.preventDefault()
    setDragOverColumnId(null)
    const taskId = event.dataTransfer.getData('text/plain')
    if (!taskId) return
    if (column.tasks.some((task) => task.id === taskId)) return
    moveTask.mutate({ id: taskId, columnId: column.id, position: column.tasks.length })
  }

  const copyChangelog = async (version: string) => {
    const tasks = allTasks.filter((task) => task.fixVersion === version)
    const lines = [`Окулус — версия ${version}`, '']
    const bugs = tasks.filter((task) => task.type === 'bug')
    const features = tasks.filter((task) => task.type === 'feature')
    if (features.length > 0) {
      lines.push('Новое:')
      features.forEach((task) => lines.push(`• ${task.title}`))
    }
    if (bugs.length > 0) {
      lines.push('', 'Исправлено:')
      bugs.forEach((task) => lines.push(`• ${task.title}`))
    }
    await navigator.clipboard.writeText(lines.join('\n'))
    setCopiedVersion(version)
    setTimeout(() => setCopiedVersion(null), 2000)
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight text-white lg:text-2xl">
          Доработки и баги
        </h1>
        <div className="flex overflow-hidden rounded-lg border border-white/10">
          <button
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'board'
                ? 'bg-[rgba(99,102,241,0.15)] text-[#A5B4FC]'
                : 'text-muted-foreground hover:text-white'
            }`}
            onClick={() => setView('board')}
          >
            Доска
          </button>
          <button
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'releases'
                ? 'bg-[rgba(99,102,241,0.15)] text-[#A5B4FC]'
                : 'text-muted-foreground hover:text-white'
            }`}
            onClick={() => setView('releases')}
          >
            Релизы
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Версия"
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          onChange={(event) => setVersionFilter(event.target.value)}
          value={versionFilter}
        >
          <option value="">Все версии</option>
          {versions.map((version) => (
            <option key={version} value={version}>
              {version}
            </option>
          ))}
        </select>
        <button
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            sprintFilter
              ? 'border-[#6366F1]/40 bg-[#6366F1]/15 text-[#A5B4FC]'
              : 'border-white/10 bg-white/5 text-muted-foreground hover:text-white'
          }`}
          onClick={() => setSprintFilter((value) => !value)}
          title={activeSprint ? `Текущий: ${activeSprint.name}` : 'Нет активного спринта'}
        >
          Текущий спринт
        </button>
        {activeSprint ? (
          <button
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-white"
            onClick={() => {
              if (window.confirm(`Завершить спринт «${activeSprint.name}»?`)) {
                void finishSprint(transport, activeSprint.id)
              }
            }}
          >
            Завершить спринт
          </button>
        ) : (
          <button
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-white"
            onClick={() => {
              const name = window.prompt('Название спринта', `Спринт ${(sprints.data?.items.length ?? 0) + 1}`)
              if (!name || !name.trim()) return
              const start = new Date()
              const end = new Date(Date.now() + 14 * 86_400_000)
              createSprint.mutate({
                name: name.trim(),
                startsOn: start.toISOString().slice(0, 10),
                endsOn: end.toISOString().slice(0, 10),
              })
            }}
          >
            + Спринт
          </button>
        )}
      </div>

      {view === 'releases' ? (
        <div className="grid gap-3">
          {versions.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-muted-foreground">
              Задач с версией пока нет — откройте задачу и укажите «Версию (релиз)».
            </p>
          )}
          {versions.map((version) => {
            const tasks = allTasks.filter((task) => task.fixVersion === version)
            return (
              <section
                className="rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4"
                key={version}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span className="rounded-md border border-[#6366F1]/30 bg-[#6366F1]/12 px-2 py-0.5 text-xs text-[#A5B4FC] tabular-nums">
                      v{version}
                    </span>
                    <Badge variant="secondary" className="border-white/10 bg-white/5">
                      {tasks.length} задач
                    </Badge>
                  </h2>
                  <button
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-[#6366F1]/40 hover:text-white"
                    onClick={() => void copyChangelog(version)}
                  >
                    {copiedVersion === version ? '✓ Скопировано' : 'Скопировать changelog'}
                  </button>
                </div>
                <div className="grid gap-1.5">
                  {tasks.map((task) => (
                    <button
                      className="flex items-center gap-2.5 rounded-xl border border-white/6 bg-[#101724] px-3 py-2 text-left text-sm transition-all hover:border-[#6366F1]/35"
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                    >
                      <span>{TYPE_ICON[task.type] ?? '•'}</span>
                      <span className="min-w-0 flex-1 truncate text-white">{task.title}</span>
                      <Badge className={PRIORITY_BADGE_CLASS[task.priority]}>
                        {PRIORITY_LABELS[task.priority]}
                      </Badge>
                      {task.dealTitle && (
                        <Badge variant="outline" className="hidden border-white/10 text-muted-foreground sm:inline-flex">
                          {task.dealTitle}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:gap-4 lg:px-0">
          {visibleColumns.map((column) => (
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
                      {task.fixVersion && (
                        <Badge variant="secondary" className="border-[#6366F1]/25 bg-[#6366F1]/10 text-[#A5B4FC] tabular-nums">
                          v{task.fixVersion}
                        </Badge>
                      )}
                      {task.dealTitle && <Badge variant="outline" className="max-w-40 border-white/10 text-muted-foreground">{task.dealTitle}</Badge>}
                      {task.dueDate && (
                        <Badge variant="secondary">до {task.dueDate.slice(8)}.{task.dueDate.slice(5, 7)}</Badge>
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
      )}

      {view === 'board' && (
        <p className="text-xs text-muted-foreground lg:hidden">
          Типы: 🐞 баг · 🚀 доработка · 💡 идея. Последняя колонка считается завершающей.
        </p>
      )}

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

function ColumnMenu({ column, onDone }: { column: DevColumn; onDone: () => void }) {
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
