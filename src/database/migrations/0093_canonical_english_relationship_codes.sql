-- Migration: 0093_canonical_english_relationship_codes.sql
-- Updates patient_relationship_types to canonical English machine codes (self, spouse, child, parent, relative, friend, other)
-- while preserving display labels (name) in Indonesian, and locks canonical system status.

UPDATE patient_relationship_types SET code = 'self', is_system = true, updated_at = NOW() WHERE code = 'diri_sendiri';
UPDATE patient_relationship_types SET code = 'spouse', updated_at = NOW() WHERE code = 'pasangan';
UPDATE patient_relationship_types SET code = 'child', updated_at = NOW() WHERE code = 'anak';
UPDATE patient_relationship_types SET code = 'parent', updated_at = NOW() WHERE code = 'orang_tua';
UPDATE patient_relationship_types SET code = 'relative', updated_at = NOW() WHERE code = 'kerabat';
UPDATE patient_relationship_types SET code = 'friend', updated_at = NOW() WHERE code = 'teman';
UPDATE patient_relationship_types SET code = 'other', updated_at = NOW() WHERE code = 'lainnya';
