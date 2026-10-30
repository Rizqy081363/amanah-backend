-- Migration 0062: Hierarchical Dynamic RBAC, Staff Roles, and Permission-Based Access Control
-- Decouples staff_type enum from operational logic and introduces self-referencing role hierarchy.

-- 1. Alter roles table: Add hierarchy, tier, and clinical provider flag
ALTER TABLE roles 
  ADD COLUMN IF NOT EXISTS parent_role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier VARCHAR(20) NOT NULL DEFAULT 'macro',
  ADD COLUMN IF NOT EXISTS is_clinical BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roles_tier_check') THEN
    ALTER TABLE roles ADD CONSTRAINT roles_tier_check CHECK (tier IN ('macro', 'micro'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS roles_parent_role_id_idx ON roles(parent_role_id);
CREATE INDEX IF NOT EXISTS roles_tier_idx ON roles(tier);

-- 2. Alter compensation_rates: Link directly to role_id instead of hardcoded category enum
ALTER TABLE compensation_rates
  ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  DROP COLUMN IF EXISTS category CASCADE;

ALTER TABLE compensation_rates DROP CONSTRAINT IF EXISTS compensation_rates_category_check;
DROP INDEX IF EXISTS idx_compensation_rates_active_category;

CREATE UNIQUE INDEX IF NOT EXISTS idx_compensation_rates_active_role 
  ON compensation_rates (role_id) 
  WHERE is_active = TRUE;

-- 3. Alter staff_profiles: Add role_id foreign key, drop legacy staff_type column
ALTER TABLE staff_profiles
  ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  DROP COLUMN IF EXISTS staff_type CASCADE;

CREATE INDEX IF NOT EXISTS staff_profiles_role_idx ON staff_profiles(role_id);
CREATE INDEX IF NOT EXISTS staff_profiles_status_idx ON staff_profiles(status);

-- 4. Alter staff_invitations: Add role_id foreign key, drop legacy staff_type column
ALTER TABLE staff_invitations
  ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  DROP COLUMN IF EXISTS staff_type CASCADE;

CREATE INDEX IF NOT EXISTS idx_staff_invitations_role ON staff_invitations(role_id);

-- 5. Drop legacy enum type if no longer referenced
DROP TYPE IF EXISTS staff_type;

-- 5. Seed Pristine Super Administrator Role (Canvas Basis)
INSERT INTO roles (id, code, name, description, is_system, tier, is_clinical, parent_role_id, created_at, updated_at)
VALUES 
  ('b5119e8f-f3b9-41b6-a21d-6116e0b3e03f', 'admin', 'Administrator', 'Super Administrator dengan hak akses penuh sistem klinik', TRUE, 'macro', FALSE, NULL, NOW(), NOW())
ON CONFLICT (code) DO UPDATE 
SET 
  name = EXCLUDED.name, 
  description = EXCLUDED.description, 
  tier = EXCLUDED.tier, 
  is_clinical = EXCLUDED.is_clinical;

-- 6. Seed Granular Permissions Catalog
INSERT INTO permissions (id, code, description, created_at, updated_at)
VALUES 
  (gen_random_uuid(), 'app:access', 'Akses ke aplikasi klinik', NOW(), NOW()),
  (gen_random_uuid(), 'profile:read', 'Melihat profil akun sendiri', NOW(), NOW()),
  (gen_random_uuid(), 'profile:update', 'Memperbarui profil sendiri', NOW(), NOW()),
  (gen_random_uuid(), 'users:read', 'Melihat daftar pengguna sistem', NOW(), NOW()),
  (gen_random_uuid(), 'users:manage', 'Mengelola pengguna dan akun sistem', NOW(), NOW()),
  (gen_random_uuid(), 'roles:read', 'Melihat daftar peran dan perizinan', NOW(), NOW()),
  (gen_random_uuid(), 'roles:manage', 'Meracik peran baru dan matriks perizinan', NOW(), NOW()),
  (gen_random_uuid(), 'staff:read', 'Melihat direktori staf klinik', NOW(), NOW()),
  (gen_random_uuid(), 'staff:invite', 'Mengundang calon pegawai/praktisi baru', NOW(), NOW()),
  (gen_random_uuid(), 'staff:manage', 'Mengelola profil dan status pegawai', NOW(), NOW()),
  (gen_random_uuid(), 'patients:read', 'Melihat data demografi pasien', NOW(), NOW()),
  (gen_random_uuid(), 'patients:register', 'Mendaftarkan pasien baru ke klinik', NOW(), NOW()),
  (gen_random_uuid(), 'patients:manage', 'Mengelola berkas profil pasien', NOW(), NOW()),
  (gen_random_uuid(), 'schedules:read', 'Melihat kalender dan sesi jadwal dokter', NOW(), NOW()),
  (gen_random_uuid(), 'schedules:manage', 'Mengatur jam operasional dan jadwal sesi', NOW(), NOW()),
  (gen_random_uuid(), 'appointments:read', 'Melihat daftar janji temu konsultasi', NOW(), NOW()),
  (gen_random_uuid(), 'appointments:book', 'Melakukan reservasi janji temu', NOW(), NOW()),
  (gen_random_uuid(), 'appointments:manage', 'Mengubah atau membatalkan janji temu', NOW(), NOW()),
  (gen_random_uuid(), 'queue:read', 'Melihat monitor papan antrean poliklinik', NOW(), NOW()),
  (gen_random_uuid(), 'queue:call', 'Memanggil nomor antrean pasien berikutnya', NOW(), NOW()),
  (gen_random_uuid(), 'queue:recall', 'Memanggil ulang nomor antrean pasien', NOW(), NOW()),
  (gen_random_uuid(), 'queue:serve', 'Memulai sesi konsultasi/pelayanan antrean', NOW(), NOW()),
  (gen_random_uuid(), 'queue:skip', 'Melewati antrean pasien yang tidak hadir', NOW(), NOW()),
  (gen_random_uuid(), 'queue:cancel', 'Membatalkan tiket antrean', NOW(), NOW()),
  (gen_random_uuid(), 'queue:complete', 'Menyelesaikan sesi pelayanan antrean', NOW(), NOW()),
  (gen_random_uuid(), 'records:read', 'Membaca riwayat rekam medis pasien', NOW(), NOW()),
  (gen_random_uuid(), 'records:write', 'Mengisi diagnosis, anamnesis, dan rekam medis', NOW(), NOW()),
  (gen_random_uuid(), 'prescriptions:write', 'Membuat dan menandatangani resep obat', NOW(), NOW()),
  (gen_random_uuid(), 'attendance:submit', 'Melakukan presensi masuk/pulang harian', NOW(), NOW()),
  (gen_random_uuid(), 'attendance:read', 'Melihat riwayat presensi mandiri', NOW(), NOW()),
  (gen_random_uuid(), 'attendance:review', 'Melihat rekap presensi seluruh staf', NOW(), NOW()),
  (gen_random_uuid(), 'attendance:approve', 'Menyetujui cuti dan presensi manual', NOW(), NOW()),
  (gen_random_uuid(), 'attendance:manage', 'Mengelola shift dan kebijakan kehadiran', NOW(), NOW()),
  (gen_random_uuid(), 'payroll:read_self', 'Melihat slip gaji mandiri', NOW(), NOW()),
  (gen_random_uuid(), 'payroll:read', 'Melihat rekapitulasi penggajian klinik', NOW(), NOW()),
  (gen_random_uuid(), 'payroll:calculate', 'Menjalankan kalkulasi penggajian bulanan', NOW(), NOW()),
  (gen_random_uuid(), 'payroll:manage', 'Finalisasi dan kunci buku penggajian', NOW(), NOW()),
  (gen_random_uuid(), 'notifications:read', 'Menerima dan membaca notifikasi', NOW(), NOW()),
  (gen_random_uuid(), 'notifications:broadcast', 'Menyiarkan pengumuman/notifikasi massal', NOW(), NOW()),
  (gen_random_uuid(), 'clinics:manage', 'Mengelola poliklinik, ruangan, dan tarif', NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- 7. Assign ALL Permissions to Super Administrator
INSERT INTO role_permissions (role_id, permission_id, created_at)
SELECT 'b5119e8f-f3b9-41b6-a21d-6116e0b3e03f', p.id, NOW()
FROM permissions p
ON CONFLICT DO NOTHING;

-- 8. Seed Pristine Superadmin User (admin@amanah.com / secret123)
-- Password bcrypt hash for 'secret123'
INSERT INTO users (id, name, email, email_verified, phone_verified, status, preferred_locale, two_factor_enabled, created_at, updated_at)
VALUES (
  '13b174d6-c92a-4381-8e18-7b1d9e4e97e9',
  'Super Admin',
  'admin@amanah.com',
  TRUE,
  TRUE,
  'active',
  'id-ID',
  FALSE,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO auth_accounts (id, user_id, provider_id, account_id, password_hash, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '13b174d6-c92a-4381-8e18-7b1d9e4e97e9',
  'credential',
  'admin@amanah.com',
  '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekd59g0xK5i8.f/gW',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Assign admin role to Super Admin
INSERT INTO user_roles (id, user_id, role_id, assigned_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '13b174d6-c92a-4381-8e18-7b1d9e4e97e9',
  'b5119e8f-f3b9-41b6-a21d-6116e0b3e03f',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Better-Auth user parity
INSERT INTO "user" (id, name, email, "emailVerified", role, banned, "createdAt", "updatedAt")
VALUES (
  '13b174d6-c92a-4381-8e18-7b1d9e4e97e9',
  'Super Admin',
  'admin@amanah.com',
  TRUE,
  'admin',
  FALSE,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  '13b174d6-c92a-4381-8e18-7b1d9e4e97e9',
  'credential',
  '13b174d6-c92a-4381-8e18-7b1d9e4e97e9',
  '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekd59g0xK5i8.f/gW',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;
