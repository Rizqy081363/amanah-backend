-- Down migration 0091: Canonical Application Page UUIDs & Cascade Relationship Hardening

BEGIN;

ALTER TABLE application_pages
  DROP CONSTRAINT IF EXISTS application_pages_parent_page_id_fkey;

ALTER TABLE role_page_access
  DROP CONSTRAINT IF EXISTS role_page_access_page_id_fkey;

ALTER TABLE application_pages
  ADD CONSTRAINT application_pages_parent_page_id_fkey
    FOREIGN KEY (parent_page_id) REFERENCES application_pages(id) ON DELETE CASCADE;

ALTER TABLE role_page_access
  ADD CONSTRAINT role_page_access_page_id_fkey
    FOREIGN KEY (page_id) REFERENCES application_pages(id) ON DELETE CASCADE;

COMMIT;
