-- Migration 0096: Promotions & Announcements Module
-- Philosophy & Engineering blueprint: docs/promo/
-- Modular, relational, zero-SSRF, and configurable external broadcast

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'promo_image_type') THEN
    CREATE TYPE promo_image_type AS ENUM ('static', 'url');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modal_frequency') THEN
    CREATE TYPE modal_frequency AS ENUM ('once_per_session', 'once_per_day', 'once_per_week');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES clinic_services(id) ON DELETE SET NULL,
  title VARCHAR(80) NOT NULL,
  summary VARCHAR(160) NOT NULL,
  body VARCHAR(1000),
  terms VARCHAR(500),
  image_type promo_image_type NOT NULL,
  image_value VARCHAR(2048) NOT NULL,
  image_alt VARCHAR(150) NOT NULL,
  cta_label VARCHAR(30),
  cta_url VARCHAR(2048),
  show_banner BOOLEAN NOT NULL DEFAULT TRUE,
  show_modal BOOLEAN NOT NULL DEFAULT FALSE,
  show_section BOOLEAN NOT NULL DEFAULT TRUE,
  modal_frequency modal_frequency NOT NULL DEFAULT 'once_per_day',
  modal_delay_sec SMALLINT NOT NULL DEFAULT 3,
  priority SMALLINT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  broadcast_to_users BOOLEAN NOT NULL DEFAULT FALSE,
  broadcast_at TIMESTAMPTZ,
  broadcast_channels TEXT[] NOT NULL DEFAULT ARRAY['in_app', 'push']::TEXT[],
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_promotions_period CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CONSTRAINT chk_promotions_cta CHECK ((cta_label IS NULL) = (cta_url IS NULL)),
  CONSTRAINT chk_promotions_place CHECK (show_banner OR show_modal OR show_section),
  CONSTRAINT chk_promotions_modal_delay CHECK (modal_delay_sec BETWEEN 0 AND 30)
);

CREATE INDEX IF NOT EXISTS idx_promotions_live
  ON promotions (is_published, starts_at, ends_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_promotions_priority
  ON promotions (priority DESC, starts_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_promotions_service
  ON promotions (service_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_promotions_broadcast
  ON promotions (is_published, broadcast_to_users, broadcast_at)
  WHERE deleted_at IS NULL;
