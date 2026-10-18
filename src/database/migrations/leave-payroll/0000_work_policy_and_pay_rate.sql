-- 0000_work_policy_and_pay_rate.sql
-- 1. Create leave_policy table
CREATE TABLE IF NOT EXISTS "leave_policy" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "approval_required" BOOLEAN NOT NULL DEFAULT TRUE,
  "limit_mode" VARCHAR(20) NOT NULL DEFAULT 'monthly_limit',
  "monthly_limit" INT NOT NULL DEFAULT 3,
  "quota_counting_policy" VARCHAR(30) NOT NULL DEFAULT 'per_request',
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "effective_from" DATE NOT NULL DEFAULT CURRENT_DATE,
  "effective_to" DATE,
  "updated_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "leave_policy_limit_mode_check" CHECK ("limit_mode" IN ('unlimited', 'monthly_limit')),
  CONSTRAINT "leave_policy_quota_policy_check" CHECK ("quota_counting_policy" IN ('per_request', 'per_session'))
);

CREATE INDEX IF NOT EXISTS "idx_leave_policy_active" ON "leave_policy" ("is_active", "effective_from" DESC);

-- 2. Create compensation_rates table
CREATE TABLE IF NOT EXISTS "compensation_rates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "category" VARCHAR(30) NOT NULL,
  "hourly_rate" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  "overtime_hourly_rate" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  "effective_from" DATE NOT NULL DEFAULT CURRENT_DATE,
  "effective_to" DATE,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "notes" TEXT,
  "created_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "compensation_rates_category_check" CHECK ("category" IN ('doctor', 'midwife', 'worker')),
  CONSTRAINT "compensation_rates_rates_check" CHECK ("hourly_rate" >= 0 AND "overtime_hourly_rate" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_compensation_rates_active_category"
  ON "compensation_rates" ("category") WHERE "is_active" = TRUE;
