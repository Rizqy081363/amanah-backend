CREATE TABLE "child_immunization_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intake_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"vaccine_code" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"given_date" date,
	"given_month" varchar(16),
	"age_estimate_months" integer,
	"date_precision" varchar(32),
	"review_reasons" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vaccine_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"age_milestone" varchar(64) NOT NULL,
	"schedule_months" integer,
	"alt_group" varchar(64),
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vaccine_catalog_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "child_immunization_entries" ADD CONSTRAINT "child_imm_entries_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "public"."child_immunization_intakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_immunization_entries" ADD CONSTRAINT "child_imm_entries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "child_imm_entries_intake_idx" ON "child_immunization_entries" USING btree ("intake_id");--> statement-breakpoint
CREATE INDEX "child_imm_entries_patient_idx" ON "child_immunization_entries" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "child_imm_entries_vaccine_code_idx" ON "child_immunization_entries" USING btree ("vaccine_code");--> statement-breakpoint
CREATE INDEX "vaccine_catalog_order_idx" ON "vaccine_catalog" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "vaccine_catalog_alt_group_idx" ON "vaccine_catalog" USING btree ("alt_group");