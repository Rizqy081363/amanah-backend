-- Migration 0097: Dynamic Clinic Facilities and Support FAQs
-- 1. Alter clinic_facilities: add service_id and cta_url
ALTER TABLE "clinic_facilities" 
  ADD COLUMN IF NOT EXISTS "service_id" uuid,
  ADD COLUMN IF NOT EXISTS "cta_url" text NOT NULL DEFAULT '/kontak';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_facilities_service_id_fkey'
  ) THEN
    ALTER TABLE "clinic_facilities" 
      ADD CONSTRAINT "clinic_facilities_service_id_fkey" 
      FOREIGN KEY ("service_id") REFERENCES "public"."clinic_services"("id") 
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_clinic_facilities_service_id" ON "clinic_facilities" ("service_id");

-- 2. Alter support_faqs: add service_id, category_id, paths
ALTER TABLE "support_faqs" 
  ADD COLUMN IF NOT EXISTS "service_id" uuid,
  ADD COLUMN IF NOT EXISTS "category_id" uuid,
  ADD COLUMN IF NOT EXISTS "paths" text[] NOT NULL DEFAULT '{"/"}';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_faqs_service_id_fkey'
  ) THEN
    ALTER TABLE "support_faqs" 
      ADD CONSTRAINT "support_faqs_service_id_fkey" 
      FOREIGN KEY ("service_id") REFERENCES "public"."clinic_services"("id") 
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_faqs_category_id_fkey'
  ) THEN
    ALTER TABLE "support_faqs" 
      ADD CONSTRAINT "support_faqs_category_id_fkey" 
      FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") 
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_support_faqs_service_id" ON "support_faqs" ("service_id");
CREATE INDEX IF NOT EXISTS "idx_support_faqs_category_id" ON "support_faqs" ("category_id");
