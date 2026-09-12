-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "last_stage_change_at" TIMESTAMP(3),
ADD COLUMN     "lost_reason" TEXT;

-- AlterTable
ALTER TABLE "dev_tasks" ADD COLUMN     "deal_id" UUID,
ADD COLUMN     "fix_version" TEXT,
ADD COLUMN     "sprint_id" UUID;

-- CreateTable
CREATE TABLE "deal_history" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "deal_id" UUID NOT NULL,
    "from_stage" TEXT,
    "to_stage" TEXT NOT NULL,
    "moved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sprints" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "month_goals" (
    "month" TEXT NOT NULL,
    "mrr_goal" INTEGER NOT NULL DEFAULT 0,
    "income_goal" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "month_goals_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "expected_payments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 80,
    "deal_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expected_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_history_moved_at_idx" ON "deal_history"("moved_at");

-- CreateIndex
CREATE INDEX "expected_payments_due_date_idx" ON "expected_payments"("due_date");

-- AddForeignKey
ALTER TABLE "deal_history" ADD CONSTRAINT "deal_history_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dev_tasks" ADD CONSTRAINT "dev_tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dev_tasks" ADD CONSTRAINT "dev_tasks_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expected_payments" ADD CONSTRAINT "expected_payments_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

