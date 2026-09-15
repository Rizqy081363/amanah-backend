CREATE TYPE "public"."appointment_session" AS ENUM('PAGI', 'SIANG', 'MALAM');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('SUDAH_BUAT_JANJI', 'SUDAH_DATANG', 'MENUNGGU', 'SEDANG_DIPERIKSA', 'SELESAI', 'BATAL');--> statement-breakpoint
CREATE TYPE "public"."attendance_shift" AS ENUM('PAGI', 'SIANG', 'MALAM');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('HADIR', 'TERLAMBAT', 'TIDAK_HADIR');--> statement-breakpoint
CREATE TYPE "public"."blood_type" AS ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Belum Tahu');--> statement-breakpoint
CREATE TYPE "public"."gender_type" AS ENUM('Laki-laki', 'Perempuan');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('MENUNGGU_KONFIRMASI', 'DISETUJUI', 'DITOLAK');--> statement-breakpoint
CREATE TYPE "public"."medical_flow_type" AS ENUM('pregnancy', 'immunization', 'general');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'PATIENT', 'STAF');--> statement-breakpoint
CREATE TYPE "public"."visit_type" AS ENUM('Pemeriksaan Baru', 'Kontrol Ulang');--> statement-breakpoint
CREATE TABLE "kunjungan_pasien" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"poliklinik_id" uuid NOT NULL,
	"layanan_id" uuid NOT NULL,
	"staff_id" uuid,
	"appointment_date" date NOT NULL,
	"session" "appointment_session" NOT NULL,
	"queue_number" varchar(20) NOT NULL,
	"status" "appointment_status" DEFAULT 'SUDAH_BUAT_JANJI' NOT NULL,
	"visit_type" "visit_type" DEFAULT 'Pemeriksaan Baru' NOT NULL,
	"complaint" text,
	"called_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "layanan_poli" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poliklinik_id" uuid NOT NULL,
	"nama_layanan" varchar(255) NOT NULL,
	"deskripsi" text,
	"medical_flow" "medical_flow_type" DEFAULT 'general' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"medical_record_number" varchar(50) NOT NULL,
	"nik" varchar(16) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"gender" "gender_type" NOT NULL,
	"birth_place" varchar(100) NOT NULL,
	"birth_date" date NOT NULL,
	"blood_type" "blood_type" DEFAULT 'Belum Tahu' NOT NULL,
	"nama_ibu_kandung" varchar(255),
	"pekerjaan" varchar(100),
	"phone_number" varchar(20) NOT NULL,
	"address" text NOT NULL,
	"emergency_contact_name" varchar(255),
	"emergency_contact_phone" varchar(20),
	"allergies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"medical_history" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "patients_medical_record_number_unique" UNIQUE("medical_record_number"),
	CONSTRAINT "patients_nik_unique" UNIQUE("nik")
);
--> statement-breakpoint
CREATE TABLE "poliklinik" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nama_poli" varchar(100) NOT NULL,
	"kode_poli" varchar(10) NOT NULL,
	"deskripsi" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poliklinik_kode_poli_unique" UNIQUE("kode_poli")
);
--> statement-breakpoint
CREATE TABLE "rekam_medis_kunjungan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kunjungan_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"staff_id" uuid,
	"flow_type" "medical_flow_type" NOT NULL,
	"mother_nik" varchar(16),
	"partner_nik" varchar(16),
	"child_nik" varchar(16),
	"form_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"diagnosis" text,
	"tindakan" text,
	"resep_obat" text,
	"catatan_medis" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rekam_medis_kunjungan_kunjungan_id_unique" UNIQUE("kunjungan_id")
);
--> statement-breakpoint
CREATE TABLE "staff_attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"scan_time" timestamp with time zone DEFAULT now() NOT NULL,
	"shift" "attendance_shift" NOT NULL,
	"status" "attendance_status" NOT NULL,
	"device_info" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_leaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text NOT NULL,
	"document_url" text,
	"status" "leave_status" DEFAULT 'MENUNGGU_KONFIRMASI' NOT NULL,
	"approved_by" integer,
	"approval_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"day_of_week" integer,
	"specific_date" date,
	"session" "appointment_session" NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"notes" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"poliklinik_id" uuid NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"profession" varchar(50) NOT NULL,
	"id_card_number" varchar(50) NOT NULL,
	"photo_url" text,
	"phone_number" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staffs_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "staffs_id_card_number_unique" UNIQUE("id_card_number")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "system_role" "user_role" DEFAULT 'PATIENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "kunjungan_pasien" ADD CONSTRAINT "kunjungan_pasien_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kunjungan_pasien" ADD CONSTRAINT "kunjungan_pasien_poliklinik_id_poliklinik_id_fk" FOREIGN KEY ("poliklinik_id") REFERENCES "public"."poliklinik"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kunjungan_pasien" ADD CONSTRAINT "kunjungan_pasien_layanan_id_layanan_poli_id_fk" FOREIGN KEY ("layanan_id") REFERENCES "public"."layanan_poli"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kunjungan_pasien" ADD CONSTRAINT "kunjungan_pasien_staff_id_staffs_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staffs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layanan_poli" ADD CONSTRAINT "layanan_poli_poliklinik_id_poliklinik_id_fk" FOREIGN KEY ("poliklinik_id") REFERENCES "public"."poliklinik"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekam_medis_kunjungan" ADD CONSTRAINT "rekam_medis_kunjungan_kunjungan_id_kunjungan_pasien_id_fk" FOREIGN KEY ("kunjungan_id") REFERENCES "public"."kunjungan_pasien"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekam_medis_kunjungan" ADD CONSTRAINT "rekam_medis_kunjungan_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekam_medis_kunjungan" ADD CONSTRAINT "rekam_medis_kunjungan_staff_id_staffs_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staffs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendances" ADD CONSTRAINT "staff_attendances_staff_id_staffs_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staffs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_staff_id_staffs_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staffs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_staff_id_staffs_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staffs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffs" ADD CONSTRAINT "staffs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffs" ADD CONSTRAINT "staffs_poliklinik_id_poliklinik_id_fk" FOREIGN KEY ("poliklinik_id") REFERENCES "public"."poliklinik"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_kunjungan_antrean_harian" ON "kunjungan_pasien" USING btree ("poliklinik_id","appointment_date","session","queue_number");--> statement-breakpoint
