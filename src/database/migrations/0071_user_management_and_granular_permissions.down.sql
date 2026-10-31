-- Migration 0071 Rollback: User Management Page, Dynamic RBAC Wiring, and Granular Permissions

-- 1. Remove Indexes
DROP INDEX IF EXISTS idx_users_name_lower;
DROP INDEX IF EXISTS idx_users_status;

-- 2. Revoke and Delete New Permissions
DELETE FROM role_permissions
WHERE permission_id IN (
  SELECT id FROM permissions
  WHERE code IN (
    'users:delete',
    'users:export',
    'users:restore',
    'pages:read',
    'pages:manage',
    'chat:read',
    'chat:send'
  )
);

DELETE FROM permissions
WHERE code IN (
  'users:delete',
  'users:export',
  'users:restore',
  'pages:read',
  'pages:manage',
  'chat:read',
  'chat:send'
);

-- 3. Remove Data User Page and Role Access
DELETE FROM role_page_access
WHERE page_id IN (
  SELECT id FROM application_pages WHERE slug = 'admin.hr_management.users'
);

DELETE FROM application_pages
WHERE slug = 'admin.hr_management.users';
