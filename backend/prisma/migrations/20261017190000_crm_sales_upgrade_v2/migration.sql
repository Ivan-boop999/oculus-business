-- AlterTable
ALTER TABLE "biz_settings" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow';

-- AlterTable
ALTER TABLE "contact_channels" ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "deal_launches" ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "partner_company_id" UUID;

-- AlterTable
ALTER TABLE "expected_payments" ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "idempotency_records" ADD COLUMN     "state" TEXT NOT NULL DEFAULT 'completed',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "pilot_evaluations" ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "proposal_drafts" ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "delivery_proof" TEXT,
ADD COLUMN     "hold_reason" TEXT;

-- AlterTable
ALTER TABLE "sales_tasks" ADD COLUMN     "client_agreed_at" TIMESTAMP(3),
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'commercial',
ALTER COLUMN "due_at" DROP NOT NULL;

-- AlterTable
ALTER TABLE "txns" ADD COLUMN     "reversal_of_id" UUID,
ADD COLUMN     "reversal_reason" TEXT,
ADD COLUMN     "reversed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "company_facts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "claim" TEXT NOT NULL,
    "source_url" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "author_id" UUID,
    "runId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'hypothesis',
    "basis" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_agreements" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "deal_id" UUID NOT NULL,
    "partner_company_id" UUID NOT NULL,
    "partner_contact_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "rateBps" INTEGER,
    "calculation_base" TEXT,
    "period_notes" TEXT,
    "payout_trigger" TEXT,
    "document_ref" TEXT,
    "owner_id" UUID,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_facts_company_id_idx" ON "company_facts"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_agreements_deal_id_key" ON "partner_agreements"("deal_id");

-- CreateIndex
CREATE INDEX "partner_agreements_partner_idx" ON "partner_agreements"("partner_company_id");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_partner_company_id_fkey" FOREIGN KEY ("partner_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_facts" ADD CONSTRAINT "company_facts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_agreements" ADD CONSTRAINT "partner_agreements_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
