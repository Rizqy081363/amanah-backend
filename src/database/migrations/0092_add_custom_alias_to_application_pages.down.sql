DROP INDEX IF EXISTS "idx_application_pages_custom_alias";
ALTER TABLE "application_pages" DROP COLUMN IF EXISTS "custom_alias";
