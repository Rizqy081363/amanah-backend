-- Migration 0057 (Down): Revert normalized clinic_services image_url to /healthcare prefix
UPDATE "clinic_services"
SET "image_url" = '/healthcare' || "image_url"
WHERE "image_url" LIKE '/assets/%';
