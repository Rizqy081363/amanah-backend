-- Migration 0058 (Down): Revert canonical portal paths back to legacy /dashboard

-- 1. Revert clinic portal url
UPDATE "notification_actions"
SET "url" = REPLACE("url", '/klinik', '/dashboard/klinik')
WHERE "url" LIKE '%/klinik%';

-- 2. Revert admin portal url
UPDATE "notification_actions"
SET "url" = REPLACE("url", '/admin', '/dashboard')
WHERE "url" LIKE '%/admin%';

-- 3. Revert clinic portal metadata JSONB
UPDATE "notifications"
SET "metadata" = regexp_replace("metadata"::text, '/klinik', '/dashboard/klinik', 'g')::jsonb
WHERE "metadata"::text LIKE '%/klinik%';

-- 4. Revert admin portal metadata JSONB
UPDATE "notifications"
SET "metadata" = regexp_replace("metadata"::text, '/admin', '/dashboard', 'g')::jsonb
WHERE "metadata"::text LIKE '%/admin%';
