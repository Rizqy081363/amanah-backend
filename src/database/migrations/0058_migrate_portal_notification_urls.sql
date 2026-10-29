-- Migration 0058: Migrate legacy /dashboard URLs to role-based portal paths (/admin and /klinik)
-- Description: Normalizes legacy /dashboard paths in notification_actions and notifications metadata to canonical /admin and /klinik routes.

-- 1. Update notification_actions url for clinic portal
UPDATE "notification_actions"
SET "url" = REPLACE("url", '/dashboard/klinik', '/klinik')
WHERE "url" LIKE '%/dashboard/klinik%';

-- 2. Update notification_actions url for admin portal
UPDATE "notification_actions"
SET "url" = REPLACE("url", '/dashboard', '/admin')
WHERE "url" LIKE '%/dashboard%';

-- 3. Update notifications metadata JSONB for clinic portal
UPDATE "notifications"
SET "metadata" = regexp_replace("metadata"::text, '/dashboard/klinik', '/klinik', 'g')::jsonb
WHERE "metadata"::text LIKE '%/dashboard/klinik%';

-- 4. Update notifications metadata JSONB for admin portal
UPDATE "notifications"
SET "metadata" = regexp_replace("metadata"::text, '/dashboard', '/admin', 'g')::jsonb
WHERE "metadata"::text LIKE '%/dashboard%';

-- 5. Normalize legacy Indonesian slug /admin/penggajian to canonical /admin/payroll
UPDATE "notification_actions"
SET "url" = REPLACE("url", '/admin/penggajian', '/admin/payroll')
WHERE "url" LIKE '%/admin/penggajian%';

UPDATE "notifications"
SET "metadata" = regexp_replace("metadata"::text, '/admin/penggajian', '/admin/payroll', 'g')::jsonb
WHERE "metadata"::text LIKE '%/admin/penggajian%';

-- 6. Normalize legacy antrean-pasien paths based on recipient audience
UPDATE "notification_actions" na
SET "url" = '/klinik/antrean'
FROM "notifications" n
WHERE na.notification_id = n.id
  AND na.url LIKE '%antrean-pasien%'
  AND n.audience = 'patient';

UPDATE "notification_actions" na
SET "url" = '/admin/appointment-pasien'
FROM "notifications" n
WHERE na.notification_id = n.id
  AND na.url LIKE '%antrean-pasien%'
  AND (n.audience = 'clinic' OR n.audience IS NULL);
