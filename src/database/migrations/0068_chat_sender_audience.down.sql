-- Migration 0068 Revert: Revert Chat Sender Audience to legacy chat_sender_role enum

-- 1. Revert trigger
CREATE OR REPLACE FUNCTION apply_message_to_conversation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE "conversations" AS c
       SET last_message_at          = NEW.created_at,
           last_customer_message_at = CASE WHEN NEW.sender_role::text = 'external'
                                           THEN NEW.created_at
                                           ELSE c.last_customer_message_at END,
           last_admin_message_at    = CASE WHEN NEW.sender_role::text = 'internal'
                                           THEN NEW.created_at
                                           ELSE c.last_admin_message_at END,
           first_admin_reply_at     = CASE WHEN NEW.sender_role::text = 'internal'
                                           THEN COALESCE(c.first_admin_reply_at, NEW.created_at)
                                           ELSE c.first_admin_reply_at END
     WHERE c.id = NEW.conversation_id
       AND c.status = 'open';
    RETURN NEW;
END;
$$;

-- 2. Drop constraints
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_internal_sender_chk;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_role_chk;

-- 3. Revert column to chat_sender_role enum
ALTER TABLE messages ALTER COLUMN sender_role DROP DEFAULT;
ALTER TABLE messages ALTER COLUMN sender_role TYPE chat_sender_role USING (
  CASE 
    WHEN sender_role = 'internal' THEN 'admin'::chat_sender_role
    ELSE 'customer'::chat_sender_role
  END
);
ALTER TABLE messages ALTER COLUMN sender_role SET DEFAULT 'customer'::chat_sender_role;

ALTER TABLE messages ADD CONSTRAINT messages_admin_sender_chk
  CHECK (sender_role <> 'admin' OR sender_user_id IS NOT NULL);
