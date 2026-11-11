-- Migration 0098: Add modal_mode to promotions
-- Philosophy: Support dual modal display modes (Card Detail vs Pure Image/Flyer)
-- Default is 'card' so that all existing promotions preserve their behavior with zero regression.

ALTER TABLE "promotions" 
  ADD COLUMN IF NOT EXISTS "modal_mode" varchar(20) NOT NULL DEFAULT 'card';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_promotions_modal_mode'
  ) THEN
    ALTER TABLE "promotions" 
      ADD CONSTRAINT "chk_promotions_modal_mode" 
      CHECK ("modal_mode" IN ('card', 'image_only'));
  END IF;
END $$;
