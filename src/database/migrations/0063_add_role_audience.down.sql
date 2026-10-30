-- Migration 0063 Down: Remove audience from roles

DROP INDEX IF EXISTS roles_audience_idx;
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_audience_check;
ALTER TABLE roles DROP COLUMN IF EXISTS audience;
