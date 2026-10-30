-- Migration 0068: Standardize Chat Sender Audience
-- Unifies chat sender_role with canonical audience ('internal' vs 'external')
-- Aligns with Migration 0063 (role audience) and 0065 (notification audience)

-- 1. Drop legacy constraints FIRST so column type conversion does not fail comparison
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_admin_sender_chk;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_role_chk;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_internal_sender_chk;

-- 2. Alter messages.sender_role to varchar(20) and migrate existing data
ALTER TABLE messages ALTER COLUMN sender_role DROP DEFAULT;

ALTER TABLE messages ALTER COLUMN sender_role TYPE varchar(20) USING (
  CASE 
    WHEN sender_role::text = 'admin' THEN 'internal'
    ELSE 'external'
  END
);

ALTER TABLE messages ALTER COLUMN sender_role SET DEFAULT 'external';
ALTER TABLE messages ALTER COLUMN sender_role SET NOT NULL;

-- 3. Add canonical audience check constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_sender_role_chk') THEN
    ALTER TABLE messages 
      ADD CONSTRAINT messages_sender_role_chk 
      CHECK (sender_role IN ('internal', 'external'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_internal_sender_chk') THEN
    ALTER TABLE messages 
      ADD CONSTRAINT messages_internal_sender_chk 
      CHECK (sender_role <> 'internal' OR sender_user_id IS NOT NULL);
  END IF;
END $$;

-- 4. Update trigger apply_message_to_conversation to handle canonical audience
CREATE OR REPLACE FUNCTION apply_message_to_conversation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE "conversations" AS c
       SET last_message_at          = NEW.created_at,
           last_customer_message_at = CASE WHEN NEW.sender_role = 'external'
                                           THEN NEW.created_at
                                           ELSE c.last_customer_message_at END,
           last_admin_message_at    = CASE WHEN NEW.sender_role = 'internal'
                                           THEN NEW.created_at
                                           ELSE c.last_admin_message_at END,
           first_admin_reply_at     = CASE WHEN NEW.sender_role = 'internal'
                                           THEN COALESCE(c.first_admin_reply_at, NEW.created_at)
                                           ELSE c.first_admin_reply_at END
     WHERE c.id = NEW.conversation_id
       AND c.status = 'open';
    RETURN NEW;
END;
$$;
