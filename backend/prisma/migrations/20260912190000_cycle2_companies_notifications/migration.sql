-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "expected_payments" ADD COLUMN     "invoice_number" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_seen_notifications_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Бэкфилл: контрагенты из уникальных названий сделок + привязка.
INSERT INTO "companies" ("id", "name", "created_at", "updated_at")
SELECT gen_random_uuid(), d."title", now(), now()
FROM (SELECT DISTINCT "title" FROM "deals") d
WHERE NOT EXISTS (SELECT 1 FROM "companies" c WHERE c."name" = d."title");

UPDATE "deals" d
SET "company_id" = (SELECT c."id" FROM "companies" c WHERE c."name" = d."title")
WHERE "company_id" IS NULL;
