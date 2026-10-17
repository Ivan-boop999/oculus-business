-- AlterEnum
ALTER TYPE "user_role" ADD VALUE 'agent';

-- AlterTable
ALTER TABLE "biz_settings" ADD COLUMN     "labor_hour_rate" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "cohort_version" TEXT,
ADD COLUMN     "contact_source" TEXT,
ADD COLUMN     "dnc_at" TIMESTAMP(3),
ADD COLUMN     "dnc_lifted_at" TIMESTAMP(3),
ADD COLUMN     "dnc_lifted_by_id" UUID,
ADD COLUMN     "dnc_lifted_reason" TEXT,
ADD COLUMN     "dnc_reason" TEXT,
ADD COLUMN     "dnc_scope" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "dnc_set_by_id" UUID,
ADD COLUMN     "dnc_source" TEXT,
ADD COLUMN     "do_not_contact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "exclusion_reason" TEXT,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "inn" TEXT,
ADD COLUMN     "owner_id" UUID,
ADD COLUMN     "process_description" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "relation_status" TEXT NOT NULL DEFAULT 'prospect',
ADD COLUMN     "research_source" TEXT,
ADD COLUMN     "research_status" TEXT NOT NULL DEFAULT 'selected',
ADD COLUMN     "researched_at" TIMESTAMP(3),
ADD COLUMN     "segment" TEXT,
ADD COLUMN     "selection_reason" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "crm_stages" ADD COLUMN     "code" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "semantic_type" TEXT NOT NULL DEFAULT 'other';

-- AlterTable
ALTER TABLE "deal_history" ADD COLUMN     "actor_id" UUID,
ADD COLUMN     "actor_kind" TEXT NOT NULL DEFAULT 'human',
ADD COLUMN     "event" TEXT NOT NULL DEFAULT 'moved',
ADD COLUMN     "from_stage_id" UUID,
ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "legacy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monthly_amount_snapshot" INTEGER,
ADD COLUMN     "override_reason" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "to_stage_id" UUID;

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "activation_at" TIMESTAMP(3),
ADD COLUMN     "assumptions" TEXT,
ADD COLUMN     "baseline" TEXT,
ADD COLUMN     "consequences" TEXT,
ADD COLUMN     "current_process" TEXT,
ADD COLUMN     "decision_process" TEXT,
ADD COLUMN     "desired_outcome" TEXT,
ADD COLUMN     "direction" TEXT,
ADD COLUMN     "economic_buyer_status" TEXT,
ADD COLUMN     "implementation_start_fact" DATE,
ADD COLUMN     "implementation_start_plan" DATE,
ADD COLUMN     "measurement_method" TEXT,
ADD COLUMN     "next_agreed_step" TEXT,
ADD COLUMN     "owner_id" UUID,
ADD COLUMN     "paused_reason" TEXT,
ADD COLUMN     "price_anchor" INTEGER,
ADD COLUMN     "price_reaction" TEXT,
ADD COLUMN     "priority" TEXT,
ADD COLUMN     "priority_event" TEXT,
ADD COLUMN     "problem_statement" TEXT,
ADD COLUMN     "resume_condition" TEXT,
ADD COLUMN     "resume_on" DATE,
ADD COLUMN     "scenario" TEXT,
ADD COLUMN     "selection_criteria" TEXT,
ADD COLUMN     "signed_at" DATE,
ADD COLUMN     "sub_ends_on" DATE,
ADD COLUMN     "sub_starts_on" DATE,
ADD COLUMN     "sub_status" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "tech_constraints" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "won_at" TIMESTAMP(3),
ADD COLUMN     "won_basis" TEXT,
ADD COLUMN     "won_by_id" UUID;

-- AlterTable
ALTER TABLE "expected_payments" ADD COLUMN     "received_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'expected';

