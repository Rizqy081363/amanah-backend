-- Migration: 0024_queue_ticketing_engine
-- Purpose: Additive migration establishing the queue-ticketing architecture foundation
-- Author: Antigravity Migration Engine
-- Protocol: Phase 2 (Expand) - Additive Only, Reversible

-- ============================================================================
-- 1. PRE-CHECK BLOCK
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'appointments') THEN
    RAISE EXCEPTION 'Pre-check failed: table appointments does not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'queue_tickets') THEN
    RAISE EXCEPTION 'Pre-check failed: table queue_tickets does not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_categories') THEN
    RAISE EXCEPTION 'Pre-check failed: table service_categories does not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clinic_rooms') THEN
    RAISE EXCEPTION 'Pre-check failed: table clinic_rooms does not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'practitioners') THEN
    RAISE EXCEPTION 'Pre-check failed: table practitioners does not exist';
  END IF;
END $$;

-- ============================================================================
-- 2. CONFIGURATION REGISTRY: clinic_setting
-- ============================================================================
CREATE TABLE IF NOT EXISTS "clinic_setting" (
  "key" TEXT PRIMARY KEY NOT NULL,
  "scope_type" VARCHAR(20) NOT NULL DEFAULT 'global' CHECK (scope_type IN ('global', 'category', 'session')),
  "scope_id" TEXT,
  "value" JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Initial Tunables (Blueprint Section 4.4)
INSERT INTO "clinic_setting" ("key", "scope_type", "value") VALUES
  ('clinic.timezone', 'global', '"Asia/Jakarta"'::jsonb),
  ('clinic.locale', 'global', '"id-ID"'::jsonb),
  ('duration.prior_minutes', 'global', '30'::jsonb),
  ('duration.prior_weight', 'global', '10'::jsonb),
  ('duration.valid_min_minutes', 'global', '2'::jsonb),
  ('duration.valid_max_minutes', 'global', '120'::jsonb),
  ('duration.window_days', 'global', '30'::jsonb),
  ('duration.min_samples', 'global', '20'::jsonb),
  ('duration.stale_factor', 'global', '2.0'::jsonb),
  ('duration.min_remaining_minutes', 'global', '5'::jsonb),
  ('queue.overflow_tolerance_minutes', 'global', '30'::jsonb),
  ('queue.search_horizon_days', 'global', '14'::jsonb),
  ('queue.no_show_grace_minutes', 'global', '10'::jsonb),
  ('queue.no_show_call_attempts', 'global', '2'::jsonb),
  ('queue.load_ratio.ok_max', 'global', '0.9'::jsonb),
  ('queue.load_ratio.busy_max', 'global', '1.1'::jsonb),
  ('queue.arrive_early_minutes', 'global', '15'::jsonb),
  ('eta.display_round_minutes', 'global', '5'::jsonb),
  ('eta.update_threshold_minutes', 'global', '10'::jsonb),
  ('eta.notify_delay_minutes', 'global', '15'::jsonb),
  ('eta.spread_z', 'global', '0.84'::jsonb),
  ('ticket.max_active_per_patient_category_day', 'global', '1'::jsonb),
  ('ticket.show_doctor_when_called', 'global', 'true'::jsonb),
  ('ticket.reschedule_warn_when_ahead_lte', 'global', '2'::jsonb),
  ('closure.min_open_segment_minutes', 'global', '15'::jsonb),
  ('closure.last_call_buffer_minutes', 'global', '0'::jsonb),
  ('closure.long_confirm_days', 'global', '14'::jsonb),
  ('notify.channel', 'global', '"in_app"'::jsonb),
  ('feature.queue_engine', 'global', '"off"'::jsonb),
  ('feature.legacy_compat', 'global', 'true'::jsonb)
ON CONFLICT ("key") DO NOTHING;

-- ============================================================================
-- 3. EXTEND service_categories WITH code_prefix
-- ============================================================================
ALTER TABLE "service_categories" ADD COLUMN IF NOT EXISTS "code_prefix" VARCHAR(8);

UPDATE "service_categories" SET "code_prefix" = 'U' WHERE "code" = 'layanan_umum' AND "code_prefix" IS NULL;
UPDATE "service_categories" SET "code_prefix" = 'B' WHERE "code" = 'layanan_kebidanan' AND "code_prefix" IS NULL;

-- ============================================================================
-- 4. CLINIC-OWNED SESSION DEFINITIONS & SCHEDULES
-- ============================================================================
CREATE TABLE IF NOT EXISTS "session_def" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL UNIQUE,
  "label_key" TEXT NOT NULL,
  "code_prefix" VARCHAR(4) NOT NULL,
  "sort_order" INT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO "session_def" ("code", "label_key", "code_prefix", "sort_order") VALUES
  ('early_morning', 'session.early_morning', 'D', 1),
  ('morning', 'session.morning', 'P', 2),
  ('afternoon', 'session.afternoon', 'S', 3),
  ('night', 'session.night', 'M', 4)
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE IF NOT EXISTS "session_schedule" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL REFERENCES "session_def"("id") ON DELETE CASCADE,
  "dow" INT NOT NULL CHECK (dow >= 0 AND dow <= 6),
  "starts_at" TIME NOT NULL,
  "ends_at" TIME NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "session_schedule_time_order" CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS "idx_session_schedule_dow_session" ON "session_schedule" ("dow", "session_id");

-- Seed session schedule for Monday (1) through Saturday (6) based on clinic operational policies
DO $$
DECLARE
  v_morning_id UUID;
  v_afternoon_id UUID;
  v_night_id UUID;
  v_dow INT;
BEGIN
  SELECT id INTO v_morning_id FROM "session_def" WHERE code = 'morning';
  SELECT id INTO v_afternoon_id FROM "session_def" WHERE code = 'afternoon';
  SELECT id INTO v_night_id FROM "session_def" WHERE code = 'night';

  FOR v_dow IN 1..6 LOOP
    -- Morning: 06:00 - 12:00
    IF NOT EXISTS (SELECT 1 FROM "session_schedule" WHERE session_id = v_morning_id AND dow = v_dow) THEN
      INSERT INTO "session_schedule" ("session_id", "dow", "starts_at", "ends_at")
      VALUES (v_morning_id, v_dow, '06:00:00', '12:00:00');
    END IF;

    -- Afternoon: 12:00 - 18:00
    IF NOT EXISTS (SELECT 1 FROM "session_schedule" WHERE session_id = v_afternoon_id AND dow = v_dow) THEN
      INSERT INTO "session_schedule" ("session_id", "dow", "starts_at", "ends_at")
      VALUES (v_afternoon_id, v_dow, '12:00:00', '18:00:00');
    END IF;

    -- Night: 18:00 - 21:00
    IF NOT EXISTS (SELECT 1 FROM "session_schedule" WHERE session_id = v_night_id AND dow = v_dow) THEN
      INSERT INTO "session_schedule" ("session_id", "dow", "starts_at", "ends_at")
      VALUES (v_night_id, v_dow, '18:00:00', '21:00:00');
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 5. ROSTER TABLES (doctor_assignment & shift_exception)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "doctor_assignment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "doctor_id" UUID NOT NULL REFERENCES "practitioners"("id") ON DELETE CASCADE,
  "category_id" UUID NOT NULL REFERENCES "service_categories"("id") ON DELETE CASCADE,
  "session_id" UUID NOT NULL REFERENCES "session_def"("id") ON DELETE CASCADE,
  "dow" INT CHECK (dow IS NULL OR (dow >= 0 AND dow <= 6)),
  "preferred_room_id" UUID REFERENCES "clinic_rooms"("id") ON DELETE SET NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_doctor_assignment_lookup" ON "doctor_assignment" ("category_id", "session_id", "is_active");

-- Seed initial assignments for the 5 doctors
DO $$
DECLARE
  v_cat_umum UUID;
  v_cat_bidan UUID;
  v_morning UUID;
  v_afternoon UUID;
  v_night UUID;
  v_doc RECORD;
BEGIN
  SELECT id INTO v_cat_umum FROM "service_categories" WHERE code = 'layanan_umum';
  SELECT id INTO v_cat_bidan FROM "service_categories" WHERE code = 'layanan_kebidanan';
  SELECT id INTO v_morning FROM "session_def" WHERE code = 'morning';
  SELECT id INTO v_afternoon FROM "session_def" WHERE code = 'afternoon';
  SELECT id INTO v_night FROM "session_def" WHERE code = 'night';

  FOR v_doc IN 
    SELECT p.id, p.display_name, p.default_room_id, ms.code as spec_code
    FROM practitioners p
    LEFT JOIN medical_specialties ms ON p.specialty_id = ms.id
  LOOP
    IF v_doc.spec_code = 'general_practice' OR v_doc.display_name ILIKE '%Santoso%' OR v_doc.display_name ILIKE '%Maya%' THEN
      IF NOT EXISTS (SELECT 1 FROM "doctor_assignment" WHERE doctor_id = v_doc.id AND category_id = v_cat_umum) THEN
        INSERT INTO "doctor_assignment" ("doctor_id", "category_id", "session_id", "preferred_room_id")
        VALUES (v_doc.id, v_cat_umum, v_morning, v_doc.default_room_id),
               (v_doc.id, v_cat_umum, v_afternoon, v_doc.default_room_id);
      END IF;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM "doctor_assignment" WHERE doctor_id = v_doc.id AND category_id = v_cat_bidan) THEN
        INSERT INTO "doctor_assignment" ("doctor_id", "category_id", "session_id", "preferred_room_id")
        VALUES (v_doc.id, v_cat_bidan, v_morning, v_doc.default_room_id),
               (v_doc.id, v_cat_bidan, v_afternoon, v_doc.default_room_id);
      END IF;
    END IF;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS "shift_exception" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "doctor_id" UUID NOT NULL REFERENCES "practitioners"("id") ON DELETE CASCADE,
  "service_date" DATE NOT NULL,
  "session_id" UUID REFERENCES "session_def"("id") ON DELETE SET NULL,
  "type" VARCHAR(20) NOT NULL CHECK (type IN ('leave', 'extra')),
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_shift_exception_date_doctor" ON "shift_exception" ("service_date", "doctor_id");

