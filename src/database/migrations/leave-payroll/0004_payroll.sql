-- 0004_payroll.sql
-- 1. Create payroll_periods table
CREATE TABLE IF NOT EXISTS "payroll_periods" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "period_name" TEXT NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "total_payout" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  "calculated_at" TIMESTAMPTZ,
  "calculated_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "rule_version" TEXT DEFAULT 'v1.0',
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "payroll_period_dates_check" CHECK ("period_end" >= "period_start"),
  CONSTRAINT "payroll_period_status_check" CHECK ("status" IN ('draft', 'calculated', 'finalized'))
);

CREATE INDEX IF NOT EXISTS "idx_payroll_periods_dates" ON "payroll_periods" ("period_start", "period_end");

-- 2. Create payroll_entries table
CREATE TABLE IF NOT EXISTS "payroll_entries" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "payroll_period_id" UUID NOT NULL REFERENCES "payroll_periods"("id") ON DELETE CASCADE,
  "staff_profile_id" UUID NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "practitioner_id" UUID REFERENCES "practitioners"("id") ON DELETE SET NULL,
  "entry_type" VARCHAR(30) NOT NULL,
  "source_type" VARCHAR(30) NOT NULL,
  "source_id" UUID,
  "quantity_hours" NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
  "hourly_rate" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  "amount" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  "description" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "payroll_entry_type_check" CHECK ("entry_type" IN ('base_scheduled', 'leave_deduction', 'replacement_addition', 'overtime_addition')),
  CONSTRAINT "payroll_source_type_check" CHECK ("source_type" IN ('roster', 'leave_request', 'replacement_claim', 'attendance', 'manual'))
);

CREATE INDEX IF NOT EXISTS "idx_payroll_entries_period_staff"
  ON "payroll_entries" ("payroll_period_id", "staff_profile_id");
CREATE INDEX IF NOT EXISTS "idx_payroll_entries_practitioner"
  ON "payroll_entries" ("practitioner_id") WHERE "practitioner_id" IS NOT NULL;
