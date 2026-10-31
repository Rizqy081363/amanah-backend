-- Migration 0069 Revert: Revert Application Page Registry, Role-Page Access, and Role Lifecycle Controls

DROP TABLE IF EXISTS role_page_access;
DROP TABLE IF EXISTS application_pages;
DROP INDEX IF EXISTS idx_roles_default_audience;
DROP INDEX IF EXISTS idx_roles_is_active;
ALTER TABLE roles DROP COLUMN IF EXISTS is_default;
ALTER TABLE roles DROP COLUMN IF EXISTS is_active;
ALTER TABLE users DROP COLUMN IF EXISTS auth_version;
