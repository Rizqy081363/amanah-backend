-- Migration 0040: Chat Module Evolution
-- Evolves existing conversations and messages tables for live chat between patients/guests and clinic admins.

DO $$ BEGIN
    CREATE TYPE "conversation_status" AS ENUM('open', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "chat_sender_role" AS ENUM('customer', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Evolve conversations table
ALTER TABLE "conversations" ALTER COLUMN "patient_id" DROP NOT NULL;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "status" "conversation_status" NOT NULL DEFAULT 'open';
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "guest_id" uuid;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "guest_name" text;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "guest_email" citext;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_customer_message_at" timestamp with time zone;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_admin_message_at" timestamp with time zone;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "first_admin_reply_at" timestamp with time zone;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "awaiting_reply" boolean GENERATED ALWAYS AS (
    last_customer_message_at IS NOT NULL AND (last_admin_message_at IS NULL OR last_customer_message_at > last_admin_message_at)
) STORED;

-- Constraints on conversations
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_identity_chk";
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_identity_chk"
    CHECK ((user_id IS NOT NULL AND guest_id IS NULL AND guest_name IS NULL AND guest_email IS NULL) OR
           (user_id IS NULL AND guest_id IS NOT NULL AND guest_name IS NOT NULL AND guest_email IS NOT NULL));

ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_closed_at_chk";
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_closed_at_chk"
    CHECK ((status = 'closed') = (closed_at IS NOT NULL));

ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_email_format_chk";
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_email_format_chk"
    CHECK (guest_email IS NULL OR (length(guest_email::text) BETWEEN 3 AND 254 AND position('@' IN guest_email::text) > 1));

-- Partial & Keyset Indexes on conversations
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_one_open_per_user_uidx"
    ON "conversations" ("user_id")
    WHERE status = 'open' AND user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_one_open_per_guest_uidx"
    ON "conversations" ("guest_id")
    WHERE status = 'open' AND guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS "conversations_inbox_idx"
    ON "conversations" ("status", "last_message_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "conversations_awaiting_reply_idx"
    ON "conversations" ("last_customer_message_at")
    WHERE status = 'open' AND awaiting_reply = true;

CREATE INDEX IF NOT EXISTS "conversations_guest_email_idx"
    ON "conversations" ("guest_email")
    WHERE guest_email IS NOT NULL;

-- 2. Evolve messages table
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "sender_role" "chat_sender_role" NOT NULL DEFAULT 'customer';
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "client_message_id" uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "messages" ALTER COLUMN "sender_type" DROP NOT NULL;
ALTER TABLE "messages" ALTER COLUMN "author_snapshot" DROP NOT NULL;
ALTER TABLE "messages" ALTER COLUMN "author_snapshot" SET DEFAULT '';

ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_body_not_blank";
ALTER TABLE "messages" ADD CONSTRAINT "messages_body_not_blank"
    CHECK (body IS NOT NULL AND length(TRIM(BOTH FROM body)) > 0 AND length(body) <= 4000);

ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_admin_sender_chk";
ALTER TABLE "messages" ADD CONSTRAINT "messages_admin_sender_chk"
    CHECK (sender_role <> 'admin' OR sender_user_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "messages_idempotency_uidx"
    ON "messages" ("conversation_id", "client_message_id");

-- 3. Trigger to maintain conversation timeline & guard against writing to closed conversations
CREATE OR REPLACE FUNCTION apply_message_to_conversation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE "conversations" AS c
       SET last_message_at          = NEW.created_at,
           last_customer_message_at = CASE WHEN NEW.sender_role = 'customer'
                                           THEN NEW.created_at
                                           ELSE c.last_customer_message_at END,
           last_admin_message_at    = CASE WHEN NEW.sender_role = 'admin'
                                           THEN NEW.created_at
                                           ELSE c.last_admin_message_at END,
           first_admin_reply_at     = CASE WHEN NEW.sender_role = 'admin'
                                           THEN COALESCE(c.first_admin_reply_at, NEW.created_at)
                                           ELSE c.first_admin_reply_at END
     WHERE c.id = NEW.conversation_id
       AND c.status = 'open';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'conversation_not_open: %', NEW.conversation_id;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS messages_apply_to_conversation ON "messages";
CREATE TRIGGER messages_apply_to_conversation
    AFTER INSERT ON "messages"
    FOR EACH ROW EXECUTE FUNCTION apply_message_to_conversation();
