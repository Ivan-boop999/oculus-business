import type {
  BizSettings,
  CrmBoardResponse,
  CrmStage,
  DashboardResponse,
  Deal,
  DealComment,
  CreateDealRequest,
  UpdateDealRequest,
  CreateCrmStageRequest,
  UpdateCrmStageRequest,
  DevBoardResponse,
  DevColumn,
  DevTask,
  DevTaskComment,
  CreateDevTaskRequest,
  UpdateDevTaskRequest,
  CreateDevColumnRequest,
  UpdateDevColumnRequest,
  FinanceSummary,
  ForecastResponse,
  RecurringItem,
  Txn,
  CreateTxnRequest,
  UpdateTxnRequest,
  CreateRecurringItemRequest,
  UpdateRecurringItemRequest,
} from '@oculus-business/contracts'

import { BusinessFailure } from '../domain/errors'
import {
  balanceTo,
  computeForecast,
  currentMonth,
  monthOf,
  todayKey,
} from '../domain/forecast'
import type { BusinessRepository, Clock } from './ports'

type BusinessServiceOptions = {
  clock: Clock
  repository: BusinessRepository
}

/// Сценарии использования: CRUD с валидацией ссылок + сводные вычисления на доменных функциях.
export class BusinessService {
  private readonly clock: Clock
  private readonly repository: BusinessRepository

  constructor({ clock, repository }: BusinessServiceOptions) {
    this.clock = clock
    this.repository = repository
  }

  // ---------------------------------------------------------------- CRM

  async crmBoard(): Promise<CrmBoardResponse> {
    return { stages: await this.repository.listCrmBoard() }
  }

  async createDeal(input: CreateDealRequest, createdById: string): Promise<Deal> {
    let stageId = input.stageId
    if (stageId === undefined) {
      stageId = (await this.repository.firstStageId()) ?? undefined
    }
    if (stageId === undefined) {
      throw new BusinessFailure('conflict', 'Сначала создайте хотя бы один этап воронки')
    }
    return this.repository.createDeal({ ...input, stageId }, createdById, stageId)
  }

  async updateDeal(id: string, input: UpdateDealRequest): Promise<Deal> {
    return this.repository.updateDeal(id, input)
  }

  async moveDeal(id: string, stageId: string, position: number): Promise<Deal> {
    return this.repository.moveDeal(id, stageId, position)
  }

  async deleteDeal(id: string): Promise<void> {
    await this.repository.deleteDeal(id)
  }

  async dealComments(dealId: string): Promise<DealComment[]> {
    return this.repository.listDealComments(dealId)
  }

  async addDealComment(
    dealId: string,
    authorId: string,
    body: string,
  ): Promise<DealComment[]> {
    await this.repository.createDealComment(dealId, authorId, body)
    return this.repository.listDealComments(dealId)
  }

  async createStage(input: CreateCrmStageRequest): Promise<CrmStage> {
    if (input.isWon && input.isLost) {
      throw new BusinessFailure('validation', 'Этап не может быть и победой, и отказом')
    }
    return this.repository.createStage(input)
  }

  async updateStage(id: string, input: UpdateCrmStageRequest): Promise<CrmStage> {
    return this.repository.updateStage(id, input)
  }

  async deleteStage(id: string): Promise<void> {
    await this.repository.deleteStage(id)
  }

  // ---------------------------------------------------------------- Доска доработок

  async devBoard(): Promise<DevBoardResponse> {
    return { columns: await this.repository.listDevBoard() }
  }

  async createDevTask(input: CreateDevTaskRequest, createdById: string): Promise<DevTask> {
    let columnId = input.columnId
    if (columnId === undefined) {
      columnId = (await this.repository.firstDevColumnId()) ?? undefined
    }
    if (columnId === undefined) {
      throw new BusinessFailure('conflict', 'Сначала создайте хотя бы одну колонку')
    }
    return this.repository.createDevTask({ ...input, columnId }, createdById, columnId)
  }

  async updateDevTask(id: string, input: UpdateDevTaskRequest): Promise<DevTask> {
    return this.repository.updateDevTask(id, input)
  }

