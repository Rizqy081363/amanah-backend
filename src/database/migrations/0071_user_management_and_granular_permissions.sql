-- Migration 0071: Centralized User Management Page, Dynamic RBAC Wiring, and Granular Permission Matrix Expansion
-- Adds Data User page into CMS Application Page Registry, grants admin role-page access, registers missing granular permissions, and adds user search indexes.

-- 1. Insert Data User into Application Page Registry (Under Manajemen SDM)
INSERT INTO application_pages (slug, name, description, route_path, parent_page_id, audience, is_enabled, icon, display_order, is_system)
VALUES (
  'admin.hr_management.users',
  'Data User',
  'Basis data dan manajemen seluruh identitas akun pengguna sistem',
  '/admin/data-user',
  'a0000001-0000-0000-0000-000000000002',
  'internal',
  true,
  'userCheck',
  8,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  route_path = EXCLUDED.route_path,
  parent_page_id = EXCLUDED.parent_page_id,
  icon = EXCLUDED.icon,
  display_order = EXCLUDED.display_order;

-- 2. Grant Administrator Role Access to Data User Page
INSERT INTO role_page_access (role_id, page_id)
SELECT r.id, ap.id
FROM roles r
CROSS JOIN application_pages ap
WHERE r.code = 'admin' AND ap.slug = 'admin.hr_management.users'
ON CONFLICT (role_id, page_id) DO NOTHING;

-- 3. Register Granular Permissions in permissions Table
INSERT INTO permissions (code, description)
VALUES
  ('users:delete', 'Menghapus akun pengguna secara permanen (purging sistemik)'),
  ('users:export', 'Mengekspor berkas pencadangan (backup) data pengguna'),
  ('users:restore', 'Memulihkan (restore) data pengguna dari berkas cadangan'),
  ('pages:read', 'Melihat daftar halaman aplikasi dan struktur hierarki CMS'),
  ('pages:manage', 'Mengatur ketersediaan dan hak akses halaman aplikasi'),
  ('chat:read', 'Membaca riwayat pesan dan percakapan konsultasi'),
  ('chat:send', 'Mengirim pesan dalam ruang obrolan konsultasi')
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description;

-- 4. Grant All New Permissions to Administrator Role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code IN (
  'users:delete',
  'users:export',
  'users:restore',
  'pages:read',
  'pages:manage',
  'chat:read',
  'chat:send'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. Add Performance Indexes on users Table for Role-Agnostic Search & Status Filtering
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_name_lower ON users USING btree (lower(name));
