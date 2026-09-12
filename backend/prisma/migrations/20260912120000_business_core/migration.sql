-- CreateTable
CREATE TABLE "crm_stages" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "is_won" BOOLEAN NOT NULL DEFAULT false,
    "is_lost" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "title" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_telegram" TEXT,
    "source" TEXT,
    "one_time_amount" INTEGER NOT NULL DEFAULT 0,
    "monthly_amount" INTEGER NOT NULL DEFAULT 0,
    "stage_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "note" TEXT,
    "next_action_at" DATE,
    "next_action" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_comments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "deal_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dev_columns" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dev_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dev_tasks" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "column_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "due_date" DATE,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dev_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dev_task_comments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "task_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dev_task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "txns" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "occurred_on" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "comment" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "txns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_items" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "comment" TEXT,
    "day_of_month" INTEGER NOT NULL,
    "active_from" DATE NOT NULL,
    "active_until" DATE,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biz_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "opening_balance_date" DATE NOT NULL,
    "opening_balance" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "biz_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deals_stage_position_idx" ON "deals"("stage_id", "position");

-- CreateIndex
CREATE INDEX "deals_next_action_at_idx" ON "deals"("next_action_at");

-- CreateIndex
CREATE INDEX "deal_comments_deal_created_at_idx" ON "deal_comments"("deal_id", "created_at");

-- CreateIndex
CREATE INDEX "dev_tasks_column_position_idx" ON "dev_tasks"("column_id", "position");

-- CreateIndex
CREATE INDEX "dev_task_comments_task_created_at_idx" ON "dev_task_comments"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "txns_occurred_on_idx" ON "txns"("occurred_on");

-- CreateIndex
CREATE INDEX "txns_kind_occurred_on_idx" ON "txns"("kind", "occurred_on");

-- CreateIndex
CREATE INDEX "recurring_items_kind_idx" ON "recurring_items"("kind");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "crm_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_comments" ADD CONSTRAINT "deal_comments_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_comments" ADD CONSTRAINT "deal_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dev_tasks" ADD CONSTRAINT "dev_tasks_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "dev_columns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dev_tasks" ADD CONSTRAINT "dev_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dev_task_comments" ADD CONSTRAINT "dev_task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "dev_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dev_task_comments" ADD CONSTRAINT "dev_task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "txns" ADD CONSTRAINT "txns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

