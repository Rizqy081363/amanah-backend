-- Migration 0091: Canonical Application Page UUIDs & Cascade Relationship Hardening
-- Replaces non-standard artificial UUIDs (a0000001-...) with genuine RFC 4122 v4 UUIDs generated via gen_random_uuid().

BEGIN;

-- 1. Create temporary migration mapping table
CREATE TEMP TABLE page_uuid_migration_map (
  old_id UUID PRIMARY KEY,
  new_id UUID NOT NULL DEFAULT gen_random_uuid(),
  slug VARCHAR(100) NOT NULL
) ON COMMIT DROP;

INSERT INTO page_uuid_migration_map (old_id, slug)
SELECT id, slug
FROM application_pages
WHERE id::text LIKE 'a0000001%';

-- 2. Drop existing foreign keys lacking ON UPDATE CASCADE
ALTER TABLE application_pages
  DROP CONSTRAINT IF EXISTS application_pages_parent_page_id_fkey;

ALTER TABLE role_page_access
  DROP CONSTRAINT IF EXISTS role_page_access_page_id_fkey;

-- 3. Update child pages parent references
UPDATE application_pages ap
SET parent_page_id = m.new_id
FROM page_uuid_migration_map m
WHERE ap.parent_page_id = m.old_id;

-- 4. Update role-page access references
UPDATE role_page_access rpa
SET page_id = m.new_id
FROM page_uuid_migration_map m
WHERE rpa.page_id = m.old_id;

-- 5. Update primary keys in application_pages
UPDATE application_pages ap
SET id = m.new_id,
    updated_at = NOW()
FROM page_uuid_migration_map m
WHERE ap.id = m.old_id;

-- 6. Re-create foreign keys with ON DELETE CASCADE ON UPDATE CASCADE
ALTER TABLE application_pages
  ADD CONSTRAINT application_pages_parent_page_id_fkey
    FOREIGN KEY (parent_page_id) REFERENCES application_pages(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE role_page_access
  ADD CONSTRAINT role_page_access_page_id_fkey
    FOREIGN KEY (page_id) REFERENCES application_pages(id) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
