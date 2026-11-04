-- Migration: 0087_add_clinic_services_image_url.down.sql
ALTER TABLE "clinic_services" DROP COLUMN IF EXISTS "image_url";
