-- Migration 0026: Enforce session_schedule master hierarchy constraint & cascade

-- 1. Cleanse existing inconsistent data (cascade deactivate weekly schedules whose master session is inactive)
UPDATE session_schedule ss
SET is_active = FALSE,
    updated_at = NOW()
FROM session_def sd
WHERE ss.session_id = sd.id
  AND sd.is_active = FALSE
  AND ss.is_active = TRUE;

-- 2. Trigger function: Guard against inserting or activating a weekly template when master session is inactive
CREATE OR REPLACE FUNCTION fn_enforce_session_schedule_master_active()
RETURNS TRIGGER AS $$
DECLARE
  v_master_is_active BOOLEAN;
BEGIN
  IF NEW.is_active = TRUE THEN
    SELECT is_active INTO v_master_is_active
    FROM session_def
    WHERE id = NEW.session_id;

    IF v_master_is_active IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Cannot activate session_schedule (id: %, session_id: %) because the master session_def is inactive',
        NEW.id, NEW.session_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_schedule_enforce_master_active ON session_schedule;
CREATE TRIGGER trg_session_schedule_enforce_master_active
BEFORE INSERT OR UPDATE OF is_active, session_id ON session_schedule
FOR EACH ROW
EXECUTE FUNCTION fn_enforce_session_schedule_master_active();

-- 3. Trigger function: Automatically cascade deactivation from session_def to session_schedule
CREATE OR REPLACE FUNCTION fn_cascade_session_def_deactivation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = FALSE AND (OLD.is_active IS DISTINCT FROM FALSE) THEN
    UPDATE session_schedule
    SET is_active = FALSE,
        updated_at = NOW()
    WHERE session_id = NEW.id
      AND is_active = TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_session_def_deactivation ON session_def;
CREATE TRIGGER trg_cascade_session_def_deactivation
AFTER UPDATE OF is_active ON session_def
FOR EACH ROW
EXECUTE FUNCTION fn_cascade_session_def_deactivation();
