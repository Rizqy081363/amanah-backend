-- 0038_scope_active_queue_tickets_by_doctor.sql
-- Mengubah cakupan indeks unik tiket aktif dari tingkat service_id menjadi per-dokter (doctor_id)
-- dan unassigned pool (service_id saat doctor_id IS NULL).
-- Menambahkan kolom assigned_at pada queue_tickets untuk melacak waktu bergabung ke antrean dokter.

-- 1. Tambah kolom assigned_at untuk deterministik FIFO urutan antrean dokter
ALTER TABLE "queue_tickets"
  ADD COLUMN IF NOT EXISTS "assigned_at" timestamp with time zone DEFAULT now();

UPDATE "queue_tickets"
  SET "assigned_at" = "created_at"
  WHERE "assigned_at" IS NULL;

-- 2. Hapus indeks lama yang membatasi unik pada level (service_id, queue_date, queue_number)
DROP INDEX IF EXISTS "queue_tickets_unique_active_number_idx";

-- 3. Buat partial unique index untuk tiket yang memiliki penugasan dokter
CREATE UNIQUE INDEX IF NOT EXISTS "queue_tickets_unique_active_doctor_number_idx"
  ON "queue_tickets" ("doctor_id", "queue_date", "queue_number")
  WHERE "doctor_id" IS NOT NULL AND "status" IN ('waiting', 'called', 'in_service');

-- 4. Buat partial unique index untuk tiket dalam unassigned pool (belum ada dokter)
CREATE UNIQUE INDEX IF NOT EXISTS "queue_tickets_unique_active_unassigned_number_idx"
  ON "queue_tickets" ("service_id", "queue_date", "queue_number")
  WHERE "doctor_id" IS NULL AND "status" IN ('waiting', 'called', 'in_service');