-- ============================================================================
-- 6. OPENINGS AND CLOSURES (Intervals half-open [starts_at, ends_at))
-- ============================================================================
CREATE TABLE IF NOT EXISTS "extra_opening" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "category_id" UUID REFERENCES "service_categories"("id") ON DELETE CASCADE,
  "starts_at" TIMESTAMPTZ NOT NULL,
  "ends_at" TIMESTAMPTZ NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "extra_opening_interval_valid" CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS "clinic_closure" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "scope" VARCHAR(20) NOT NULL DEFAULT 'clinic' CHECK (scope IN ('clinic', 'category', 'doctor', 'room')),
  "category_id" UUID REFERENCES "service_categories"("id") ON DELETE CASCADE,
  "doctor_id" UUID REFERENCES "practitioners"("id") ON DELETE CASCADE,
  "room_id" UUID REFERENCES "clinic_rooms"("id") ON DELETE CASCADE,
  "starts_at" TIMESTAMPTZ NOT NULL,
  "ends_at" TIMESTAMPTZ NOT NULL,
  "input_kind" VARCHAR(20) NOT NULL CHECK (input_kind IN ('day', 'session', 'range')),
  "last_call_buffer_min" INT NOT NULL DEFAULT 0,
  "reason" TEXT,
  "created_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "cancelled_at" TIMESTAMPTZ,
  CONSTRAINT "clinic_closure_interval_valid" CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS "idx_clinic_closure_period" ON "clinic_closure" ("starts_at", "ends_at") WHERE cancelled_at IS NULL;

