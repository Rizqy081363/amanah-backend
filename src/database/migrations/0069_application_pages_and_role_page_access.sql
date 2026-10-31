-- Migration 0069: Application Page Registry, Role-Page Access, and Role Lifecycle Controls
-- Decoupled CMS Page Registry supporting hierarchical parent-child availability, dynamic role page assignment, and fail-closed identity provisioning.

-- 1. Extend roles table with lifecycle and provisioning flags
ALTER TABLE roles 
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_roles_is_active ON roles(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_default_audience 
  ON roles (audience) 
  WHERE is_default = true AND is_active = true;

-- 2. Extend users table with auth_version for instantaneous session revocation
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS auth_version INT NOT NULL DEFAULT 1;

-- 3. Create application_pages table (Canonical Page Registry)
CREATE TABLE IF NOT EXISTS application_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  route_path VARCHAR(255) NOT NULL,
  parent_page_id UUID REFERENCES application_pages(id) ON DELETE CASCADE,
  audience VARCHAR(20) NOT NULL DEFAULT 'internal',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  icon VARCHAR(50),
  display_order INT NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT application_pages_audience_check CHECK (audience IN ('internal', 'external')),
  CONSTRAINT application_pages_slug_format CHECK (slug ~ '^[a-z][a-z0-9_.:-]*$')
);

CREATE INDEX IF NOT EXISTS idx_application_pages_parent ON application_pages(parent_page_id);
CREATE INDEX IF NOT EXISTS idx_application_pages_audience ON application_pages(audience);
CREATE INDEX IF NOT EXISTS idx_application_pages_route_path ON application_pages(route_path);
CREATE INDEX IF NOT EXISTS idx_application_pages_is_enabled ON application_pages(is_enabled);