  async moveDevTask(id: string, columnId: string, position: number): Promise<DevTask> {
    return this.repository.moveDevTask(id, columnId, position)
  }

  async deleteDevTask(id: string): Promise<void> {
    await this.repository.deleteDevTask(id)
  }

  async devTaskComments(taskId: string): Promise<DevTaskComment[]> {
    return this.repository.listDevTaskComments(taskId)
  }

  async addDevTaskComment(
    taskId: string,
    authorId: string,
    body: string,
  ): Promise<DevTaskComment[]> {
    await this.repository.createDevTaskComment(taskId, authorId, body)
    return this.repository.listDevTaskComments(taskId)
  }

  async createDevColumn(input: CreateDevColumnRequest): Promise<DevColumn> {
    return this.repository.createDevColumn(input)
  }

  async updateDevColumn(id: string, input: UpdateDevColumnRequest): Promise<DevColumn> {
    return this.repository.updateDevColumn(id, input)
  }

  async deleteDevColumn(id: string): Promise<void> {
    await this.repository.deleteDevColumn(id)
  }

  // ---------------------------------------------------------------- Финансы

  async txns(month?: string): Promise<{
    items: Txn[]
    recurring: RecurringItem[]
    months: string[]
  }> {
    const [all, recurring] = await Promise.all([
      this.repository.listTxns(),
      this.repository.listRecurring(),
    ])
    const sorted = [...all].sort((a, b) =>
      a.occurredOn === b.occurredOn
        ? b.createdAt.localeCompare(a.createdAt)
        : b.occurredOn.localeCompare(a.occurredOn),
    )
    const items = month === undefined ? sorted : sorted.filter((txn) => monthOf(txn.occurredOn) === month)
    const monthKeys = new Set<string>([currentMonth(this.clock.now())])
    for (const txn of all) monthKeys.add(monthOf(txn.occurredOn))
    const months = [...monthKeys].sort().reverse()
    return { items, recurring, months }
  }

  async createTxn(input: CreateTxnRequest, createdById: string): Promise<Txn> {
    return this.repository.createTxn(input, createdById)
  }

  async updateTxn(id: string, input: UpdateTxnRequest): Promise<Txn> {
    return this.repository.updateTxn(id, input)
  }

  async deleteTxn(id: string): Promise<void> {
    await this.repository.deleteTxn(id)
  }

  async recurringItems(): Promise<{ items: RecurringItem[] }> {
    const items = await this.repository.listRecurring()
    items.sort((a, b) => a.kind.localeCompare(b.kind) || a.category.localeCompare(b.category))
    return { items }
  }

  async createRecurring(input: CreateRecurringItemRequest, createdById: string): Promise<RecurringItem> {
    return this.repository.createRecurring(input, createdById)
  }

  async updateRecurring(id: string, input: UpdateRecurringItemRequest): Promise<RecurringItem> {
    return this.repository.updateRecurring(id, input)
  }

  async deleteRecurring(id: string): Promise<void> {
    await this.repository.deleteRecurring(id)
  }

  async settings(): Promise<BizSettings> {
    return this.repository.getSettings()
  }

  async saveSettings(input: BizSettings): Promise<BizSettings> {
    return this.repository.saveSettings(input)
  }