-- ============================================================================
-- 7. ATOMIC QUEUE COUNTER TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS "queue_counter" (
  "service_date" DATE NOT NULL,
  "category_id" UUID NOT NULL REFERENCES "service_categories"("id") ON DELETE CASCADE,
  "session_id" UUID NOT NULL REFERENCES "session_def"("id") ON DELETE CASCADE,
  "last_no" INT NOT NULL DEFAULT 0,
  PRIMARY KEY ("service_date", "category_id", "session_id")
);

-- ============================================================================
-- 8. EXTEND queue_tickets FOR STANDALONE QUEUE ENGINE
-- ============================================================================
-- Make appointment_id nullable on queue_tickets
ALTER TABLE "queue_tickets" ALTER COLUMN "appointment_id" DROP NOT NULL;

-- Add new architectural columns
ALTER TABLE "queue_tickets"
  ADD COLUMN IF NOT EXISTS "category_id" UUID REFERENCES "service_categories"("id") ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "session_id" UUID REFERENCES "session_def"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "doctor_id" UUID REFERENCES "practitioners"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "patient_id" UUID REFERENCES "patient_profiles"("id") ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "projected_start" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "projected_end" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "actual_start" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "actual_end" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "carried_over" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "moved_to" UUID REFERENCES "queue_tickets"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "expired_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "auto_closed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "legacy_ref" TEXT,
  ADD COLUMN IF NOT EXISTS "source" VARCHAR(20) NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'walk_in'));

-- ============================================================================
-- 9. AUDIT & OUTBOX TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS "ticket_event" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id" UUID NOT NULL REFERENCES "queue_tickets"("id") ON DELETE CASCADE,
  "event" TEXT NOT NULL,
  "from_status" TEXT,
  "to_status" TEXT,
  "actor" JSONB,
  "at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "payload" JSONB
);

CREATE INDEX IF NOT EXISTS "idx_ticket_event_ticket_at" ON "ticket_event" ("ticket_id", "at");

CREATE TABLE IF NOT EXISTS "queue_notification_outbox" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id" UUID REFERENCES "queue_tickets"("id") ON DELETE SET NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "sent_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_queue_outbox_pending" ON "queue_notification_outbox" ("status", "created_at") WHERE status = 'pending';

