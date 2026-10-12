-- 0037_recycle_completed_queue_tickets.sql
-- Mengubah unique constraint queue_number pada tabel queue_tickets menjadi partial unique index
-- agar nomor antrean tiket dapat didaur ulang/reset kembali (1..N) setelah antrean sebelumnya selesai (completed/cancelled).

-- 1. Hapus constraint unik absolut lama yang mengunci seluruh baris riwayat
ALTER TABLE "queue_tickets"
  DROP CONSTRAINT IF EXISTS "queue_tickets_unique_number_per_service_date";

-- 2. Buat partial unique index yang hanya menjaga keunikan untuk status antrean aktif
CREATE UNIQUE INDEX IF NOT EXISTS "queue_tickets_unique_active_number_idx"
  ON "queue_tickets" ("service_id", "queue_date", "queue_number")
  WHERE "status" IN ('waiting', 'called', 'in_service');
