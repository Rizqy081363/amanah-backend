-- Migration 0041: Staff Addresses (Regional Address Schema compatible with Flutter & patient_addresses)

CREATE TABLE IF NOT EXISTS staff_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    type address_type NOT NULL DEFAULT 'domicile',
    province_code TEXT,
    province_name TEXT,
    regency_code TEXT,
    regency_name TEXT,
    district_code TEXT,
    district_name TEXT,
    village_code TEXT,
    village_name TEXT,
    line1 TEXT NOT NULL,
    full_address TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_addresses_one_primary_per_type 
    ON staff_addresses(staff_profile_id, type) WHERE is_primary;

CREATE INDEX IF NOT EXISTS idx_staff_addresses_profile 
    ON staff_addresses(staff_profile_id);
