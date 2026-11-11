-- Rollback Migration: 0099_add_public_site_pages_and_promotion_target_page.down.sql

-- 1. Remove public site pages from application_pages
DELETE FROM "application_pages" 
WHERE slug LIKE 'external.public_site%';

-- 2. Drop target_page_id from promotions
DROP INDEX IF EXISTS "idx_promotions_target_page";

ALTER TABLE "promotions"
  DROP COLUMN IF EXISTS "target_page_id";
