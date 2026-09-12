import type {
  BizSettings,
  CrmBoardResponse,
  CrmStage,
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
  RecurringItem,
  Txn,
  CreateTxnRequest,
  UpdateTxnRequest,
  CreateRecurringItemRequest,
  UpdateRecurringItemRequest,
} from '@oculus-business/contracts'

/// Репозиторий бизнес-модуля: единственная точка доступа к хранилищу.
/// Возвращает контрактные DTO — слои выше не знают о Prisma.
export type BusinessRepository = {
  // CRM
  listCrmBoard(): Promise<CrmBoardResponse['stages']>
  createDeal(
    input: CreateDealRequest,
    createdById: string,
    defaultStageId: string,
  ): Promise<Deal>
  updateDeal(id: string, input: UpdateDealRequest): Promise<Deal>
  moveDeal(id: string, stageId: string, position: number): Promise<Deal>
  deleteDeal(id: string): Promise<void>
  listDealComments(dealId: string): Promise<DealComment[]>
  createDealComment(dealId: string, authorId: string, body: string): Promise<DealComment>
  createStage(input: CreateCrmStageRequest): Promise<CrmStage>
  updateStage(id: string, input: UpdateCrmStageRequest): Promise<CrmStage>
  deleteStage(id: string): Promise<void>
  firstStageId(): Promise<string | null>

  // Доска доработок
  listDevBoard(): Promise<DevBoardResponse['columns']>
  createDevTask(
    input: CreateDevTaskRequest,
    createdById: string,
    defaultColumnId: string,
  ): Promise<DevTask>
  updateDevTask(id: string, input: UpdateDevTaskRequest): Promise<DevTask>
  moveDevTask(id: string, columnId: string, position: number): Promise<DevTask>
  deleteDevTask(id: string): Promise<void>
  listDevTaskComments(taskId: string): Promise<DevTaskComment[]>
  createDevTaskComment(taskId: string, authorId: string, body: string): Promise<DevTaskComment>
  createDevColumn(input: CreateDevColumnRequest): Promise<DevColumn>
  updateDevColumn(id: string, input: UpdateDevColumnRequest): Promise<DevColumn>
  deleteDevColumn(id: string): Promise<void>
  firstDevColumnId(): Promise<string | null>

  // Финансы
  listTxns(): Promise<Txn[]>
  createTxn(input: CreateTxnRequest, createdById: string): Promise<Txn>
  updateTxn(id: string, input: UpdateTxnRequest): Promise<Txn>
  deleteTxn(id: string): Promise<void>
  listRecurring(): Promise<RecurringItem[]>
  createRecurring(input: CreateRecurringItemRequest, createdById: string): Promise<RecurringItem>
  updateRecurring(id: string, input: UpdateRecurringItemRequest): Promise<RecurringItem>
  deleteRecurring(id: string): Promise<void>
  getSettings(): Promise<BizSettings>
  saveSettings(settings: BizSettings): Promise<BizSettings>
}

export type Clock = {
  now(): Date
}
