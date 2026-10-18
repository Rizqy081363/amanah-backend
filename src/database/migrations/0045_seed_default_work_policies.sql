-- Migration 0045: Seed default work policies and compensation rates
-- 1. Default leave policy
INSERT INTO "leave_policy" ("approval_required", "limit_mode", "monthly_limit", "quota_counting_policy", "is_active", "effective_from")
SELECT TRUE, 'monthly_limit', 3, 'per_request', TRUE, CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM "leave_policy" WHERE "is_active" = TRUE);

-- 2. Default compensation rates for doctor, midwife, and worker
INSERT INTO "compensation_rates" ("category", "hourly_rate", "overtime_hourly_rate", "notes", "is_active", "effective_from")
VALUES
  ('doctor', 150000.00, 200000.00, 'Tarif dasar praktik per jam dokter spesialis / umum', TRUE, CURRENT_DATE),
  ('midwife', 150000.00, 200000.00, 'Tarif dasar praktik per jam bidan', TRUE, CURRENT_DATE),
  ('worker', 75000.00, 100000.00, 'Tarif dasar per jam staf operasional / perawat', TRUE, CURRENT_DATE)
ON CONFLICT DO NOTHING;
