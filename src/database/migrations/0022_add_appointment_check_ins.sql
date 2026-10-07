CREATE TABLE IF NOT EXISTS "appointment_check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"token" text NOT NULL,
	"manual_code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_user_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_check_ins_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "appointment_check_ins_used_by_user_id_fkey" FOREIGN KEY ("used_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "appointment_check_ins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "appointment_check_ins_token_idx" ON "appointment_check_ins" ("token");
CREATE INDEX IF NOT EXISTS "appointment_check_ins_code_idx" ON "appointment_check_ins" ("manual_code");
CREATE INDEX IF NOT EXISTS "appointment_check_ins_appointment_idx" ON "appointment_check_ins" ("appointment_id");
CREATE INDEX IF NOT EXISTS "appointment_check_ins_active_lookup_idx" ON "appointment_check_ins" ("manual_code", "is_used") WHERE is_used = false;