-- 4. Create role_page_access table (Dynamic Role-Page Relationship)
CREATE TABLE IF NOT EXISTS role_page_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES application_pages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT role_page_access_role_page_unique UNIQUE (role_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_role_page_access_role_id ON role_page_access(role_id);
CREATE INDEX IF NOT EXISTS idx_role_page_access_page_id ON role_page_access(page_id);

-- 5. Seed Canonical Parent Page Sections
INSERT INTO application_pages (id, slug, name, description, route_path, parent_page_id, audience, is_enabled, icon, display_order, is_system)
VALUES 
  ('a0000001-0000-0000-0000-000000000001', 'admin.patient_care', 'Pelayanan Pasien', 'Menu manajemen pelayanan pasien, antrean, dan rekam medis', '#', NULL, 'internal', true, 'stethoscope', 10, true),
  ('a0000001-0000-0000-0000-000000000002', 'admin.hr_management', 'Manajemen SDM', 'Menu manajemen sumber daya manusia, dokter, dan staf klinik', '#', NULL, 'internal', true, 'userPen', 20, true),
  ('a0000001-0000-0000-0000-000000000003', 'admin.finance', 'Keuangan & Penggajian', 'Menu rekapitulasi penggajian dan keuangan staf', '#', NULL, 'internal', true, 'receipt', 30, true),
  ('a0000001-0000-0000-0000-000000000004', 'admin.system', 'Pengaturan Sistem & Utilitas', 'Menu notifikasi, profil, dan konfigurasi master sistem', '#', NULL, 'internal', true, 'settings', 40, true),
  ('a0000001-0000-0000-0000-000000000005', 'external.patient_services', 'Layanan Pasien & Publik', 'Portal publik dan layanan mandiri pasien klinik', '#', NULL, 'external', true, 'calendar', 10, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  display_order = EXCLUDED.display_order;

-- 6. Seed Canonical Child Pages
-- Pelayanan Pasien
INSERT INTO application_pages (slug, name, description, route_path, parent_page_id, audience, is_enabled, icon, display_order, is_system)
VALUES
  ('admin.patient_care.appointments', 'Appointment Pasien', 'Manajemen janji temu konsultasi pasien', '/admin/appointment-pasien', 'a0000001-0000-0000-0000-000000000001', 'internal', true, 'calendar', 1, true),
  ('admin.patient_care.patients', 'Data Pasien', 'Basis data rekam identitas dan profil pasien', '/admin/data-pasien', 'a0000001-0000-0000-0000-000000000001', 'internal', true, 'teams', 2, true),
  ('admin.patient_care.chat', 'Chat Pasien', 'Konsultasi dan percakapan daring dengan pasien', '/admin/chat', 'a0000001-0000-0000-0000-000000000001', 'internal', true, 'chat', 3, true),
  ('admin.patient_care.medical_records', 'Riwayat Medis', 'Riwayat formulir medis imunisasi, persalinan, dan rekam klinis', '/admin/riwayat-medis', 'a0000001-0000-0000-0000-000000000001', 'internal', true, 'history', 4, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  route_path = EXCLUDED.route_path,
  parent_page_id = EXCLUDED.parent_page_id,
  icon = EXCLUDED.icon,
  display_order = EXCLUDED.display_order;

-- Manajemen SDM
INSERT INTO application_pages (slug, name, description, route_path, parent_page_id, audience, is_enabled, icon, display_order, is_system)
VALUES
  ('admin.hr_management.doctor_schedules', 'Jadwal Praktisi', 'Pengaturan shift dan jadwal dokter/bidan', '/admin/jadwal-dokter', 'a0000001-0000-0000-0000-000000000002', 'internal', true, 'clock', 1, true),
  ('admin.hr_management.staff', 'Manajemen Staf', 'Daftar staf, penugasan, dan roster kerja klinik', '/admin/staff', 'a0000001-0000-0000-0000-000000000002', 'internal', true, 'teams', 2, true),
  ('admin.hr_management.roles', 'Management Role', 'Role Studio, matriks perizinan, dan konfigurasi akses halaman', '/admin/management-role', 'a0000001-0000-0000-0000-000000000002', 'internal', true, 'lock', 3, true),
  ('admin.hr_management.clinic_essentials', 'Clinic Essentials', 'Master fasilitas, poli, unit, ruangan, layanan, dan formulir', '/admin/clinic-essentials', 'a0000001-0000-0000-0000-000000000002', 'internal', true, 'workspace', 4, true),
  ('admin.hr_management.attendance', 'Kehadiran Pegawai', 'Presensi dan monitoring check-in/check-out pegawai', '/admin/kehadiran-pegawai', 'a0000001-0000-0000-0000-000000000002', 'internal', true, 'badgeCheck', 5, true),
  ('admin.hr_management.leave', 'Manajemen Perizinan', 'Persetujuan perizinan cuti, sakit, dan dispensasi dinas staf', '/admin/manajemen-perizinan', 'a0000001-0000-0000-0000-000000000002', 'internal', true, 'calendar', 6, true),
  ('admin.hr_management.replacement', 'Peluang Pengganti', 'Pertukaran jadwal dan penggantian dinas antar-staf', '/admin/peluang-pengganti', 'a0000001-0000-0000-0000-000000000002', 'internal', true, 'userCheck', 7, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  route_path = EXCLUDED.route_path,
  parent_page_id = EXCLUDED.parent_page_id,
  icon = EXCLUDED.icon,
  display_order = EXCLUDED.display_order;

-- Keuangan & Penggajian
INSERT INTO application_pages (slug, name, description, route_path, parent_page_id, audience, is_enabled, icon, display_order, is_system)
VALUES
  ('admin.finance.payroll', 'Manajemen Penggajian', 'Rekapitulasi kompensasi dan slip gaji staf', '/admin/payroll', 'a0000001-0000-0000-0000-000000000003', 'internal', true, 'receipt', 1, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  route_path = EXCLUDED.route_path,
  parent_page_id = EXCLUDED.parent_page_id,
  icon = EXCLUDED.icon,
  display_order = EXCLUDED.display_order;

-- Pengaturan Sistem & Utilitas
INSERT INTO application_pages (slug, name, description, route_path, parent_page_id, audience, is_enabled, icon, display_order, is_system)
VALUES
  ('admin.system.notifications', 'Notifikasi Admin', 'Pusat notifikasi dan pengumuman operasional klinik', '/admin/notifications', 'a0000001-0000-0000-0000-000000000004', 'internal', true, 'notification', 1, true),
  ('admin.system.settings', 'Pengaturan Sistem', 'Konfigurasi QR kehadiran dan parameter klinik', '/admin/settings', 'a0000001-0000-0000-0000-000000000004', 'internal', true, 'settings', 2, true),
  ('admin.system.profile', 'Profil Akun', 'Pengaturan profil dan kredensial staf', '/admin/profile', 'a0000001-0000-0000-0000-000000000004', 'internal', true, 'user', 3, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  route_path = EXCLUDED.route_path,
  parent_page_id = EXCLUDED.parent_page_id,
  icon = EXCLUDED.icon,
  display_order = EXCLUDED.display_order;

-- Layanan Pasien & Publik (External)
INSERT INTO application_pages (slug, name, description, route_path, parent_page_id, audience, is_enabled, icon, display_order, is_system)
VALUES
  ('external.patient_services.queue', 'Cek Antrean', 'Monitoring antrean poli secara langsung', '/klinik/antrean', 'a0000001-0000-0000-0000-000000000005', 'external', true, 'listOrdered', 1, true),
  ('external.patient_services.appointments', 'Janji Temu', 'Pendaftaran dan reservasi konsultasi dokter', '/klinik/janji-temu', 'a0000001-0000-0000-0000-000000000005', 'external', true, 'calendar', 2, true),
  ('external.patient_services.history', 'Riwayat Medis', 'Riwayat pemeriksaan dan resume medis pasien', '/klinik/history', 'a0000001-0000-0000-0000-000000000005', 'external', true, 'history', 3, true),
  ('external.patient_services.chat', 'Chat Konsultasi', 'Konsultasi langsung via chat dengan petugas medis', '/klinik/chat', 'a0000001-0000-0000-0000-000000000005', 'external', true, 'chat', 4, true),
  ('external.patient_services.notifications', 'Notifikasi Pasien', 'Pemberitahuan jadwal dan antrean pasien', '/klinik/notifications', 'a0000001-0000-0000-0000-000000000005', 'external', true, 'notification', 5, true),
  ('external.patient_services.guide', 'Panduan Penggunaan', 'Informasi dan tata cara penggunaan portal klinik', '/klinik/panduan', 'a0000001-0000-0000-0000-000000000005', 'external', true, 'help', 6, true),
  ('external.patient_services.profile', 'Profil Pasien', 'Manajemen data diri dan keluarga pasien', '/klinik/profile', 'a0000001-0000-0000-0000-000000000005', 'external', true, 'user', 7, true),
  ('external.patient_services.registration', 'Pendaftaran Pasien Baru', 'Formulir pendaftaran rekam medis pasien baru', '/patient-registration', 'a0000001-0000-0000-0000-000000000005', 'external', true, 'userPlus', 8, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  route_path = EXCLUDED.route_path,
  parent_page_id = EXCLUDED.parent_page_id,
  icon = EXCLUDED.icon,
  display_order = EXCLUDED.display_order;

-- 7. Grant administrator role full access to all internal application pages
INSERT INTO role_page_access (role_id, page_id)
SELECT r.id, ap.id
FROM roles r
CROSS JOIN application_pages ap
WHERE r.code = 'admin' AND ap.audience = 'internal'
ON CONFLICT (role_id, page_id) DO NOTHING;