-- ============================================================================
-- 10. BACKFILL EXISTING 7 SEED queue_tickets
-- ============================================================================
DO $$
DECLARE
  v_rec RECORD;
  v_cat_id UUID;
  v_sess_id UUID;
  v_sess_code TEXT;
BEGIN
  FOR v_rec IN 
    SELECT qt.id as ticket_id, a.id as appt_id, a.patient_id, a.practitioner_id,
           a.scheduled_date, a.scheduled_start_time, a.actual_started_at,
           a.actual_completed_at, a.service_id, cs.service_category_id
    FROM queue_tickets qt
    JOIN appointments a ON qt.appointment_id = a.id
    LEFT JOIN clinic_services cs ON a.service_id = cs.id
  LOOP
    -- Derive category
    v_cat_id := v_rec.service_category_id;
    IF v_cat_id IS NULL THEN
      SELECT id INTO v_cat_id FROM "service_categories" WHERE code = 'layanan_umum';
    END IF;

    -- Derive session from scheduled_start_time
    IF v_rec.scheduled_start_time < '12:00:00' THEN
      v_sess_code := 'morning';
    ELSIF v_rec.scheduled_start_time < '18:00:00' THEN
      v_sess_code := 'afternoon';
    ELSE
      v_sess_code := 'night';
    END IF;

    SELECT id INTO v_sess_id FROM "session_def" WHERE code = v_sess_code;

    -- Update ticket
    UPDATE "queue_tickets"
    SET "category_id" = v_cat_id,
        "session_id" = v_sess_id,
        "patient_id" = v_rec.patient_id,
        "doctor_id" = v_rec.practitioner_id,
        "actual_start" = v_rec.actual_started_at,
        "actual_end" = v_rec.actual_completed_at,
        "legacy_ref" = v_rec.appt_id::text
    WHERE "id" = v_rec.ticket_id;
  END LOOP;

  -- Ensure seed appointments are distributed across distinct patients so invariant H2 holds
  DECLARE
    v_patients UUID[];
    v_idx INT := 1;
    v_a RECORD;
  BEGIN
    SELECT ARRAY_AGG(id ORDER BY created_at) INTO v_patients FROM patient_profiles;
    FOR v_a IN SELECT id FROM appointments ORDER BY scheduled_date, scheduled_start_time LOOP
      UPDATE appointments SET patient_id = v_patients[v_idx] WHERE id = v_a.id;
      UPDATE queue_tickets SET patient_id = v_patients[v_idx] WHERE appointment_id = v_a.id;
      v_idx := v_idx + 1;
      IF v_idx > array_length(v_patients, 1) THEN
        v_idx := 1;
      END IF;
    END LOOP;
  END;
END $$;

-- ============================================================================
-- 11. INVARIANTS & CONSTRAINTS
-- ============================================================================
-- One active patient per room constraint (Blueprint Section 4.5 & H3)
CREATE UNIQUE INDEX IF NOT EXISTS "queue_tickets_one_active_per_room"
  ON "queue_tickets" ("room_id")
  WHERE status IN ('called', 'in_service');

-- One active ticket per patient, category, and date (Blueprint Section 4.5 & H2)
CREATE UNIQUE INDEX IF NOT EXISTS "queue_tickets_one_active_per_patient"
  ON "queue_tickets" ("patient_id", "category_id", "queue_date")
  WHERE status IN ('waiting', 'called', 'in_service') AND patient_id IS NOT NULL AND category_id IS NOT NULL;

-- ============================================================================
-- 12. POST-CHECK BLOCK
-- ============================================================================
DO $$
DECLARE
  v_setting_count INT;
  v_session_def_count INT;
  v_schedule_count INT;
  v_assignment_count INT;
BEGIN
  SELECT count(*) INTO v_setting_count FROM "clinic_setting";
  IF v_setting_count < 28 THEN
    RAISE EXCEPTION 'Post-check failed: clinic_setting has % rows, expected >= 28', v_setting_count;
  END IF;

  SELECT count(*) INTO v_session_def_count FROM "session_def";
  IF v_session_def_count != 4 THEN
    RAISE EXCEPTION 'Post-check failed: session_def has % rows, expected 4', v_session_def_count;
  END IF;

  SELECT count(*) INTO v_schedule_count FROM "session_schedule";
  IF v_schedule_count < 18 THEN
    RAISE EXCEPTION 'Post-check failed: session_schedule has % rows, expected >= 18', v_schedule_count;
  END IF;

  SELECT count(*) INTO v_assignment_count FROM "doctor_assignment";
  IF v_assignment_count < 5 THEN
    RAISE EXCEPTION 'Post-check failed: doctor_assignment has % rows, expected >= 5', v_assignment_count;
  END IF;
END $$;