  async summary(month?: string): Promise<FinanceSummary> {
    const resolvedMonth = month ?? currentMonth(this.clock.now())
    const [txns, recurring, stages] = await Promise.all([
      this.repository.listTxns(),
      this.repository.listRecurring(),
      this.repository.listCrmBoard(),
    ])

    const monthTxns = txns.filter((txn) => monthOf(txn.occurredOn) === resolvedMonth)
    const incomeByCategoryMap = new Map<string, number>()
    const expenseByCategoryMap = new Map<string, number>()
    let income = 0
    let expense = 0
    for (const txn of monthTxns) {
      const target = txn.kind === 'income' ? incomeByCategoryMap : expenseByCategoryMap
      target.set(txn.category, (target.get(txn.category) ?? 0) + txn.amount)
      if (txn.kind === 'income') income += txn.amount
      else expense += txn.amount
    }

    let mrr = 0
    let pipelineMonthly = 0
    let pipelineOneTime = 0
    for (const stage of stages) {
      for (const deal of stage.deals) {
        if (stage.isWon) {
          mrr += deal.monthlyAmount
        } else if (!stage.isLost) {
          pipelineMonthly += deal.monthlyAmount
          pipelineOneTime += deal.oneTimeAmount
        }
      }
    }

    const now = this.clock.now()
    const today = todayKey(now)
    const settings = await this.repository.getSettings()
    let activeRecurringIncome = 0
    let activeRecurringExpense = 0
    for (const item of recurring) {
      if (item.activeFrom > today) continue
      if (item.activeUntil !== null && item.activeUntil < today) continue
      if (item.kind === 'income') activeRecurringIncome += item.amount
      else activeRecurringExpense += item.amount
    }

    return {
      month: resolvedMonth,
      income,
      expense,
      net: income - expense,
      incomeByCategory: [...incomeByCategoryMap.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
      expenseByCategory: [...expenseByCategoryMap.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
      mrr,
      pipelineMonthly,
      pipelineOneTime,
      activeRecurringIncome,
      activeRecurringExpense,
      balance: balanceTo(settings, txns, today),
    }
  }

  async forecast(horizon: number): Promise<ForecastResponse> {
    const [txns, recurring, stages, settings] = await Promise.all([
      this.repository.listTxns(),
      this.repository.listRecurring(),
      this.repository.listCrmBoard(),
      this.repository.getSettings(),
    ])
    const mrr = stages
      .filter((stage) => stage.isWon)
      .reduce((sum, stage) => sum + stage.deals.reduce((s, d) => s + d.monthlyAmount, 0), 0)
    return computeForecast({
      now: this.clock.now(),
      horizon,
      settings,
      txns,
      recurring,
      mrr,
    })
  }

  // ---------------------------------------------------------------- Дашборд

  async dashboard(): Promise<DashboardResponse> {
    const now = this.clock.now()
    const month = currentMonth(now)
    const [stages, columns, summary, forecast] = await Promise.all([
      this.repository.listCrmBoard(),
      this.repository.listDevBoard(),
      this.summary(month),
      this.forecast(1),
    ])

    let activeDeals = 0
    let wonDeals = 0
    for (const stage of stages) {
      if (stage.isWon) wonDeals += stage.deals.length
      else if (!stage.isLost) activeDeals += stage.deals.length
    }

    const nextActions = stages
      .filter((stage) => !stage.isLost)
      .flatMap((stage) =>
        stage.deals
          .filter((deal) => deal.nextActionAt !== null)
          .map((deal) => ({
            dealId: deal.id,
            dealTitle: deal.title,
            stageTitle: stage.title,
            nextAction: deal.nextAction,
            nextActionAt: deal.nextActionAt,
          })),
      )
      .sort((a, b) => (a.nextActionAt ?? '').localeCompare(b.nextActionAt ?? ''))
      .slice(0, 5)

    // Последняя колонка считается завершающей — счётчики «открытых» задач не включают её.
    const lastColumnId = columns.length > 0 ? columns[columns.length - 1].id : null
    let openTasks = 0
    let inProgressTasks = 0
    let urgentBugs = 0
    columns.forEach((column, index) => {
      if (column.id === lastColumnId) return
      openTasks += column.tasks.length
      if (index > 0) inProgressTasks += column.tasks.length
      urgentBugs += column.tasks.filter(
        (task) => task.type === 'bug' && (task.priority === 'high' || task.priority === 'urgent'),
      ).length
    })

    return {
      crm: {
        activeDeals,
        wonDeals,
        mrr: summary.mrr,
        pipelineMonthly: summary.pipelineMonthly,
        pipelineOneTime: summary.pipelineOneTime,
      },
      finance: {
        balance: summary.balance,
        monthIncome: summary.income,
        monthExpense: summary.expense,
        monthNet: summary.net,
        runwayMonths: forecast.runwayMonths,
        mode: forecast.mode,
      },
      nextActions,
      dev: { openTasks, inProgressTasks, urgentBugs },
    }
  }
}
