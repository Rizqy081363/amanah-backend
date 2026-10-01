CREATE TABLE IF NOT EXISTS "child_immunization_intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intake_submission_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"appointment_id" uuid,
	"child_name" varchar(255) NOT NULL,
	"child_nik" varchar(16) NOT NULL,
	"child_birth_date" date NOT NULL,
	"child_sex" varchar(16) NOT NULL,
	"child_age_formatted" varchar(64),
	"parent_phone" varchar(32) NOT NULL,
	"father_name" varchar(255),
	"mother_name" varchar(255),
	"child_address" text,
	"previous_vaccine_history" text,
	"child_allergy_history" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maternal_health_intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intake_submission_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"appointment_id" uuid,
	"mother_nik" varchar(16) NOT NULL,
	"mother_name" varchar(255) NOT NULL,
	"mother_birth_date" date,
	"mother_age" integer,
	"marriage_order" integer DEFAULT 1,
	"marriage_date" date,
	"mother_job" varchar(128),
	"mother_education" varchar(64),
	"religion" varchar(32),
	"phone_number" varchar(32),
	"domicile_address" text,
	"identity_card_address" text,
	"dasawisma" varchar(128),
	"posyandu" varchar(128),
	"puskesmas" varchar(128),
	"partner_name" varchar(255),
	"partner_nik" varchar(16),
	"partner_birth_date" date,
	"partner_age" integer,
	"partner_job" varchar(128),
	"partner_education" varchar(64),
	"partner_blood_type" varchar(8),
	"height_cm" numeric(5, 2),
	"pre_pregnancy_weight_kg" numeric(5, 2),
	"upper_arm_circumference_cm" numeric(4, 1),
	"initial_bmi" numeric(4, 1),
	"tetanus_status" varchar(32),
	"mother_blood_type" varchar(8),
	"hpht" date,
	"estimated_due_date" date,
	"gestational_age_weeks" numeric(4, 1),
	"gestational_age_formatted" varchar(64),
	"current_complaints" text,
	"gravida_count" integer DEFAULT 1 NOT NULL,
	"parity_count" integer DEFAULT 0 NOT NULL,
	"abortion_count" integer DEFAULT 0 NOT NULL,
	"living_children_count" integer DEFAULT 0 NOT NULL,
	"has_previous_pregnancy_history" boolean DEFAULT false NOT NULL,
	"has_contraception_history" boolean DEFAULT false NOT NULL,
	"smoked_before_pregnancy" varchar(16),
	"alcohol_before_pregnancy" boolean DEFAULT false,
	"irregular_diet_before_pregnancy" boolean DEFAULT false,
	"reduced_physical_activity_before_pregnancy" boolean DEFAULT false,
	"unprescribed_medication_before_pregnancy" boolean DEFAULT false,
	"concerning_cosmetic_use_before_pregnancy" boolean DEFAULT false,
	"pesticide_exposure_before_pregnancy" boolean DEFAULT false,
	"chemical_exposure_before_pregnancy" boolean DEFAULT false,
	"smoke_exposure_before_pregnancy" boolean DEFAULT false,
	"concerning_environment_notes" text,
	"allergy_info" text,
	"other_notes" text,
	"disease_history" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maternal_previous_pregnancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maternal_intake_id" uuid NOT NULL,
	"order_number" integer NOT NULL,
	"birth_year" varchar(16),
	"birth_weight_grams" integer,
	"birth_length_cm" numeric(4, 1),
	"child_sex" varchar(16),
	"gestational_age_at_birth" varchar(64),
	"birth_attendant" varchar(128),
	"delivery_method" varchar(64),
	"delivery_place" varchar(128),
	"complications" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maternal_contraceptive_histories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maternal_intake_id" uuid NOT NULL,
	"order_number" integer NOT NULL,
	"start_date" date,
	"contraceptive_type" varchar(64),
	"duration_text" varchar(64),
	"stop_date" date,
	"problems" text,
	"side_effects" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "child_immunization_intakes" ADD CONSTRAINT "child_immunization_intakes_submission_id_fkey" FOREIGN KEY ("intake_submission_id") REFERENCES "public"."medical_intake_submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "child_immunization_intakes" ADD CONSTRAINT "child_immunization_intakes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "child_immunization_intakes" ADD CONSTRAINT "child_immunization_intakes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "maternal_health_intakes" ADD CONSTRAINT "maternal_health_intakes_submission_id_fkey" FOREIGN KEY ("intake_submission_id") REFERENCES "public"."medical_intake_submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "maternal_health_intakes" ADD CONSTRAINT "maternal_health_intakes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "maternal_health_intakes" ADD CONSTRAINT "maternal_health_intakes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "maternal_previous_pregnancies" ADD CONSTRAINT "maternal_prev_preg_intake_id_fkey" FOREIGN KEY ("maternal_intake_id") REFERENCES "public"."maternal_health_intakes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "maternal_contraceptive_histories" ADD CONSTRAINT "maternal_contra_intake_id_fkey" FOREIGN KEY ("maternal_intake_id") REFERENCES "public"."maternal_health_intakes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "child_immunization_intakes_patient_idx" ON "child_immunization_intakes" USING btree ("patient_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "child_immunization_intakes_submission_idx" ON "child_immunization_intakes" USING btree ("intake_submission_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "child_immunization_intakes_appointment_idx" ON "child_immunization_intakes" USING btree ("appointment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maternal_health_intakes_patient_idx" ON "maternal_health_intakes" USING btree ("patient_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maternal_health_intakes_submission_idx" ON "maternal_health_intakes" USING btree ("intake_submission_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maternal_health_intakes_appointment_idx" ON "maternal_health_intakes" USING btree ("appointment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maternal_prev_preg_intake_idx" ON "maternal_previous_pregnancies" USING btree ("maternal_intake_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maternal_contra_intake_idx" ON "maternal_contraceptive_histories" USING btree ("maternal_intake_id");