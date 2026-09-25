-- Migration: 0012_schedule_closures_and_reschedule_events.sql
-- Description: Range-based non-leave schedule closures and structured reschedule events

CREATE TABLE IF NOT EXISTS "practitioner_schedule_closures" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "practitioner_id" uuid NOT NULL REFERENCES "practitioners"("id") ON DELETE CASCADE,
  "schedule_date" date NOT NULL,
  "scope" varchar(20) DEFAULT 'INTERVAL' NOT NULL, -- 'DAY', 'CONTEXT', 'INTERVAL'
  "context_code" varchar(30), -- 'early_morning', 'morning', 'afternoon', 'night'
  "start_time" varchar(8), -- 'HH:mm' or 'HH:mm:ss'
  "end_time" varchar(8),   -- 'HH:mm' or 'HH:mm:ss'
  "category" varchar(20) DEFAULT 'OTHER' NOT NULL, -- 'OTHER' (non-leave)
  "reason_code" varchar(50) DEFAULT 'MANUAL' NOT NULL, -- 'MEETING', 'EMERGENCY', 'CLINIC_CLOSED', 'MANUAL', 'OTHER'
  "reason_text" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cancelled_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "idx_schedule_closures_practitioner_date" 
  ON "practitioner_schedule_closures" ("practitioner_id", "schedule_date");

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
  "performed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_schedule_reschedule_events_session" 
  ON "schedule_reschedule_events" ("schedule_session_id");

CREATE INDEX IF NOT EXISTS "idx_schedule_reschedule_events_practitioner_date" 
  ON "schedule_reschedule_events" ("practitioner_id", "target_date");