-- AlterTable
ALTER TABLE "txns" ADD COLUMN     "deal_id" UUID,
ADD COLUMN     "expected_payment_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "agent_permissions" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "company_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "name" TEXT,
    "position" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "source" TEXT,
    "discovered_at" TIMESTAMP(3),
    "direct_role_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "is_legacy" BOOLEAN NOT NULL DEFAULT false,
    "legacy_deal_id" UUID,
    "note" TEXT,
    "do_not_contact" BOOLEAN NOT NULL DEFAULT false,
    "dnc_reason" TEXT,
    "dnc_at" TIMESTAMP(3),
    "dnc_scope" TEXT NOT NULL DEFAULT 'all',
    "dnc_source" TEXT,
    "dnc_set_by_id" UUID,
    "dnc_lifted_at" TIMESTAMP(3),
    "dnc_lifted_reason" TEXT,
    "dnc_lifted_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_channels" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "contact_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "is_direct" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "verified_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_contact_roles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "deal_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_contact_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_claims" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "deal_id" UUID NOT NULL,
    "field_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "source" TEXT,
    "source_activity_id" UUID,
    "note" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_id" UUID NOT NULL,

    CONSTRAINT "deal_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "deal_id" UUID,
    "contact_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "channel" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "result" TEXT,
    "note" TEXT,
    "verbatim_quote" TEXT,
    "processed_at" TIMESTAMP(3),
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_tasks" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID,
    "deal_id" UUID,
    "contact_id" UUID,
    "assignee_id" UUID NOT NULL,
    "goal" TEXT NOT NULL,
    "action" TEXT,
    "due_at" TIMESTAMP(3) NOT NULL,
    "due_timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "status" TEXT NOT NULL DEFAULT 'open',
    "completed_at" TIMESTAMP(3),
    "completed_by_id" UUID,
    "linked_activity_id" UUID,
    "commitment_type" TEXT NOT NULL DEFAULT 'internal_plan',
    "templated" BOOLEAN NOT NULL DEFAULT false,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "external_id" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sales_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_drafts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "group_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "deal_id" UUID,
    "company_id" UUID NOT NULL,
    "contact_id" UUID,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "terms" JSONB,
    "product_claims_version" TEXT,
    "evidence" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by_id" UUID NOT NULL,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "content_hash" TEXT,
    "sent_at" TIMESTAMP(3),
    "sent_by_id" UUID,
    "external_message_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "external_id" TEXT,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_evaluations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "deal_id" UUID NOT NULL,
    "goal" TEXT,
    "scope_area" TEXT,
    "product_version" TEXT,
    "terms_version" TEXT,
    "scope_in" TEXT,
    "scope_out" TEXT,
    "source_data" TEXT,
    "readiness_notes" TEXT,
    "ordix_owner_id" UUID,
    "client_owner_contact_id" UUID,
    "client_owner_name" TEXT,
    "users_overview" TEXT,
    "metrics_method" TEXT,
    "thresholds" TEXT,
    "schedule" TEXT,
    "hours_spent" INTEGER NOT NULL DEFAULT 0,
    "costs" INTEGER NOT NULL DEFAULT 0,
    "blockers" TEXT,
    "decision_due_on" DATE,
    "paid_next_step" TEXT,
    "paid_next_step_anchor" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "outcome" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pilot_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_criteria" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "pilot_id" UUID NOT NULL,
    "criterion_key" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "method" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "agreed_at" TIMESTAMP(3),
    "agreed_by_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilot_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_milestones" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "pilot_id" UUID NOT NULL,
    "side" TEXT NOT NULL,
    "commitment" TEXT NOT NULL,
    "owner_id" UUID,
    "due_on" DATE,
    "proof" TEXT,
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilot_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_launches" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "deal_id" UUID NOT NULL,
    "launch_owner_id" UUID,
    "planned_start_on" DATE,
    "actual_start_on" DATE,
    "first_scenario_accepted_on" DATE,
    "usage_issues" TEXT,
    "support_hours" INTEGER NOT NULL DEFAULT 0,
    "direct_costs" INTEGER NOT NULL DEFAULT 0,
    "value_check_due_on" DATE,
    "risk_level" TEXT NOT NULL DEFAULT 'none',
    "risk_notes" TEXT,
    "next_area" TEXT,
    "case_study_allowed" BOOLEAN NOT NULL DEFAULT false,
    "case_study_basis" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_launches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "actor_id" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_op_logs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "actor_id" UUID NOT NULL,
    "run_id" TEXT,
    "operation" TEXT NOT NULL,
    "entity_id" UUID,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_op_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_events_company_created_at_idx" ON "company_events"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "contacts_company_id_idx" ON "contacts"("company_id");

-- CreateIndex
CREATE INDEX "contact_channels_contact_id_idx" ON "contact_channels"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_channels_contact_kind_value_key" ON "contact_channels"("contact_id", "kind", "value");

