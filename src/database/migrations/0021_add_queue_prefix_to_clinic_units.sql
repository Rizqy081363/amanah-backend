ALTER TABLE "clinic_units" ADD COLUMN IF NOT EXISTS "queue_prefix" varchar(8);
UPDATE "clinic_units" SET "queue_prefix" = 'UM' WHERE "code" = 'poli_umum' AND "queue_prefix" IS NULL;
UPDATE "clinic_units" SET "queue_prefix" = 'BD' WHERE "code" = 'poli_kia' AND "queue_prefix" IS NULL;
