ALTER TABLE "clinic_facilities" DROP CONSTRAINT IF EXISTS "clinic_facilities_service_id_fkey";
DROP INDEX IF EXISTS "idx_clinic_facilities_service_id";
ALTER TABLE "clinic_facilities" DROP COLUMN IF EXISTS "service_id", DROP COLUMN IF EXISTS "cta_url";

ALTER TABLE "support_faqs" DROP CONSTRAINT IF EXISTS "support_faqs_service_id_fkey";
ALTER TABLE "support_faqs" DROP CONSTRAINT IF EXISTS "support_faqs_category_id_fkey";
DROP INDEX IF EXISTS "idx_support_faqs_service_id";
DROP INDEX IF EXISTS "idx_support_faqs_category_id";
ALTER TABLE "support_faqs" DROP COLUMN IF EXISTS "service_id", DROP COLUMN IF EXISTS "category_id", DROP COLUMN IF EXISTS "paths";
