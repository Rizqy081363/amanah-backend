-- Migration 0014: Patient Affiliations and Occupations

CREATE TABLE IF NOT EXISTS "occupations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL UNIQUE,
	"name" varchar(128) NOT NULL,
	"description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
    CREATE TYPE "public"."patient_relationship_type" AS ENUM('self', 'parent', 'child', 'spouse', 'relative', 'friend', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "patient_affiliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"relationship_type" "patient_relationship_type" DEFAULT 'self' NOT NULL,
	"relation_label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_affiliations_user_patient_idx" UNIQUE("user_id","patient_id")
);

DO $$ BEGIN
    ALTER TABLE "patient_affiliations" ADD CONSTRAINT "patient_affiliations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "patient_affiliations" ADD CONSTRAINT "patient_affiliations_patient_id_patient_profiles_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "patient_affiliations_user_id_idx" ON "patient_affiliations" ("user_id");
CREATE INDEX IF NOT EXISTS "patient_affiliations_patient_id_idx" ON "patient_affiliations" ("patient_id");

DO $$ BEGIN
    ALTER TABLE "patient_profiles" ADD COLUMN "occupation_id" uuid;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_occupation_id_occupations_id_fk" FOREIGN KEY ("occupation_id") REFERENCES "public"."occupations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "patient_profiles" DROP CONSTRAINT IF EXISTS "patient_profiles_user_id_key";

-- Backfill initial self-affiliation for existing patient records tied to a user account
INSERT INTO "patient_affiliations" ("user_id", "patient_id", "relationship_type", "relation_label", "is_primary")
SELECT "user_id", "id", 'self'::patient_relationship_type, 'Diri Sendiri', true
FROM "patient_profiles"
WHERE "user_id" IS NOT NULL
ON CONFLICT ("user_id", "patient_id") DO NOTHING;
