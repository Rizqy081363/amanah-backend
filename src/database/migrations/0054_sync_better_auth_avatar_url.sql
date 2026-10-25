-- Migration 0054: Sync Better Auth avatar_url and safe user role synchronization
-- Description: Ensures fn_sync_better_auth_user_to_core_users references canonical users.avatar_url
-- and properly handles user synchronization without failing on column mismatches or email conflicts.

CREATE OR REPLACE FUNCTION public.fn_sync_better_auth_user_to_core_users()
RETURNS TRIGGER AS $$
DECLARE
  v_role_id uuid;
  v_role_code text;
  v_existing_id uuid;
BEGIN
  -- 1. Resolve role code (default to 'patient' for self-signup / public patient portal)
  v_role_code := CASE
    WHEN NEW.role = 'admin' THEN 'admin'
    WHEN NEW.role = 'staffDoctor' THEN 'staff_doctor'
    WHEN NEW.role = 'staffMidwife' THEN 'staff_midwife'
    WHEN NEW.role = 'staffWorker' THEN 'staff_worker'
    ELSE 'patient'
  END;

  SELECT id INTO v_role_id FROM roles WHERE code = v_role_code LIMIT 1;
  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM roles WHERE code = 'patient' LIMIT 1;
  END IF;

  -- 2. Check if a core user already exists with the same email
  SELECT id INTO v_existing_id FROM users WHERE LOWER(email) = LOWER(NEW.email) LIMIT 1;

  IF v_existing_id IS NOT NULL AND v_existing_id <> NEW.id THEN
    -- Update existing record in users and retain the established core user ID
    UPDATE users
    SET name = NEW.name,
        email_verified = NEW."emailVerified",
        avatar_url = COALESCE(users.avatar_url, NEW.image),
        status = CASE
          WHEN NEW.banned THEN 'inactive'::user_status
          WHEN NEW."emailVerified" THEN 'active'::user_status
          ELSE 'pending_verification'::user_status
        END,
        updated_at = NEW."updatedAt"
    WHERE id = v_existing_id;

    IF v_role_id IS NOT NULL THEN
      INSERT INTO user_roles (user_id, role_id)
      VALUES (v_existing_id, v_role_id)
      ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    -- Insert new core user or update by primary key ID
    INSERT INTO users (
      id,
      name,
      email,
      email_verified,
      avatar_url,
      status,
      preferred_locale,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.name,
      NEW.email,
      NEW."emailVerified",
      NEW.image,
      CASE
        WHEN NEW.banned THEN 'inactive'::user_status
        WHEN NEW."emailVerified" THEN 'active'::user_status
        ELSE 'pending_verification'::user_status
      END,
      'id-ID',
      NEW."createdAt",
      NEW."updatedAt"
    )
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        email = EXCLUDED.email,
        email_verified = EXCLUDED.email_verified,
        avatar_url = COALESCE(users.avatar_url, EXCLUDED.avatar_url),
        status = CASE
          WHEN NEW.banned THEN 'inactive'::user_status
          WHEN NEW."emailVerified" THEN 'active'::user_status
          ELSE 'pending_verification'::user_status
        END,
        updated_at = EXCLUDED.updated_at;

    IF v_role_id IS NOT NULL THEN
      INSERT INTO user_roles (user_id, role_id)
      VALUES (NEW.id, v_role_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists on "user"
DROP TRIGGER IF EXISTS trg_sync_better_auth_user ON "user";
CREATE TRIGGER trg_sync_better_auth_user
AFTER INSERT OR UPDATE ON "user"
FOR EACH ROW
EXECUTE FUNCTION fn_sync_better_auth_user_to_core_users();

-- Ensure trigger exists on users for staff_profiles avatar sync
CREATE OR REPLACE FUNCTION public.fn_sync_users_image_to_staff_profiles()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN
    UPDATE staff_profiles
    SET avatar_url = NEW.avatar_url,
        updated_at = now()
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_users_image_to_staff_profiles ON users;
CREATE TRIGGER trg_sync_users_image_to_staff_profiles
AFTER UPDATE OF avatar_url ON users
FOR EACH ROW
EXECUTE FUNCTION fn_sync_users_image_to_staff_profiles();

-- Backfill avatar_url in users from "user".image where missing
UPDATE users u
SET avatar_url = bu.image,
    updated_at = now()
FROM "user" bu
WHERE u.id = bu.id
  AND (u.avatar_url IS NULL OR u.avatar_url = '')
  AND bu.image IS NOT NULL
  AND bu.image <> '';
