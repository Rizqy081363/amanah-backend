-- Migration 0098 Down: Revert modal_mode from promotions

ALTER TABLE "promotions" DROP CONSTRAINT IF EXISTS "chk_promotions_modal_mode";
ALTER TABLE "promotions" DROP COLUMN IF EXISTS "modal_mode";
