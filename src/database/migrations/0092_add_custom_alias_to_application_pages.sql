ALTER TABLE "application_pages" ADD COLUMN IF NOT EXISTS "custom_alias" varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_application_pages_custom_alias" 
  ON "application_pages" ("custom_alias") 
  WHERE "custom_alias" IS NOT NULL;
