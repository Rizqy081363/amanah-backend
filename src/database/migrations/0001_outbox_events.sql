DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'outbox_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE outbox_status AS ENUM (
      'pending',
      'processing',
      'published',
      'failed',
      'dead_letter'
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  aggregate_type varchar(64) NOT NULL,
  aggregate_id varchar(64) NOT NULL,
  event_type varchar(128) NOT NULL,
  payload jsonb NOT NULL,
  status outbox_status DEFAULT 'pending' NOT NULL,
  retry_count integer DEFAULT 0 NOT NULL,
  max_retries integer DEFAULT 5 NOT NULL,
  error_message text,
  trace_id varchar(64),
  scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_outbox_events_status_scheduled
  ON outbox_events (status, scheduled_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate
  ON outbox_events (aggregate_type, aggregate_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_outbox_events_created
  ON outbox_events (created_at);
