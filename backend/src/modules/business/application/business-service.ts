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
  MonthGoal,
  CrmReport,
  MrrMovement,
  CashflowHistory,
  DealHistoryEntry,
  ExpectedPayment,
  CreateExpectedPaymentRequest,
  UpdateExpectedPaymentRequest,
  Sprint,
  CreateSprintRequest,
  Company,
  CreateCompanyRequest,
  Notifications,
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

function addMonthsLocal(month: string, count: number): string {
  const [year, mon] = month.split('-').map(Number)
  const total = year * 12 + (mon - 1) + count
  const nextYear = Math.floor(total / 12)
  const nextMon = (total % 12) + 1
  return `${nextYear}-${String(nextMon).padStart(2, '0')}`
}

export type TeamNotifier = {
  notify(message: string): Promise<void>
}

type BusinessServiceOptions = {
  clock: Clock
  notifier?: TeamNotifier
  repository: BusinessRepository
}

/// Сценарии использования: CRUD с валидацией ссылок + сводные вычисления на доменных функциях.
export class BusinessService {
  private readonly clock: Clock
  private readonly notifier: TeamNotifier | undefined
  private readonly repository: BusinessRepository

  constructor({ clock, notifier, repository }: BusinessServiceOptions) {
    this.clock = clock
    this.notifier = notifier
    this.repository = repository
  }

  // ---------------------------------------------------------------- CRM

  async crmBoard(): Promise<CrmBoardResponse> {
    return { stages: await this.repository.listCrmBoard() }
  }

  async createDeal(input: CreateDealRequest, createdById: string): Promise<Deal> {
    void this.notifier
      ?.notify(
        '🆕 Новая сделка: ' +
          input.title +
          (input.monthlyAmount > 0 ? ' (' + input.monthlyAmount + ' ₽/мес)' : ''),
      )
      .catch(() => undefined)
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
    const moved = await this.repository.moveDeal(id, stageId, position)
    const stages = await this.repository.listCrmBoard()
    const target = stages.find((stage) => stage.id === stageId)
    if (target?.isWon) {
      void this.notifier
        ?.notify(
          '🎉 Сделка выиграна: ' +
            moved.title +
            (moved.monthlyAmount > 0 ? ' (+' + moved.monthlyAmount + ' ₽/мес MRR)' : ''),
        )
        .catch(() => undefined)
    }
    return moved
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
    void this.notifier?.notify('💬 Новый комментарий по сделке').catch(() => undefined)
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

  async goal(month: string): Promise<MonthGoal> {
    return this.repository.getGoal(month)
  }

  async saveGoal(input: MonthGoal): Promise<MonthGoal> {
    return this.repository.saveGoal(input)
  }

  async saveSettings(input: BizSettings): Promise<BizSettings> {
    return this.repository.saveSettings(input)
  }

  /// Прирост MRR месяца: сумма monthlyAmount сделок, вошедших в этап-победитель
  /// в этом месяце (по DealHistory; названия won-этапов берём из текущей доски).
  async mrrDeltaOfMonth(month: string, stages: CrmBoardResponse['stages']): Promise<number> {
    const wonTitles = new Set(stages.filter((stage) => stage.isWon).map((stage) => stage.title))
    if (wonTitles.size === 0) return 0
    const nextMonth = addMonthsLocal(month, 1)
    const history = await this.repository.listHistoryInRange(
      month + '-01',
      nextMonth + '-01',
    )
    return history
      .filter((entry) => wonTitles.has(entry.toStage))
      .reduce((sum, entry) => sum + entry.monthlyAmount, 0)
  }

  async summary(month?: string): Promise<FinanceSummary> {
    const resolvedMonth = month ?? currentMonth(this.clock.now())
    const prevMonth = addMonthsLocal(resolvedMonth, -1)
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
    let prevMonthIncome = 0
    let prevMonthExpense = 0
    for (const txn of txns) {
      if (txn.occurredOn.slice(0, 7) === prevMonth) {
        if (txn.kind === 'income') prevMonthIncome += txn.amount
        else prevMonthExpense += txn.amount
      }
    }
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
      mrrDelta: await this.mrrDeltaOfMonth(resolvedMonth, stages),
      prevMonthIncome,
      prevMonthExpense,
    }
  }

  async forecast(horizon: number): Promise<ForecastResponse> {
    const [txns, recurring, stages, settings, expected] = await Promise.all([
      this.repository.listTxns(),
      this.repository.listRecurring(),
      this.repository.listCrmBoard(),
      this.repository.getSettings(),
      this.repository.listExpectedPayments(),
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
      expected: expected.map((payment) => ({
        dueDate: payment.dueDate,
        amount: payment.amount,
        probability: payment.probability,
      })),
    })
  }


  // ------------------------------------------------ Стадия 2: аналитика

  async dealHistory(dealId: string): Promise<DealHistoryEntry[]> {
    return this.repository.listDealHistory(dealId)
  }

