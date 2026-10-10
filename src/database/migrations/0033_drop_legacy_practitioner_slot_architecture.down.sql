-- Revert Migration 0033: Restore legacy practitioner slot architecture tables and relations

-- 1. Restore practitioner_availability
CREATE TABLE IF NOT EXISTS "practitioner_availability" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "practitioner_id" uuid NOT NULL REFERENCES "practitioners"("id") ON DELETE CASCADE,
  "day_of_week" smallint NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "practitioner_availability_day_range" CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT "practitioner_availability_time_order" CHECK (end_time > start_time),
  CONSTRAINT "practitioner_availability_effective_order" CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS "practitioner_availability_practitioner_day_idx" 
  ON "practitioner_availability" ("practitioner_id", "day_of_week", "is_active");

-- 2. Restore practitioner_schedule_day_settings
CREATE TABLE IF NOT EXISTS "practitioner_schedule_day_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "practitioner_id" uuid NOT NULL REFERENCES "practitioners"("id") ON DELETE CASCADE,
  "schedule_date" date NOT NULL,
  "is_leave" boolean NOT NULL DEFAULT false,
  "leave_reason" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "practitioner_day_settings_unique" UNIQUE ("practitioner_id", "schedule_date"),
  CONSTRAINT "practitioner_day_settings_leave_reason_not_blank" CHECK (leave_reason IS NULL OR length(trim(leave_reason)) > 0)
);

CREATE INDEX IF NOT EXISTS "practitioner_schedule_day_settings_practitioner_date_idx" 
  ON "practitioner_schedule_day_settings" ("practitioner_id", "schedule_date");

-- 3. Restore practitioner_schedule_sessions
CREATE TABLE IF NOT EXISTS "practitioner_schedule_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "practitioner_id" uuid NOT NULL REFERENCES "practitioners"("id") ON DELETE CASCADE,
  "day_setting_id" uuid REFERENCES "practitioner_schedule_day_settings"("id") ON DELETE SET NULL,
  "service_id" uuid REFERENCES "clinic_services"("id") ON DELETE SET NULL,
  "room_id" uuid REFERENCES "clinic_rooms"("id") ON DELETE SET NULL,
  "schedule_date" date NOT NULL,
  "session_label" text NOT NULL,
  "session_shift" staff_shift,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  "status" schedule_status NOT NULL DEFAULT 'open',
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "practitioner_schedule_sessions_time_order" CHECK (end_time > start_time),
  CONSTRAINT "practitioner_schedule_sessions_unique" UNIQUE ("practitioner_id", "schedule_date", "start_time")
);

CREATE INDEX IF NOT EXISTS "practitioner_schedule_sessions_date_room_idx" 
  ON "practitioner_schedule_sessions" ("schedule_date", "room_id", "status");
CREATE INDEX IF NOT EXISTS "practitioner_schedule_sessions_date_time_idx" 
  ON "practitioner_schedule_sessions" ("schedule_date", "start_time", "end_time");
CREATE INDEX IF NOT EXISTS "practitioner_schedule_sessions_practitioner_date_idx" 
  ON "practitioner_schedule_sessions" ("practitioner_id", "schedule_date", "status");

-- 4. Restore appointments.schedule_session_id
ALTER TABLE "appointments" 
  ADD COLUMN IF NOT EXISTS "schedule_session_id" uuid REFERENCES "practitioner_schedule_sessions"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "appointments_schedule_session_idx" 
  ON "appointments" ("schedule_session_id");

-- 5. Restore practitioner_leave_periods
CREATE TABLE IF NOT EXISTS "practitioner_leave_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "practitioner_id" uuid NOT NULL REFERENCES "practitioners"("id") ON DELETE CASCADE,
  "leave_request_id" uuid UNIQUE REFERENCES "staff_leave_requests"("id") ON DELETE SET NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "reason" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "practitioner_leave_periods_date_order" CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS "practitioner_leave_periods_practitioner_dates_idx" 
  ON "practitioner_leave_periods" ("practitioner_id", "start_date", "end_date");

-- 6. Restore practitioner_schedule_closures
CREATE TABLE IF NOT EXISTS "practitioner_schedule_closures" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "practitioner_id" uuid NOT NULL REFERENCES "practitioners"("id") ON DELETE CASCADE,
  "schedule_date" date NOT NULL,
  "scope" varchar(20) DEFAULT 'INTERVAL' NOT NULL,
  "context_code" varchar(30),
  "start_time" varchar(8),
  "end_time" varchar(8),
  "category" varchar(20) DEFAULT 'OTHER' NOT NULL,
  "reason_code" varchar(50) DEFAULT 'MANUAL' NOT NULL,
  "reason_text" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cancelled_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "idx_schedule_closures_practitioner_date" 
  ON "practitioner_schedule_closures" ("practitioner_id", "schedule_date");

-- 7. Restore schedule_reschedule_events
CREATE TABLE IF NOT EXISTS "schedule_reschedule_events" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "schedule_session_id" uuid,
  "practitioner_id" uuid NOT NULL REFERENCES "practitioners"("id") ON DELETE CASCADE,
  "source_date" date NOT NULL,
  "source_start_time" varchar(8) NOT NULL,
  "source_end_time" varchar(8) NOT NULL,
  "source_room_id" uuid,
  "target_date" date NOT NULL,
  "target_start_time" varchar(8) NOT NULL,
  "target_end_time" varchar(8) NOT NULL,
  "target_room_id" uuid,
  "reason_code" varchar(50),
  "reason_text" text,
  "moved_appointments_count" integer DEFAULT 0 NOT NULL,
  "performed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_schedule_reschedule_events_session" 
  ON "schedule_reschedule_events" ("schedule_session_id");
CREATE INDEX IF NOT EXISTS "idx_schedule_reschedule_events_practitioner_date" 
  ON "schedule_reschedule_events" ("practitioner_id", "target_date");

-- 8. Restore clinic_schedule_policies
CREATE TABLE IF NOT EXISTS "clinic_schedule_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" text NOT NULL UNIQUE DEFAULT 'default',
  "default_consultation_duration_minutes" integer NOT NULL DEFAULT 30,
  "default_start_precision_minutes" integer NOT NULL DEFAULT 1,
  "early_morning_start" text NOT NULL DEFAULT '00:00',
  "early_morning_end" text NOT NULL DEFAULT '06:00',
  "morning_start" text NOT NULL DEFAULT '06:00',
  "morning_end" text NOT NULL DEFAULT '12:00',
  "afternoon_start" text NOT NULL DEFAULT '12:00',
  "afternoon_end" text NOT NULL DEFAULT '18:00',
  "night_start" text NOT NULL DEFAULT '18:00',
  "night_end" text NOT NULL DEFAULT '24:00',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "clinic_schedule_policies_duration_positive" CHECK (default_consultation_duration_minutes > 0),
  CONSTRAINT "clinic_schedule_policies_precision_positive" CHECK (default_start_precision_minutes > 0)
);

INSERT INTO "clinic_schedule_policies" (
  "code",
  "default_consultation_duration_minutes",
  "default_start_precision_minutes",
  "early_morning_start",
  "early_morning_end",
  "morning_start",
  "morning_end",
  "afternoon_start",
  "afternoon_end",
  "night_start",
  "night_end"
)
VALUES (
  'default',
  30,
  1,
  '00:00',
  '06:00',
  '06:00',
  '12:00',
  '12:00',
  '18:00',
  '18:00',
  '24:00'
)
ON CONFLICT ("code") DO NOTHING;
