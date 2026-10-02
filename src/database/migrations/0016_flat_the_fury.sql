CREATE TABLE "maternal_anamnesis_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maternal_intake_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"question_code" varchar(64) NOT NULL,
	"selected_option_id" uuid,
	"selected_option_code" varchar(32),
	"text_response" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maternal_health_condition_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"question_prompt" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maternal_health_condition_catalog_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "maternal_health_condition_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maternal_intake_id" uuid NOT NULL,
	"condition_id" uuid NOT NULL,
	"condition_code" varchar(64) NOT NULL,
	"has_condition" boolean NOT NULL,
	"diagnosis_year" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maternal_husband_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maternal_intake_id" uuid NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"nik" varchar(16),
	"birth_date" date,
	"age" integer,
	"job" varchar(128),
	"education" varchar(64),
	"blood_type" varchar(8),
	"phone_number" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maternal_husband_intake_unique" UNIQUE("maternal_intake_id")
);
--> statement-breakpoint
CREATE TABLE "maternal_question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"option_code" varchar(32) NOT NULL,
	"label" varchar(128) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maternal_question_options_unique" UNIQUE("question_id","option_code")
);
--> statement-breakpoint
CREATE TABLE "maternal_screening_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"category" varchar(64) NOT NULL,
	"question_text" text NOT NULL,
	"help_text" text,
	"input_type" varchar(32) NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maternal_screening_questions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "maternal_anamnesis_responses" ADD CONSTRAINT "maternal_anamnesis_intake_id_fkey" FOREIGN KEY ("maternal_intake_id") REFERENCES "public"."maternal_health_intakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_anamnesis_responses" ADD CONSTRAINT "maternal_anamnesis_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."maternal_screening_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_anamnesis_responses" ADD CONSTRAINT "maternal_anamnesis_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "public"."maternal_question_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_health_condition_responses" ADD CONSTRAINT "maternal_condition_resp_intake_id_fkey" FOREIGN KEY ("maternal_intake_id") REFERENCES "public"."maternal_health_intakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_health_condition_responses" ADD CONSTRAINT "maternal_condition_resp_condition_id_fkey" FOREIGN KEY ("condition_id") REFERENCES "public"."maternal_health_condition_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_husband_profiles" ADD CONSTRAINT "maternal_husband_intake_id_fkey" FOREIGN KEY ("maternal_intake_id") REFERENCES "public"."maternal_health_intakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_question_options" ADD CONSTRAINT "maternal_question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."maternal_screening_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maternal_anamnesis_intake_idx" ON "maternal_anamnesis_responses" USING btree ("maternal_intake_id");--> statement-breakpoint
CREATE INDEX "maternal_anamnesis_question_idx" ON "maternal_anamnesis_responses" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "maternal_health_condition_order_idx" ON "maternal_health_condition_catalog" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "maternal_condition_resp_intake_idx" ON "maternal_health_condition_responses" USING btree ("maternal_intake_id");--> statement-breakpoint
CREATE INDEX "maternal_condition_resp_condition_idx" ON "maternal_health_condition_responses" USING btree ("condition_id");--> statement-breakpoint
CREATE INDEX "maternal_husband_intake_idx" ON "maternal_husband_profiles" USING btree ("maternal_intake_id");--> statement-breakpoint
CREATE INDEX "maternal_question_options_question_idx" ON "maternal_question_options" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "maternal_screening_questions_category_idx" ON "maternal_screening_questions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "maternal_screening_questions_order_idx" ON "maternal_screening_questions" USING btree ("display_order");--> statement-breakpoint
INSERT INTO "maternal_husband_profiles" (
  "maternal_intake_id", "full_name", "nik", "birth_date", "age", "job", "education", "blood_type"
)
SELECT 
  id, 
  COALESCE(partner_name, 'Suami'), 
  partner_nik, 
  partner_birth_date, 
  partner_age, 
  partner_job, 
  partner_education, 
  partner_blood_type
FROM "maternal_health_intakes"
WHERE partner_name IS NOT NULL
ON CONFLICT ("maternal_intake_id") DO NOTHING;