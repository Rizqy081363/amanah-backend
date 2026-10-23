-- Migration: 0005_sync_oauth_avatar.sql
-- Description: Propagates OAuth profile image from Better Auth "user" to canonical "users"."avatar_url",
-- and keeps "staff_profiles"."avatar_url" synchronized with "users"."avatar_url".

-- 1. Update fn_sync_better_auth_user_to_core_users to synchronize image -> avatar_url
CREATE OR REPLACE FUNCTION fn_sync_better_auth_user_to_core_users()
RETURNS TRIGGER AS $$
DECLARE
  v_role_id uuid;
  v_role_code text;
BEGIN
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger function to automatically keep staff_profiles.avatar_url in sync with users.avatar_url
CREATE OR REPLACE FUNCTION fn_sync_users_image_to_staff_profiles()
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
