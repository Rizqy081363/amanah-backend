-- Down migration: 0090_drop_roles_tier_and_parent_role.down.sql

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS parent_role_id uuid,
  ADD COLUMN IF NOT EXISTS tier varchar(20) DEFAULT 'macro' NOT NULL;

ALTER TABLE public.roles
  ADD CONSTRAINT roles_parent_role_id_fkey FOREIGN KEY (parent_role_id) REFERENCES public.roles(id) ON DELETE SET NULL,
  ADD CONSTRAINT roles_tier_check CHECK (tier IN ('macro', 'micro'));

CREATE INDEX IF NOT EXISTS roles_parent_role_id_idx ON public.roles(parent_role_id);
CREATE INDEX IF NOT EXISTS roles_tier_idx ON public.roles(tier);
