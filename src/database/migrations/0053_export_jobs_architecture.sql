-- Migration 0053: Agnostic Asynchronous Request-Reply Export Jobs Architecture
CREATE TABLE IF NOT EXISTS export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  export_type varchar(64) NOT NULL,
  format varchar(16) NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  parameters_hash text,
  status varchar(32) NOT NULL DEFAULT 'queued',
  total_rows bigint,
  processed_rows bigint NOT NULL DEFAULT 0,
  attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  error_code text,
  error_message text,
  file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  object_key text,
  file_size bigint,
  parts integer NOT NULL DEFAULT 1,
  idempotency_key text,
  heartbeat_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  expires_at timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_export_jobs_idempotency 
  ON export_jobs (requested_by, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_export_jobs_user_status 
  ON export_jobs (requested_by, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_export_jobs_stale 
  ON export_jobs (status, heartbeat_at);
