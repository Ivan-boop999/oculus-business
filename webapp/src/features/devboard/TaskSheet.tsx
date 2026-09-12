import { useEffect, useState, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import type { DevTask, DevTaskPriority, DevTaskType } from '@oculus-business/contracts'
import { PRIORITY_LABELS, TASK_TYPE_LABELS } from '@/platform/format'

import type { ColumnWithTasks } from './DevBoardPage'

import {
  useAddDevTaskCommentMutation,
  useCreateDevTaskMutation,
  useDeleteDevTaskMutation,
  useDevTaskCommentsQuery,
  useMoveDevTaskMutation,
  useUpdateDevTaskMutation,
} from './queries'

type FormState = {
  title: string
  description: string
  type: DevTaskType
  priority: DevTaskPriority
  dueDate: string
}

const emptyForm: FormState = {
  title: '',
  description: '',
  type: 'feature',
  priority: 'medium',
  dueDate: '',
}

export function TaskSheet({
  columnId,
  columns,
  onClose,
  open,
  task,
}: {
  columnId: string | null
  columns: ColumnWithTasks[]
  onClose: () => void
  open: boolean
  task: DevTask | null
}) {
  const isCreate = task === null
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!open) return
    setError(null)
    setComment('')
    if (task !== null) {
      setForm({
        title: task.title,
        description: task.description ?? '',
        type: task.type,
        priority: task.priority,
        dueDate: task.dueDate ?? '',
      })
    } else {
      setForm(emptyForm)
    }
  }, [open, task])

  const createTask = useCreateDevTaskMutation()
  const updateTask = useUpdateDevTaskMutation()
  const moveTask = useMoveDevTaskMutation()
  const deleteTask = useDeleteDevTaskMutation()
  const comments = useDevTaskCommentsQuery(open && task !== null ? task.id : null)
  const addComment = useAddDevTaskCommentMutation(task?.id ?? '')

  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }))

  const save = async () => {
    if (!form.title.trim()) {
      setError('Укажите название')
      return
    }
    const input = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      type: form.type,
      priority: form.priority,
      dueDate: form.dueDate || null,
    }
    try {
      if (isCreate) {
        await createTask.mutateAsync({ ...input, columnId: columnId ?? undefined })
      } else if (task !== null) {
        await updateTask.mutateAsync({ id: task.id, input })
      }
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить')
    }
  }

  const column = task ? columns.find((item) => item.id === task.columnId) : undefined

  return (
    <Sheet onOpenChange={(next) => (!next ? onClose() : undefined)} open={open}>
      <SheetContent
        className="mx-auto max-h-[92svh] max-w-3xl overflow-y-auto rounded-t-2xl"
        side="bottom"
      >
        <SheetHeader className="pb-0">
          <SheetTitle>{isCreate ? 'Новая задача' : task?.title}</SheetTitle>
          {column && <Badge variant="secondary">{column.title}</Badge>}
        </SheetHeader>

        <div className="grid gap-3 px-4 pb-6">
          <Field label="Название *">
            <Input
              onChange={(event) => set({ title: event.target.value })}
              placeholder="Что сделать / что сломалось"
              value={form.title}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Тип">
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                onChange={(event) => set({ type: event.target.value as DevTaskType })}
                value={form.type}
              >
                {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Приоритет">
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                onChange={(event) => set({ priority: event.target.value as DevTaskPriority })}
                value={form.priority}
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-[1fr_150px] gap-3">
            <Field label="Дедлайн">
              <Input
                onChange={(event) => set({ dueDate: event.target.value })}
                type="date"
                value={form.dueDate}
              />
            </Field>
          </div>

          <Field label="Описание">
            <Textarea
              onChange={(event) => set({ description: event.target.value })}
              placeholder="Шаги воспроизведения, контекст, ссылки…"
              rows={3}
              value={form.description}
            />
          </Field>

          {task && (
            <Field label="Колонка">
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                onChange={(event) => {
                  const target = columns.find((item) => item.id === event.target.value)
                  if (!target) return
                  moveTask.mutate({
                    id: task.id,
                    columnId: target.id,
                    position: target.tasks.length,
                  })
                }}
                value={task.columnId}
              >
                {columns.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-2">
            <Button disabled={createTask.isPending || updateTask.isPending} onClick={() => void save()}>
              {isCreate ? 'Создать' : 'Сохранить'}
            </Button>
            <Button onClick={onClose} variant="outline">
              Отмена
            </Button>
            {task && (
              <Button
                className="ml-auto"
                onClick={() => {
                  if (window.confirm('Удалить задачу?')) {
                    deleteTask.mutate(task.id)
                    onClose()
                  }
                }}
                variant="destructive"
              >
                Удалить
              </Button>
            )}
          </div>

          {task && (
            <div className="grid gap-2 border-t pt-3">
              <h3 className="text-sm font-semibold">Обсуждение</h3>
              <div className="grid max-h-56 gap-2 overflow-y-auto">
                {comments.data?.comments.map((item) => (
                  <div className="rounded-lg bg-muted/50 px-3 py-2" key={item.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium">{item.authorName ?? 'Коллега'}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm whitespace-pre-wrap">{item.body}</p>
                  </div>
                ))}
                {comments.data?.comments.length === 0 && (
                  <p className="text-xs text-muted-foreground">Комментариев пока нет</p>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Комментарий…"
                  value={comment}
                />
                <Button
                  disabled={!comment.trim() || addComment.isPending}
                  onClick={() =>
                    addComment.mutate(comment.trim(), { onSuccess: () => setComment('') })
                  }
                  variant="secondary"
                >
                  Отправить
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