  /// Отчёт по воронке: входы/конверсии/среднее время в этапе + причины отказов.
  async crmReport(): Promise<CrmReport> {
    const stages = await this.repository.listCrmBoard()
    const history = await this.repository.listHistoryInRange('2000-01-01', '2100-01-01')
    const now = this.clock.now()

    const durations = new Map<string, number[]>()
    const chains = new Map<string, Array<{ stage: string; at: string }>>()
    for (const entry of history) {
      const chain = chains.get(entry.dealId) ?? []
      chain.push({ stage: entry.toStage, at: entry.movedAt })
      chains.set(entry.dealId, chain)
    }
    for (const chain of chains.values()) {
      for (let index = 0; index < chain.length; index += 1) {
        const current = chain[index]!
        const next = chain[index + 1]
        const end = next ? new Date(next.at).getTime() : now.getTime()
        const days = (end - new Date(current.at).getTime()) / 86_400_000
        const list = durations.get(current.stage) ?? []
        list.push(days)
        durations.set(current.stage, list)
      }
    }

    const enteredByStage = new Map<string, number>()
    for (const entry of history) {
      enteredByStage.set(entry.toStage, (enteredByStage.get(entry.toStage) ?? 0) + 1)
    }

    const stageReports = stages.map((stage) => {
      const entered = enteredByStage.get(stage.title) ?? 0
      const movedOn = history.filter((entry) => entry.fromStage === stage.title).length
      const stageDurations = durations.get(stage.title) ?? []
      return {
        title: stage.title,
        dealsNow: stage.deals.length,
        entered,
        conversionPct: entered > 0 ? Math.round((movedOn / entered) * 100) : null,
        avgDaysInStage:
          stageDurations.length > 0
            ? Math.round(stageDurations.reduce((sum, value) => sum + value, 0) / stageDurations.length)
            : null,
      }
    })

    const wonTitles = new Set(stages.filter((stage) => stage.isWon).map((stage) => stage.title))
    const createdAtByDeal = new Map<string, string>()
    const wonAtByDeal = new Map<string, string>()
    for (const stage of stages) {
      for (const deal of stage.deals) createdAtByDeal.set(deal.id, deal.createdAt)
    }
    for (const entry of history) {
      if (wonTitles.has(entry.toStage) && !wonAtByDeal.has(entry.dealId)) {
        wonAtByDeal.set(entry.dealId, entry.movedAt)
      }
    }
    const cycles: number[] = []
    for (const [dealId, wonAt] of wonAtByDeal) {
      const createdAt = createdAtByDeal.get(dealId)
      if (createdAt) {
        cycles.push((new Date(wonAt).getTime() - new Date(createdAt).getTime()) / 86_400_000)
      }
    }

    const lostDeals = stages
      .filter((stage) => stage.isLost)
      .flatMap((stage) => stage.deals.filter((deal) => deal.lostReason))
    const reasonCounts = new Map<string, number>()
    for (const deal of lostDeals) {
      const reason = deal.lostReason ?? '—'
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
    }

    const wonDeals = stages.filter((stage) => stage.isWon).flatMap((stage) => stage.deals)

    return {
      stages: stageReports,
      avgCycleDays:
        cycles.length > 0
          ? Math.round(cycles.reduce((sum, value) => sum + value, 0) / cycles.length)
          : null,
      avgOneTimeAmount:
        wonDeals.length > 0
          ? Math.round(wonDeals.reduce((sum, deal) => sum + deal.oneTimeAmount, 0) / wonDeals.length)
          : 0,
      avgMonthlyAmount:
        wonDeals.length > 0
          ? Math.round(wonDeals.reduce((sum, deal) => sum + deal.monthlyAmount, 0) / wonDeals.length)
          : 0,
      lostReasons: [...reasonCounts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    }
  }

  /// Движение MRR по месяцам: new/churned/total на основе истории входов-выходов из won-этапов.
  async mrrMovement(horizon: number): Promise<MrrMovement> {
    const stages = await this.repository.listCrmBoard()
    const wonTitles = new Set(stages.filter((stage) => stage.isWon).map((stage) => stage.title))
    if (wonTitles.size === 0) return { months: [] }
    const history = await this.repository.listHistoryInRange('2000-01-01', '2100-01-01')
    const current = currentMonth(this.clock.now())
    const months: MrrMovement['months'] = []
    let total = 0
    for (let offset = horizon - 1; offset >= 0; offset -= 1) {
      const month = addMonthsLocal(current, -offset)
      let newMrr = 0
      let churnedMrr = 0
      for (const entry of history) {
        const entryMonth = entry.movedAt.slice(0, 7)
        if (entryMonth !== month) continue
        if (wonTitles.has(entry.toStage)) newMrr += entry.monthlyAmount
        if (entry.fromStage !== null && wonTitles.has(entry.fromStage)) churnedMrr += entry.monthlyAmount
      }
      total += newMrr - churnedMrr
      months.push({ month, newMrr, churnedMrr, totalMrr: Math.max(0, total) })
    }
    return { months }
  }

  /// Денежный поток по месяцам из фактических операций.
  async cashflowHistory(horizon: number): Promise<CashflowHistory> {
    const txns = await this.repository.listTxns()
    const current = currentMonth(this.clock.now())
    const months: CashflowHistory['months'] = []
    for (let offset = horizon - 1; offset >= 0; offset -= 1) {
      const month = addMonthsLocal(current, -offset)
      let income = 0
      let expense = 0
      for (const txn of txns) {
        if (txn.occurredOn.slice(0, 7) !== month) continue
        if (txn.kind === 'income') income += txn.amount
        else expense += txn.amount
      }
      months.push({ month, income, expense, net: income - expense })
    }
    return { months }
  }

  // ------------------------------------------------ Дебиторка

  async expectedPayments(): Promise<{ items: ExpectedPayment[] }> {
    const items = await this.repository.listExpectedPayments()
    return { items }
  }

  async createExpectedPayment(input: CreateExpectedPaymentRequest): Promise<ExpectedPayment> {
    return this.repository.createExpectedPayment(input)
  }

  async updateExpectedPayment(
    id: string,
    input: UpdateExpectedPaymentRequest,
  ): Promise<ExpectedPayment> {
    return this.repository.updateExpectedPayment(id, input)
  }

  async deleteExpectedPayment(id: string): Promise<void> {
    await this.repository.deleteExpectedPayment(id)
  }

  /// «Получено»: создаёт фактическую операцию дохода и убирает из списка ожиданий.
  async markExpectedReceived(id: string, createdById: string): Promise<void> {
    const payments = await this.repository.listExpectedPayments()
    const payment = payments.find((item) => item.id === id)
    if (!payment) throw new BusinessFailure('not_found', 'Ожидаемое поступление не найдено')
    await this.repository.createTxn(
      {
        kind: 'income',
        amount: payment.amount,
        occurredOn: payment.dueDate,
        category: 'Оплата по сделке',
        comment: payment.title,
      },
      createdById,
    )
    await this.repository.deleteExpectedPayment(id)
  }

  // ------------------------------------------------ Спринты

  async sprints(): Promise<{ items: Sprint[] }> {
    const items = await this.repository.listSprints()
    return { items }
  }

  async createSprint(input: CreateSprintRequest): Promise<Sprint> {
    return this.repository.createSprint(input)
  }

  async finishSprint(id: string): Promise<void> {
    await this.repository.finishSprint(id)
  }

  // ------------------------------------------------ Контрагенты

  async companies(): Promise<{ items: Company[] }> {
    const items = await this.repository.listCompanies()
    return { items }
  }

  async createCompany(input: CreateCompanyRequest): Promise<Company> {
    return this.repository.createCompany(input)
  }

  // ------------------------------------------------ Уведомления

  /// Просроченные действия + комментарии новее последнего «прочитано» пользователя.
  async notifications(userId: string): Promise<Notifications> {
    const now = this.clock.now()
    const today = todayKey(now)
    const lastSeen = await this.repository.getUserLastSeen(userId)
    const since = lastSeen ?? new Date(now.getTime() - 7 * 86_400_000)

    const [stages, comments] = await Promise.all([
      this.repository.listCrmBoard(),
      this.repository.listRecentComments(since, 20),
    ])

    const overdue: Notifications['items'] = []
    for (const stage of stages) {
      if (stage.isLost) continue
      for (const deal of stage.deals) {
        if (deal.nextActionAt !== null && deal.nextActionAt < today) {
          overdue.push({
            kind: 'overdue',
            title: deal.title,
            subtitle: (deal.nextAction ?? 'Просроченное действие') + ' · было до ' + deal.nextActionAt,
            at: deal.nextActionAt + 'T00:00:00.000Z',
          })
        }
      }
    }
    overdue.sort((a, b) => a.at.localeCompare(b.at))

    const commentItems: Notifications['items'] = comments.map((comment) => ({
      kind: 'comment',
      title: comment.dealTitle,
      subtitle: (comment.authorName ?? 'Коллега') + ': ' + comment.body.slice(0, 80),
      at: comment.createdAt,
    }))

    return {
      overdueCount: overdue.length,
      newCommentsCount: commentItems.length,
      items: [...overdue, ...commentItems].slice(0, 20),
    }
  }

  async markNotificationsSeen(userId: string): Promise<void> {
    await this.repository.markNotificationsSeen(userId, this.clock.now())
  }

  // ---------------------------------------------------------------- Дашборд

  async dashboard(): Promise<DashboardResponse> {
    const now = this.clock.now()
    const month = currentMonth(now)
    const [stages, columns, summary, forecast, totalTxns] = await Promise.all([
      this.repository.listCrmBoard(),
      this.repository.listDevBoard(),
      this.summary(month),
      this.forecast(1),
      this.repository.countTxns(),
    ])

    let activeDeals = 0
    let wonDeals = 0
    let totalDeals = 0
    for (const stage of stages) {
      totalDeals += stage.deals.length
      if (stage.isWon) wonDeals += stage.deals.length
      else if (!stage.isLost) activeDeals += stage.deals.length
    }

    const today = todayKey(now)
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
            overdue: (deal.nextActionAt ?? today) < today,
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
        totalDeals,
        totalTxns,
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
