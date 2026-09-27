-- Migration: 0013_appointment_call_attempts_and_notification_idempotency.sql
-- Description: Add appointment_call_attempts table and idempotency_key to notifications table

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "idempotency_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_idempotency_key_unique" 
  ON "notifications" ("idempotency_key");

CREATE TABLE IF NOT EXISTS "appointment_call_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "appointment_id" uuid NOT NULL REFERENCES "appointments"("id") ON DELETE CASCADE,
  "queue_ticket_id" uuid REFERENCES "queue_tickets"("id") ON DELETE SET NULL,
  "attempt_number" integer NOT NULL,
  "status" text DEFAULT 'called' NOT NULL,
  "called_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "called_at" timestamp with time zone DEFAULT now() NOT NULL,
  "responded_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "appointment_call_attempts_apt_idx" 
  ON "appointment_call_attempts" ("appointment_id", "attempt_number");