CREATE INDEX "idx_kunjungan_status" ON "kunjungan_pasien" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_kunjungan_patient_id" ON "kunjungan_pasien" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "idx_layanan_poliklinik_id" ON "layanan_poli" USING btree ("poliklinik_id");--> statement-breakpoint
CREATE INDEX "idx_patients_nik" ON "patients" USING btree ("nik");--> statement-breakpoint
CREATE INDEX "idx_patients_rm" ON "patients" USING btree ("medical_record_number");--> statement-breakpoint
CREATE INDEX "idx_patients_user_id" ON "patients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_rekam_medis_kunjungan_id" ON "rekam_medis_kunjungan" USING btree ("kunjungan_id");--> statement-breakpoint
CREATE INDEX "idx_rekam_medis_patient_id" ON "rekam_medis_kunjungan" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "idx_rekam_medis_niks" ON "rekam_medis_kunjungan" USING btree ("mother_nik","partner_nik","child_nik");--> statement-breakpoint
CREATE INDEX "idx_attendance_staff_date" ON "staff_attendances" USING btree ("staff_id","scan_time");--> statement-breakpoint
CREATE INDEX "idx_leaves_staff_id" ON "staff_leaves" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_schedules_staff_id" ON "staff_schedules" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_staffs_profession" ON "staffs" USING btree ("profession");--> statement-breakpoint
CREATE INDEX "idx_staffs_poliklinik_id" ON "staffs" USING btree ("poliklinik_id");--> statement-breakpoint
CREATE INDEX "idx_user_system_role" ON "user" USING btree ("system_role");