-- Migration: 0090_drop_roles_tier_and_parent_role.sql
-- Description: Drop hierarchical fields (tier and parent_role_id) from roles to enforce Flat RBAC.

-- 1. Drop constraints and indexes on roles
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_parent_role_id_fkey;
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_tier_check;
DROP INDEX IF EXISTS public.roles_parent_role_id_idx;
DROP INDEX IF EXISTS public.roles_tier_idx;

-- 2. Drop columns tier and parent_role_id
ALTER TABLE public.roles DROP COLUMN IF EXISTS parent_role_id;
ALTER TABLE public.roles DROP COLUMN IF EXISTS tier;
