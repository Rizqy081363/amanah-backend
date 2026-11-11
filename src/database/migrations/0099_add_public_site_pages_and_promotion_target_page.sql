-- Migration: 0099_add_public_site_pages_and_promotion_target_page.sql
-- Description:
-- 1. Add target_page_id column to promotions table referencing application_pages(id)
-- 2. Seed canonical public site landing pages in application_pages registry (external audience) using native gen_random_uuid()

-- ============================================================================
-- 1. ALTER TABLE promotions (Add Foreign Key to application_pages)
-- ============================================================================
ALTER TABLE "promotions"
  ADD COLUMN IF NOT EXISTS "target_page_id" UUID REFERENCES "application_pages"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_promotions_target_page" ON "promotions"("target_page_id");

-- ============================================================================
-- 2. SEED CANONICAL PUBLIC SITE LANDING PAGES IN application_pages
-- ============================================================================
DO $$
DECLARE
  v_parent_id UUID;
BEGIN
  -- Insert or resolve parent folder category: Situs Publik & Landing Page
  INSERT INTO "application_pages" (
    id,
    slug,
    name,
    description,
    route_path,
    parent_page_id,
    audience,
    is_enabled,
    icon,
    display_order,
    is_system,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    'external.public_site',
    'Situs Publik & Landing Page',
    'Halaman landing page publik, fasilitas, layanan medis, dan kalkulator kesehatan',
    '#',
    NULL,
    'external',
    true,
    'globe',
    20,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    display_order = EXCLUDED.display_order,
    updated_at = NOW()
  RETURNING id INTO v_parent_id;

  IF v_parent_id IS NULL THEN
    SELECT id INTO v_parent_id FROM "application_pages" WHERE slug = 'external.public_site';
  END IF;

  -- Insert canonical child landing pages referencing the resolved parent UUID
  INSERT INTO "application_pages" (
    id,
    slug,
    name,
    description,
    route_path,
    custom_alias,
    parent_page_id,
    audience,
    is_enabled,
    icon,
    display_order,
    is_system,
    created_at,
    updated_at
  ) VALUES 
    (
      gen_random_uuid(),
      'external.public_site.home',
      'Beranda Utama',
      'Halaman utama landing page klinik',
      '/',
      NULL,
      v_parent_id,
      'external',
      true,
      'home',
      1,
      true,
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      'external.public_site.facilities',
      'Fasilitas & Poli',
      'Katalog fasilitas medis, poliklinik, dan ruang tindakan',
      '/fasilitas',
      NULL,
      v_parent_id,
      'external',
      true,
      'building',
      2,
      true,
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      'external.public_site.services',
      'Paket Layanan Medis',
      'Daftar penawaran dan paket layanan medis klinik',
      '/layanan',
      NULL,
      v_parent_id,
      'external',
      true,
      'stethoscope',
      3,
      true,
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      'external.public_site.about',
      'Tentang Kami',
      'Profil klinik Amanah, visi misi, dan dokter',
      '/tentang-kami',
      '/about',
      v_parent_id,
      'external',
      true,
      'info',
      4,
      true,
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      'external.public_site.contact',
      'Kontak & Lokasi',
      'Alamat klinik, peta lokasi, dan kontak darurat',
      '/kontak',
      NULL,
      v_parent_id,
      'external',
      true,
      'phone',
      5,
      true,
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      'external.public_site.pregnancy_calculator',
      'Kalkulator Kehamilan',
      'Kalkulator perkiraan hari lahir dan usia kehamilan',
      '/kalkulator-kehamilan',
      NULL,
      v_parent_id,
      'external',
      true,
      'calculator',
      6,
      true,
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      'external.public_site.reviews',
      'Testimoni & Ulasan',
      'Ulasan pasien dan pengalaman pelayanan klinik',
      '/testimoni',
      '/ulasan',
      v_parent_id,
      'external',
      true,
      'star',
      7,
      true,
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      'external.public_site.terms',
      'Syarat & Ketentuan',
      'Syarat dan ketentuan pemakaian layanan klinik Amanah',
      '/terms-of-service',
      NULL,
      v_parent_id,
      'external',
      true,
      'file-text',
      8,
      true,
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      'external.public_site.privacy',
      'Kebijakan Privasi',
      'Kebijakan privasi perlindungan data dan rekam medis pasien',
      '/privacy-policy',
      NULL,
      v_parent_id,
      'external',
      true,
      'shield',
      9,
      true,
      NOW(),
      NOW()
    )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    route_path = EXCLUDED.route_path,
    custom_alias = EXCLUDED.custom_alias,
    parent_page_id = EXCLUDED.parent_page_id,
    icon = EXCLUDED.icon,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();
END $$;
