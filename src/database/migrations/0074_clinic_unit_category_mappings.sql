CREATE TABLE IF NOT EXISTS "clinic_unit_category_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "unit_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "clinic_unit_category_mappings_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "clinic_units"("id") ON DELETE CASCADE,
  CONSTRAINT "clinic_unit_category_mappings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE CASCADE,
  CONSTRAINT "clinic_unit_category_mappings_unique" UNIQUE ("unit_id", "category_id")
);

CREATE INDEX IF NOT EXISTS "idx_clinic_unit_category_mappings_unit_id" ON "clinic_unit_category_mappings" ("unit_id");
CREATE INDEX IF NOT EXISTS "idx_clinic_unit_category_mappings_category_id" ON "clinic_unit_category_mappings" ("category_id");

-- Backfill existing categories
INSERT INTO "clinic_unit_category_mappings" ("id", "unit_id", "category_id", "is_primary")
SELECT gen_random_uuid(), "unit_id", "id", true
FROM "service_categories"
WHERE "unit_id" IS NOT NULL
ON CONFLICT DO NOTHING;
