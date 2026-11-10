-- Migration 0096: Down Migration

DROP TABLE IF EXISTS promotions CASCADE;
DROP TYPE IF EXISTS modal_frequency CASCADE;
DROP TYPE IF EXISTS promo_image_type CASCADE;
