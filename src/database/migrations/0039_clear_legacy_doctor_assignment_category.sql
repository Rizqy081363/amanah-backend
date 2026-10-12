-- 0039_clear_legacy_doctor_assignment_category.sql
-- Membersihkan nilai sisa category_id pada doctor_assignment dari migrasi lawas (0024)
-- agar konsisten dengan migrasi 0030 (di mana roster adalah per practitioner_id/session_id, bukan category_id).
UPDATE "doctor_assignment"
SET "category_id" = NULL
WHERE "category_id" IS NOT NULL;
