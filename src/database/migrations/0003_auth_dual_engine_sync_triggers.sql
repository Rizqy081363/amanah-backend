-- Trigger function to synchronize Better Auth "user" to core "users" and "user_roles"
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

DROP TRIGGER IF EXISTS trg_sync_better_auth_user ON "user";
CREATE TRIGGER trg_sync_better_auth_user
AFTER INSERT OR UPDATE ON "user"
FOR EACH ROW
EXECUTE FUNCTION fn_sync_better_auth_user_to_core_users();

-- Trigger function to synchronize Better Auth "account" credential passwords to "auth_accounts"
CREATE OR REPLACE FUNCTION fn_sync_better_auth_account_to_auth_accounts()
RETURNS TRIGGER AS $$
DECLARE
  v_email text;
BEGIN
  IF NEW."providerId" = 'credential' AND NEW.password IS NOT NULL THEN
    SELECT email INTO v_email FROM "user" WHERE id = NEW."userId";

    IF v_email IS NOT NULL THEN
      INSERT INTO auth_accounts (
        id,
        user_id,
        account_id,
        provider_id,
        password_hash,
        created_at,
        updated_at
      )
      VALUES (
        gen_random_uuid(),
        NEW."userId",
        v_email,
        'credential',
        NEW.password,
        NEW."createdAt",
        NEW."updatedAt"
      )
      ON CONFLICT (account_id, provider_id) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          password_hash = EXCLUDED.password_hash,
          updated_at = EXCLUDED.updated_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_better_auth_account ON account;
CREATE TRIGGER trg_sync_better_auth_account
AFTER INSERT OR UPDATE ON account
FOR EACH ROW
EXECUTE FUNCTION fn_sync_better_auth_account_to_auth_accounts();
