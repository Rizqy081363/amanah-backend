-- Down Migration: 0093_canonical_english_relationship_codes.down.sql
UPDATE patient_relationship_types SET code = 'diri_sendiri', updated_at = NOW() WHERE code = 'self';
UPDATE patient_relationship_types SET code = 'pasangan', updated_at = NOW() WHERE code = 'spouse';
UPDATE patient_relationship_types SET code = 'anak', updated_at = NOW() WHERE code = 'child';
UPDATE patient_relationship_types SET code = 'orang_tua', updated_at = NOW() WHERE code = 'parent';
UPDATE patient_relationship_types SET code = 'kerabat', updated_at = NOW() WHERE code = 'relative';
UPDATE patient_relationship_types SET code = 'teman', updated_at = NOW() WHERE code = 'friend';
UPDATE patient_relationship_types SET code = 'lainnya', updated_at = NOW() WHERE code = 'other';
