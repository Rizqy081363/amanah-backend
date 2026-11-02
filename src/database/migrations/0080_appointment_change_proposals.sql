-- Migration 0080: Appointment Change Proposals and Dynamic Expiration Settings

CREATE TABLE IF NOT EXISTS appointment_change_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  proposal_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  initiator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  original_date DATE NOT NULL,
  original_session_id UUID REFERENCES session_def(id) ON DELETE SET NULL,
  proposed_date DATE,
  proposed_session_id UUID REFERENCES session_def(id) ON DELETE SET NULL,
  proposed_doctor_id UUID REFERENCES practitioners(id) ON DELETE SET NULL,
  proposed_room_id UUID REFERENCES clinic_rooms(id) ON DELETE SET NULL,
  estimated_queue_number INTEGER,
  estimated_start_at TIMESTAMPTZ,
  patient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  patient_response_at TIMESTAMPTZ,
  patient_response_notes TEXT,
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_proposal_type CHECK (proposal_type IN ('reschedule', 'cancellation')),
  CONSTRAINT chk_proposal_status CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'expired'))
);

CREATE INDEX IF NOT EXISTS appointment_change_proposals_appointment_idx
  ON appointment_change_proposals (appointment_id, status);

CREATE INDEX IF NOT EXISTS appointment_change_proposals_patient_idx
  ON appointment_change_proposals (patient_user_id, status);

CREATE INDEX IF NOT EXISTS appointment_change_proposals_pending_idx
  ON appointment_change_proposals (status, original_date);

DROP TRIGGER IF EXISTS set_appointment_change_proposals_updated_at ON appointment_change_proposals;
CREATE TRIGGER set_appointment_change_proposals_updated_at
  BEFORE UPDATE ON appointment_change_proposals
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Dynamic Settings in clinic_setting (Zero Magic Numbers)
INSERT INTO clinic_setting (key, scope_type, value, updated_at)
VALUES
  ('proposal.expiration_lead_minutes', 'global', '60'::jsonb, now()),
  ('proposal.sweeper_cron_expression', 'global', '"*/5 * * * *"'::jsonb, now()),
  ('proposal.max_pending_per_appointment', 'global', '1'::jsonb, now())
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();