-- CreateIndex
CREATE INDEX "deal_contact_roles_contact_id_idx" ON "deal_contact_roles"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "deal_contact_roles_deal_contact_role_key" ON "deal_contact_roles"("deal_id", "contact_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "deal_claims_deal_field_key" ON "deal_claims"("deal_id", "field_key");

-- CreateIndex
CREATE INDEX "activities_company_occurred_at_idx" ON "activities"("company_id", "occurred_at");

-- CreateIndex
CREATE INDEX "activities_deal_occurred_at_idx" ON "activities"("deal_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tasks_external_id_key" ON "sales_tasks"("external_id");

-- CreateIndex
CREATE INDEX "sales_tasks_assignee_status_idx" ON "sales_tasks"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "sales_tasks_due_at_idx" ON "sales_tasks"("due_at");

-- CreateIndex
CREATE INDEX "sales_tasks_company_id_idx" ON "sales_tasks"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_drafts_external_id_key" ON "proposal_drafts"("external_id");

-- CreateIndex
CREATE INDEX "proposal_drafts_company_id_idx" ON "proposal_drafts"("company_id");

-- CreateIndex
CREATE INDEX "proposal_drafts_deal_id_idx" ON "proposal_drafts"("deal_id");

-- CreateIndex
CREATE INDEX "proposal_drafts_status_idx" ON "proposal_drafts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_drafts_group_version_key" ON "proposal_drafts"("group_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "pilot_evaluations_deal_id_key" ON "pilot_evaluations"("deal_id");

-- CreateIndex
CREATE INDEX "pilot_criteria_pilot_id_idx" ON "pilot_criteria"("pilot_id");

-- CreateIndex
CREATE UNIQUE INDEX "pilot_criteria_pilot_key_version_key" ON "pilot_criteria"("pilot_id", "criterion_key", "version");

-- CreateIndex
CREATE INDEX "pilot_milestones_pilot_id_idx" ON "pilot_milestones"("pilot_id");

-- CreateIndex
CREATE UNIQUE INDEX "deal_launches_deal_id_key" ON "deal_launches"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_actor_operation_key_key" ON "idempotency_records"("actor_id", "operation", "key");

-- CreateIndex
CREATE INDEX "agent_op_logs_actor_created_at_idx" ON "agent_op_logs"("actor_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "companies_external_id_key" ON "companies"("external_id");

-- CreateIndex
CREATE INDEX "companies_domain_idx" ON "companies"("domain");

-- CreateIndex
CREATE INDEX "companies_research_status_idx" ON "companies"("research_status");

-- CreateIndex
CREATE INDEX "companies_relation_status_idx" ON "companies"("relation_status");

-- CreateIndex
CREATE INDEX "crm_stages_semantic_type_idx" ON "crm_stages"("semantic_type");

-- CreateIndex
CREATE UNIQUE INDEX "deal_history_idempotency_key_key" ON "deal_history"("idempotency_key");

-- CreateIndex
CREATE INDEX "deal_history_to_stage_id_moved_at_idx" ON "deal_history"("to_stage_id", "moved_at");

-- CreateIndex
CREATE INDEX "deals_owner_id_idx" ON "deals"("owner_id");

-- CreateIndex
CREATE INDEX "deals_sub_status_idx" ON "deals"("sub_status");

-- CreateIndex
CREATE INDEX "expected_payments_status_idx" ON "expected_payments"("status");

-- CreateIndex
CREATE INDEX "txns_deal_id_idx" ON "txns"("deal_id");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_events" ADD CONSTRAINT "company_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_contact_roles" ADD CONSTRAINT "deal_contact_roles_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_contact_roles" ADD CONSTRAINT "deal_contact_roles_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_claims" ADD CONSTRAINT "deal_claims_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_drafts" ADD CONSTRAINT "proposal_drafts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_drafts" ADD CONSTRAINT "proposal_drafts_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_drafts" ADD CONSTRAINT "proposal_drafts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_evaluations" ADD CONSTRAINT "pilot_evaluations_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_evaluations" ADD CONSTRAINT "pilot_evaluations_ordix_owner_id_fkey" FOREIGN KEY ("ordix_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_criteria" ADD CONSTRAINT "pilot_criteria_pilot_id_fkey" FOREIGN KEY ("pilot_id") REFERENCES "pilot_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_milestones" ADD CONSTRAINT "pilot_milestones_pilot_id_fkey" FOREIGN KEY ("pilot_id") REFERENCES "pilot_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_launches" ADD CONSTRAINT "deal_launches_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_launches" ADD CONSTRAINT "deal_launches_launch_owner_id_fkey" FOREIGN KEY ("launch_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "txns" ADD CONSTRAINT "txns_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "txns" ADD CONSTRAINT "txns_expected_payment_id_fkey" FOREIGN KEY ("expected_payment_id") REFERENCES "expected_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
