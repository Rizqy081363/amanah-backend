-- PostgreSQL foundation schema for Klinik Amanah.
-- Scope: single-clinic web and mobile application, first-party auth, RBAC,
-- patient care operations, staff/doctor mobile operations, scheduling, queues,
-- attendance, support, chat, notifications, and a lean clinical backbone.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE user_status AS ENUM ('pending_verification', 'active', 'inactive', 'suspended');
CREATE TYPE device_platform AS ENUM ('web', 'android', 'ios', 'macos', 'windows', 'linux', 'unknown');
CREATE TYPE staff_type AS ENUM ('doctor', 'midwife', 'worker');
CREATE TYPE staff_status AS ENUM ('active', 'inactive', 'on_leave');
CREATE TYPE staff_credential_type AS ENUM ('sip', 'str', 'kki', 'npwp', 'nib', 'national_id', 'other');
CREATE TYPE staff_credential_status AS ENUM ('unverified', 'verified', 'expired', 'revoked');
CREATE TYPE staff_leave_request_type AS ENUM (
  'annual_leave',
  'sick_leave',
  'seminar_symposium',
  'family_matter',
  'external_assignment',
  'other'
);
CREATE TYPE staff_leave_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE patient_status AS ENUM ('active', 'inactive');
CREATE TYPE gender AS ENUM ('male', 'female');
CREATE TYPE blood_type AS ENUM (
  'a_positive',
  'a_negative',
  'b_positive',
  'b_negative',
  'ab_positive',
  'ab_negative',
  'o_positive',
  'o_negative',
  'a',
  'b',
  'ab',
  'o',
  'unknown'
);
CREATE TYPE address_type AS ENUM ('domicile', 'identity_card', 'other');
CREATE TYPE auth_verification_purpose AS ENUM (
  'email_verification',
  'password_reset',
  'email_change',
  'magic_link',
  'otp',
  'two_factor'
);
CREATE TYPE medical_flow_type AS ENUM ('pregnancy', 'immunization');
CREATE TYPE visit_type AS ENUM ('new_visit', 'follow_up');
CREATE TYPE appointment_status AS ENUM (
  'booked',
  'checked_in',
  'waiting',
  'in_service',
  'completed',
  'cancelled',
  'no_doctor',
  'no_show'
);
CREATE TYPE queue_status AS ENUM ('waiting', 'called', 'in_service', 'completed', 'skipped', 'cancelled');
CREATE TYPE queue_priority AS ENUM ('regular', 'priority', 'bpjs', 'vip');
CREATE TYPE schedule_status AS ENUM ('pending', 'open', 'full', 'leave', 'closed');
CREATE TYPE encounter_status AS ENUM ('planned', 'in_progress', 'completed', 'cancelled');
CREATE TYPE staff_shift AS ENUM ('early_morning', 'morning', 'afternoon', 'night');
CREATE TYPE attendance_status AS ENUM ('present', 'late', 'missed', 'leave', 'absent');
CREATE TYPE attendance_method AS ENUM ('qr_scan', 'manual_pin', 'qr_upload', 'system');
CREATE TYPE attendance_qr_session_type AS ENUM ('location_check_in', 'staff_identity');
CREATE TYPE notification_category AS ENUM (
  'appointment',
  'promotion',
  'lab_result',
  'queue',
  'clinical',
  'shift',
  'pharmacy',
  'telemedicine',
  'support',
  'system'
);
CREATE TYPE notification_action_type AS ENUM ('primary', 'secondary', 'warning', 'info');
CREATE TYPE conversation_participant_role AS ENUM ('patient', 'staff', 'system');
CREATE TYPE message_sender_type AS ENUM ('user', 'contact', 'system');
CREATE TYPE message_type AS ENUM ('text', 'audio', 'status_update', 'image', 'file');
CREATE TYPE file_access_scope AS ENUM ('private_patient', 'staff_only', 'public');
CREATE TYPE review_source AS ENUM ('google', 'manual');
CREATE TYPE clinic_unit_type AS ENUM ('department', 'polyclinic', 'ward', 'emergency', 'support', 'other');
CREATE TYPE support_ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'cancelled');
CREATE TYPE support_ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE support_ticket_sender_type AS ENUM ('reporter', 'support_agent', 'system');
CREATE TYPE data_export_type AS ENUM ('attendance_pdf', 'profile_data', 'medical_record', 'other');
CREATE TYPE data_export_status AS ENUM ('queued', 'processing', 'completed', 'failed', 'expired');

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Authentication and authorization

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email citext NOT NULL UNIQUE,
  phone text,
  email_verified boolean NOT NULL DEFAULT false,
  phone_verified boolean NOT NULL DEFAULT false,
  image_url text,
  status user_status NOT NULL DEFAULT 'pending_verification',
  preferred_locale varchar(16) NOT NULL DEFAULT 'id-ID',
  two_factor_enabled boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_not_blank CHECK (length(trim(email::text)) > 0),
  CONSTRAINT users_phone_not_blank CHECK (phone IS NULL OR length(trim(phone)) > 0),
  CONSTRAINT users_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform device_platform NOT NULL DEFAULT 'unknown',
  device_identifier_hash text NOT NULL,
  device_name text,
  app_version text,
  os_version text,
  push_token_hash text,
  push_token_encrypted text,
  biometric_enabled boolean NOT NULL DEFAULT false,
  trusted_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_devices_unique_device UNIQUE (user_id, device_identifier_hash),
  CONSTRAINT user_devices_identifier_hash_not_blank CHECK (length(trim(device_identifier_hash)) > 0),
  CONSTRAINT user_devices_push_token_hash_not_blank CHECK (push_token_hash IS NULL OR length(trim(push_token_hash)) > 0)
);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id uuid REFERENCES user_devices(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip_address inet,
  user_agent text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_sessions_token_hash_not_blank CHECK (length(trim(token_hash)) > 0)
);

CREATE TABLE auth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  password_hash text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  id_token_encrypted text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_accounts_provider_identity_unique UNIQUE (provider_id, account_id),
  CONSTRAINT auth_accounts_provider_id_not_blank CHECK (length(trim(provider_id)) > 0),
  CONSTRAINT auth_accounts_account_id_not_blank CHECK (length(trim(account_id)) > 0)
);

CREATE TABLE auth_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_hash text NOT NULL,
  value_hash text NOT NULL,
  purpose auth_verification_purpose NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_verifications_attempt_count_nonnegative CHECK (attempt_count >= 0),
  CONSTRAINT auth_verifications_identifier_hash_not_blank CHECK (length(trim(identifier_hash)) > 0),
  CONSTRAINT auth_verifications_value_hash_not_blank CHECK (length(trim(value_hash)) > 0)
);

CREATE TABLE auth_two_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  secret_encrypted text NOT NULL,
  backup_codes_encrypted text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  failed_verification_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_two_factors_failed_count_nonnegative CHECK (failed_verification_count >= 0)
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$')
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permissions_code_format CHECK (code ~ '^[a-z][a-z0-9_:.]*$')
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Clinic profile and catalog

CREATE TABLE clinic_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text NOT NULL,
  legal_name text,
  phone text,
  whatsapp text,
  email citext,
  website text,
  instagram text,
  tiktok text,
  facebook text,
  address text,
  region text,
  plus_code text,
  map_url text,
  emergency_notice text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clinic_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  unit_type clinic_unit_type NOT NULL DEFAULT 'other',
  location text,
  floor text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_units_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT clinic_units_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_categories_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$')
);

CREATE TABLE medical_specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medical_specialties_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$')
);

CREATE TABLE clinic_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid REFERENCES clinic_units(id) ON DELETE SET NULL,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  location text,
  floor text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clinic_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_category_id uuid REFERENCES service_categories(id) ON DELETE SET NULL,
  specialty_id uuid REFERENCES medical_specialties(id) ON DELETE SET NULL,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  short_name text,
  description text,
  code_prefix varchar(8) NOT NULL,
  medical_flow medical_flow_type,
  icon_name text,
  image_url text,
  display_order integer NOT NULL DEFAULT 0,
  is_bookable boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_services_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT clinic_services_code_prefix_not_blank CHECK (length(trim(code_prefix)) > 0)
);

CREATE TABLE clinic_service_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES clinic_services(id) ON DELETE CASCADE,
  complaint_text text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_service_complaints_text_not_blank CHECK (length(trim(complaint_text)) > 0)
);

-- People: patients, staff, and practitioners

CREATE TABLE patient_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  medical_record_number text NOT NULL UNIQUE,
  full_name text NOT NULL,
  national_id_hash text,
  national_id_encrypted text,
  mother_name text,
  birth_place text,
  birth_date date NOT NULL,
  gender gender NOT NULL,
  blood_type blood_type NOT NULL DEFAULT 'unknown',
  occupation text,
  phone text,
  email citext,
  avatar_url text,
  status patient_status NOT NULL DEFAULT 'active',
  medical_history_summary text,
  registered_at timestamptz NOT NULL DEFAULT now(),
  first_login_at timestamptz,
  last_visit_at timestamptz,
  visit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_profiles_full_name_not_blank CHECK (length(trim(full_name)) > 0),
  CONSTRAINT patient_profiles_mrn_not_blank CHECK (length(trim(medical_record_number)) > 0),
  CONSTRAINT patient_profiles_visit_count_nonnegative CHECK (visit_count >= 0)
);

CREATE TABLE patient_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  type address_type NOT NULL DEFAULT 'domicile',
  province_code text,
  province_name text,
  regency_code text,
  regency_name text,
  district_code text,
  district_name text,
  village_code text,
  village_name text,
  line1 text NOT NULL,
  full_address text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_addresses_line1_not_blank CHECK (length(trim(line1)) > 0),
  CONSTRAINT patient_addresses_full_address_not_blank CHECK (length(trim(full_address)) > 0)
);

CREATE TABLE patient_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  name text,
  relationship text,
  phone text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_emergency_contacts_phone_not_blank CHECK (length(trim(phone)) > 0)
);

CREATE TABLE patient_allergies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  substance text NOT NULL,
  reaction text,
  severity text,
  notes text,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_allergies_substance_not_blank CHECK (length(trim(substance)) > 0)
);

CREATE TABLE staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  primary_unit_id uuid REFERENCES clinic_units(id) ON DELETE SET NULL,
  staff_code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  staff_type staff_type NOT NULL,
  status staff_status NOT NULL DEFAULT 'active',
  position_title text,
  department_name text,
  phone text,
  email citext,
  avatar_url text,
  hired_at date,
  ended_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_profiles_code_not_blank CHECK (length(trim(staff_code)) > 0),
  CONSTRAINT staff_profiles_name_not_blank CHECK (length(trim(full_name)) > 0),
  CONSTRAINT staff_profiles_employment_dates CHECK (ended_at IS NULL OR hired_at IS NULL OR ended_at >= hired_at)
);

CREATE TABLE practitioners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_profile_id uuid NOT NULL UNIQUE REFERENCES staff_profiles(id) ON DELETE RESTRICT,
  specialty_id uuid REFERENCES medical_specialties(id) ON DELETE SET NULL,
  default_room_id uuid REFERENCES clinic_rooms(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  license_number text UNIQUE,
  bio text,
  rating numeric(3,2),
  tags text[] NOT NULL DEFAULT '{}',
  is_accepting_appointments boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practitioners_display_name_not_blank CHECK (length(trim(display_name)) > 0),
  CONSTRAINT practitioners_rating_range CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5))
);

CREATE TABLE staff_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_profile_id uuid NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  credential_type staff_credential_type NOT NULL,
  credential_number_hash text NOT NULL,
  credential_number_encrypted text NOT NULL,
  issuer text,
  issued_at date,
  expires_at date,
  status staff_credential_status NOT NULL DEFAULT 'unverified',
  verified_at timestamptz,
  verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_credentials_unique_per_staff UNIQUE (staff_profile_id, credential_type, credential_number_hash),
  CONSTRAINT staff_credentials_number_hash_not_blank CHECK (length(trim(credential_number_hash)) > 0),
  CONSTRAINT staff_credentials_number_encrypted_not_blank CHECK (length(trim(credential_number_encrypted)) > 0),
  CONSTRAINT staff_credentials_date_order CHECK (expires_at IS NULL OR issued_at IS NULL OR expires_at >= issued_at)
);

-- Scheduling, appointments, queues, and clinical backbone

CREATE TABLE practitioner_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  capacity integer NOT NULL DEFAULT 0,
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practitioner_availability_day_range CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT practitioner_availability_time_order CHECK (end_time > start_time),
  CONSTRAINT practitioner_availability_capacity_nonnegative CHECK (capacity >= 0),
  CONSTRAINT practitioner_availability_effective_order CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE practitioner_schedule_day_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  target_quota integer NOT NULL DEFAULT 0,
  is_leave boolean NOT NULL DEFAULT false,
  leave_reason text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practitioner_day_settings_unique UNIQUE (practitioner_id, schedule_date),
  CONSTRAINT practitioner_day_settings_target_quota_nonnegative CHECK (target_quota >= 0),
  CONSTRAINT practitioner_day_settings_leave_reason_not_blank CHECK (leave_reason IS NULL OR length(trim(leave_reason)) > 0)
);

CREATE TABLE staff_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_profile_id uuid NOT NULL REFERENCES staff_profiles(id) ON DELETE RESTRICT,
  practitioner_id uuid REFERENCES practitioners(id) ON DELETE SET NULL,
  request_type staff_leave_request_type NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  duration_days integer NOT NULL,
  reason text NOT NULL,
  substitute_practitioner_id uuid REFERENCES practitioners(id) ON DELETE SET NULL,
  substitute_name_snapshot text,
  status staff_leave_request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reviewer_notes text,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_leave_requests_date_order CHECK (end_date >= start_date),
  CONSTRAINT staff_leave_requests_duration_positive CHECK (duration_days > 0),
  CONSTRAINT staff_leave_requests_reason_not_blank CHECK (length(trim(reason)) > 0),
  CONSTRAINT staff_leave_requests_substitute_not_self CHECK (substitute_practitioner_id IS NULL OR substitute_practitioner_id <> practitioner_id),
  CONSTRAINT staff_leave_requests_review_consistency CHECK (
    (status IN ('approved', 'rejected') AND reviewed_at IS NOT NULL)
    OR status IN ('pending', 'cancelled')
  ),
  CONSTRAINT staff_leave_requests_cancel_consistency CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
    OR status <> 'cancelled'
  )
);

CREATE TABLE practitioner_leave_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  leave_request_id uuid UNIQUE REFERENCES staff_leave_requests(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practitioner_leave_periods_date_order CHECK (end_date >= start_date)
);

CREATE TABLE practitioner_schedule_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  day_setting_id uuid REFERENCES practitioner_schedule_day_settings(id) ON DELETE SET NULL,
  service_id uuid REFERENCES clinic_services(id) ON DELETE SET NULL,
  room_id uuid REFERENCES clinic_rooms(id) ON DELETE SET NULL,
  schedule_date date NOT NULL,
  session_label text NOT NULL,
  session_shift staff_shift,
  start_time time NOT NULL,
  end_time time NOT NULL,
  capacity integer NOT NULL DEFAULT 0,
  available_slots integer NOT NULL DEFAULT 0,
  status schedule_status NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practitioner_schedule_sessions_time_order CHECK (end_time > start_time),
  CONSTRAINT practitioner_schedule_sessions_capacity_nonnegative CHECK (capacity >= 0),
  CONSTRAINT practitioner_schedule_sessions_available_slots_nonnegative CHECK (available_slots >= 0),
  CONSTRAINT practitioner_schedule_sessions_available_lte_capacity CHECK (available_slots <= capacity),
  CONSTRAINT practitioner_schedule_sessions_unique UNIQUE (practitioner_id, schedule_date, start_time)
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code text NOT NULL UNIQUE,
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
  practitioner_id uuid REFERENCES practitioners(id) ON DELETE SET NULL,
  schedule_session_id uuid REFERENCES practitioner_schedule_sessions(id) ON DELETE SET NULL,
  service_id uuid NOT NULL REFERENCES clinic_services(id) ON DELETE RESTRICT,
  room_id uuid REFERENCES clinic_rooms(id) ON DELETE SET NULL,
  visit_type visit_type NOT NULL DEFAULT 'new_visit',
  status appointment_status NOT NULL DEFAULT 'booked',
  scheduled_date date NOT NULL,
  scheduled_start_time time NOT NULL,
  scheduled_end_time time,
  complaint text,
  guardian_name_snapshot text,
  medical_flow medical_flow_type,
  checked_in_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointments_booking_code_not_blank CHECK (length(trim(booking_code)) > 0),
  CONSTRAINT appointments_time_order CHECK (scheduled_end_time IS NULL OR scheduled_end_time > scheduled_start_time)
);

CREATE TABLE appointment_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  previous_status appointment_status,
  new_status appointment_status NOT NULL,
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE queue_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES clinic_services(id) ON DELETE RESTRICT,
  room_id uuid REFERENCES clinic_rooms(id) ON DELETE SET NULL,
  queue_date date NOT NULL,
  queue_number text NOT NULL,
  priority queue_priority NOT NULL DEFAULT 'regular',
  guardian_name_snapshot text,
  status queue_status NOT NULL DEFAULT 'waiting',
  waiting_position integer,
  estimated_called_at timestamptz,
  called_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT queue_tickets_number_not_blank CHECK (length(trim(queue_number)) > 0),
  CONSTRAINT queue_tickets_waiting_position_positive CHECK (waiting_position IS NULL OR waiting_position > 0),
  CONSTRAINT queue_tickets_unique_number_per_service_date UNIQUE (service_id, queue_date, queue_number)
);

CREATE TABLE medical_intake_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  flow medical_flow_type NOT NULL,
  schema_version text NOT NULL DEFAULT 'v1',
  schema_title text NOT NULL,
  answers jsonb NOT NULL,
  automatic jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medical_intake_answers_object CHECK (jsonb_typeof(answers) = 'object'),
  CONSTRAINT medical_intake_automatic_object CHECK (jsonb_typeof(automatic) = 'object')
);

CREATE TABLE clinical_encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid UNIQUE REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
  practitioner_id uuid REFERENCES practitioners(id) ON DELETE SET NULL,
  service_id uuid REFERENCES clinic_services(id) ON DELETE SET NULL,
  source_intake_id uuid REFERENCES medical_intake_submissions(id) ON DELETE SET NULL,
  encounter_date date NOT NULL,
  status encounter_status NOT NULL DEFAULT 'planned',
  subjective_notes text,
  objective_notes text,
  assessment text,
  plan text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Staff attendance and QR presence

CREATE TABLE attendance_qr_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  session_type attendance_qr_session_type NOT NULL DEFAULT 'location_check_in',
  staff_profile_id uuid REFERENCES staff_profiles(id) ON DELETE CASCADE,
  room_id uuid REFERENCES clinic_rooms(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES clinic_units(id) ON DELETE SET NULL,
  context text,
  shift staff_shift,
  manual_pin_hash text,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  rotation_seconds integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_qr_code_hash_not_blank CHECK (length(trim(code_hash)) > 0),
  CONSTRAINT attendance_qr_manual_pin_hash_not_blank CHECK (manual_pin_hash IS NULL OR length(trim(manual_pin_hash)) > 0),
  CONSTRAINT attendance_qr_staff_identity_requires_staff CHECK (session_type <> 'staff_identity' OR staff_profile_id IS NOT NULL),
  CONSTRAINT attendance_qr_valid_order CHECK (valid_until > valid_from),
  CONSTRAINT attendance_qr_rotation_positive CHECK (rotation_seconds > 0)
);

CREATE TABLE staff_attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_profile_id uuid NOT NULL REFERENCES staff_profiles(id) ON DELETE RESTRICT,
  qr_session_id uuid REFERENCES attendance_qr_sessions(id) ON DELETE SET NULL,
  leave_request_id uuid REFERENCES staff_leave_requests(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES clinic_units(id) ON DELETE SET NULL,
  room_id uuid REFERENCES clinic_rooms(id) ON DELETE SET NULL,
  device_id uuid REFERENCES user_devices(id) ON DELETE SET NULL,
  attendance_date date NOT NULL,
  shift staff_shift NOT NULL,
  status attendance_status NOT NULL DEFAULT 'absent',
  expected_check_in_at timestamptz,
  check_in_at timestamptz,
  check_out_at timestamptz,
  late_minutes integer,
  recorded_method attendance_method NOT NULL DEFAULT 'system',
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  location_label text,
  source_code_hash text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_attendance_unique_staff_date_shift UNIQUE (staff_profile_id, attendance_date, shift),
  CONSTRAINT staff_attendance_late_minutes_nonnegative CHECK (late_minutes IS NULL OR late_minutes >= 0),
  CONSTRAINT staff_attendance_source_code_hash_not_blank CHECK (source_code_hash IS NULL OR length(trim(source_code_hash)) > 0),
  CONSTRAINT staff_attendance_time_order CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at)
);

-- Notifications

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category notification_category NOT NULL,
  title text,
  sender_name text,
  sender_role text,
  badge_icon text,
  meta_icon text,
  visual_key text,
  body text NOT NULL,
  is_urgent boolean NOT NULL DEFAULT false,
  source_type text,
  source_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_body_not_blank CHECK (length(trim(body)) > 0),
  CONSTRAINT notifications_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE notification_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  label text NOT NULL,
  action_key text NOT NULL,
  action_type notification_action_type NOT NULL DEFAULT 'secondary',
  icon text,
  url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_actions_label_not_blank CHECK (length(trim(label)) > 0),
  CONSTRAINT notification_actions_key_not_blank CHECK (length(trim(action_key)) > 0),
  CONSTRAINT notification_actions_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_recipients_unique UNIQUE (notification_id, user_id)
);

-- Chat and patient CRM timeline

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  assigned_practitioner_id uuid REFERENCES practitioners(id) ON DELETE SET NULL,
  assigned_staff_id uuid REFERENCES staff_profiles(id) ON DELETE SET NULL,
  current_patient_status appointment_status,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role conversation_participant_role NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  is_muted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_participants_user_required CHECK (role = 'system' OR user_id IS NOT NULL)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sender_type message_sender_type NOT NULL,
  author_snapshot text NOT NULL,
  type message_type NOT NULL DEFAULT 'text',
  body text,
  audio_duration_seconds integer,
  status_update_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT messages_audio_duration_nonnegative CHECK (audio_duration_seconds IS NULL OR audio_duration_seconds >= 0),
  CONSTRAINT messages_author_snapshot_not_blank CHECK (length(trim(author_snapshot)) > 0)
);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  checksum_sha256 text,
  access_scope file_access_scope NOT NULL DEFAULT 'staff_only',
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT files_storage_key_not_blank CHECK (length(trim(storage_key)) > 0),
  CONSTRAINT files_original_name_not_blank CHECK (length(trim(original_name)) > 0),
  CONSTRAINT files_mime_type_not_blank CHECK (length(trim(mime_type)) > 0),
  CONSTRAINT files_byte_size_positive CHECK (byte_size > 0)
);

CREATE TABLE message_attachments (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, file_id)
);

-- Mobile staff support, FAQ, and data export

CREATE TABLE support_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  title text NOT NULL,
  solution_steps text[] NOT NULL DEFAULT '{}',
  display_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_faqs_category_not_blank CHECK (length(trim(category)) > 0),
  CONSTRAINT support_faqs_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT support_faqs_solution_steps_not_empty CHECK (cardinality(solution_steps) > 0)
);

CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE,
  reporter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_staff_id uuid REFERENCES staff_profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status support_ticket_status NOT NULL DEFAULT 'open',
  priority support_ticket_priority NOT NULL DEFAULT 'normal',
  source_channel text NOT NULL DEFAULT 'mobile_app',
  technician_note text,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_ticket_number_not_blank CHECK (length(trim(ticket_number)) > 0),
  CONSTRAINT support_tickets_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT support_tickets_source_channel_not_blank CHECK (length(trim(source_channel)) > 0)
);

CREATE TABLE support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sender_type support_ticket_sender_type NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_messages_body_not_blank CHECK (length(trim(body)) > 0),
  CONSTRAINT support_ticket_messages_sender_required CHECK (sender_type = 'system' OR sender_user_id IS NOT NULL)
);

CREATE TABLE support_ticket_attachments (
  message_id uuid NOT NULL REFERENCES support_ticket_messages(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, file_id)
);

CREATE TABLE user_data_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  export_type data_export_type NOT NULL,
  status data_export_status NOT NULL DEFAULT 'queued',
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_data_export_jobs_parameters_object CHECK (jsonb_typeof(parameters) = 'object'),
  CONSTRAINT user_data_export_jobs_completion_consistency CHECK (
    (status = 'completed' AND completed_at IS NOT NULL AND file_id IS NOT NULL)
    OR status <> 'completed'
  )
);

CREATE TABLE patient_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  title text NOT NULL,
  subtitle text,
  event_at timestamptz NOT NULL,
  icon_type text,
  action_label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_timeline_events_type_not_blank CHECK (length(trim(event_type)) > 0),
  CONSTRAINT patient_timeline_events_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT patient_timeline_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

-- Public web content backed by the same clinic foundation

CREATE TABLE clinic_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text,
  image_url text,
  display_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_facilities_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT clinic_facilities_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE TABLE public_testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patient_profiles(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  author_role text,
  quote text NOT NULL,
  media_url text,
  is_published boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_testimonials_author_not_blank CHECK (length(trim(author_name)) > 0),
  CONSTRAINT public_testimonials_quote_not_blank CHECK (length(trim(quote)) > 0)
);

CREATE TABLE public_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source review_source NOT NULL DEFAULT 'manual',
  source_review_id text,
  author_name text NOT NULL,
  author_avatar_url text,
  rating numeric(2,1) NOT NULL,
  body text,
  reviewed_at timestamptz,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_reviews_rating_range CHECK (rating >= 0 AND rating <= 5),
  CONSTRAINT public_reviews_author_not_blank CHECK (length(trim(author_name)) > 0),
  CONSTRAINT public_reviews_source_unique UNIQUE (source, source_review_id)
);

-- Security and audit

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role_code text,
  action text NOT NULL,
  entity_table text NOT NULL,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_action_not_blank CHECK (length(trim(action)) > 0),
  CONSTRAINT audit_logs_entity_table_not_blank CHECK (length(trim(entity_table)) > 0),
  CONSTRAINT audit_logs_old_values_object CHECK (old_values IS NULL OR jsonb_typeof(old_values) = 'object'),
  CONSTRAINT audit_logs_new_values_object CHECK (new_values IS NULL OR jsonb_typeof(new_values) = 'object')
);

-- Uniqueness and search indexes

CREATE UNIQUE INDEX users_phone_unique
  ON users (phone)
  WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX user_devices_push_token_hash_unique
  ON user_devices (push_token_hash)
  WHERE push_token_hash IS NOT NULL;

CREATE UNIQUE INDEX patient_profiles_national_id_hash_unique
  ON patient_profiles (national_id_hash)
  WHERE national_id_hash IS NOT NULL;

CREATE UNIQUE INDEX patient_addresses_one_primary_per_type
  ON patient_addresses (patient_id, type)
  WHERE is_primary;

CREATE UNIQUE INDEX user_roles_active_unique
  ON user_roles (user_id, role_id)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX staff_credentials_type_hash_unique
  ON staff_credentials (credential_type, credential_number_hash);

CREATE UNIQUE INDEX auth_accounts_one_credential_per_user
  ON auth_accounts (user_id)
  WHERE provider_id = 'credential';

CREATE UNIQUE INDEX appointments_active_practitioner_slot_unique
  ON appointments (practitioner_id, scheduled_date, scheduled_start_time)
  WHERE practitioner_id IS NOT NULL
    AND status IN ('booked', 'checked_in', 'waiting', 'in_service');

CREATE UNIQUE INDEX conversation_participants_unique_user
  ON conversation_participants (conversation_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX auth_sessions_user_expires_idx ON auth_sessions (user_id, expires_at);
CREATE INDEX auth_sessions_active_idx ON auth_sessions (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX auth_accounts_user_idx ON auth_accounts (user_id);
CREATE INDEX auth_verifications_lookup_idx ON auth_verifications (identifier_hash, purpose, expires_at);
CREATE INDEX user_devices_user_active_idx ON user_devices (user_id, platform, last_seen_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX user_roles_user_idx ON user_roles (user_id) WHERE revoked_at IS NULL;

CREATE INDEX clinic_units_type_active_idx ON clinic_units (unit_type, is_active);
CREATE INDEX clinic_rooms_unit_idx ON clinic_rooms (unit_id);

CREATE INDEX patient_profiles_name_trgm_idx ON patient_profiles USING gin (full_name gin_trgm_ops);
CREATE INDEX patient_profiles_mrn_trgm_idx ON patient_profiles USING gin (medical_record_number gin_trgm_ops);
CREATE INDEX patient_profiles_status_idx ON patient_profiles (status);
CREATE INDEX patient_addresses_patient_idx ON patient_addresses (patient_id);
CREATE INDEX patient_allergies_patient_idx ON patient_allergies (patient_id);

CREATE INDEX staff_profiles_name_trgm_idx ON staff_profiles USING gin (full_name gin_trgm_ops);
CREATE INDEX staff_profiles_unit_idx ON staff_profiles (primary_unit_id);
CREATE INDEX staff_profiles_type_status_idx ON staff_profiles (staff_type, status);
CREATE INDEX staff_credentials_staff_type_idx ON staff_credentials (staff_profile_id, credential_type, status);
CREATE INDEX practitioners_specialty_idx ON practitioners (specialty_id);
CREATE INDEX clinic_services_category_idx ON clinic_services (service_category_id);
CREATE INDEX clinic_services_name_trgm_idx ON clinic_services USING gin (name gin_trgm_ops);

CREATE INDEX practitioner_availability_practitioner_day_idx
  ON practitioner_availability (practitioner_id, day_of_week, is_active);
CREATE INDEX practitioner_schedule_day_settings_practitioner_date_idx
  ON practitioner_schedule_day_settings (practitioner_id, schedule_date);
CREATE INDEX staff_leave_requests_staff_status_idx
  ON staff_leave_requests (staff_profile_id, status, start_date DESC);
CREATE INDEX staff_leave_requests_reviewer_idx
  ON staff_leave_requests (reviewed_by, reviewed_at DESC)
  WHERE reviewed_by IS NOT NULL;
CREATE INDEX practitioner_leave_periods_practitioner_dates_idx
  ON practitioner_leave_periods (practitioner_id, start_date, end_date);
CREATE INDEX practitioner_schedule_sessions_practitioner_date_idx
  ON practitioner_schedule_sessions (practitioner_id, schedule_date, status);
CREATE INDEX appointments_schedule_session_idx ON appointments (schedule_session_id);
CREATE INDEX appointments_patient_date_idx ON appointments (patient_id, scheduled_date DESC);
CREATE INDEX appointments_practitioner_date_status_idx
  ON appointments (practitioner_id, scheduled_date, status);
CREATE INDEX appointments_service_date_status_idx ON appointments (service_id, scheduled_date, status);
CREATE INDEX appointments_status_idx ON appointments (status);
CREATE INDEX appointments_complaint_trgm_idx ON appointments USING gin (complaint gin_trgm_ops);
CREATE INDEX appointment_status_events_appointment_idx
  ON appointment_status_events (appointment_id, created_at DESC);
CREATE INDEX queue_tickets_live_idx ON queue_tickets (queue_date, service_id, status);
CREATE INDEX queue_tickets_priority_idx ON queue_tickets (queue_date, status, priority);
CREATE INDEX medical_intake_patient_idx ON medical_intake_submissions (patient_id, submitted_at DESC);
CREATE INDEX medical_intake_answers_gin_idx ON medical_intake_submissions USING gin (answers jsonb_path_ops);
CREATE INDEX clinical_encounters_patient_date_idx ON clinical_encounters (patient_id, encounter_date DESC);
CREATE INDEX clinical_encounters_practitioner_date_idx
  ON clinical_encounters (practitioner_id, encounter_date DESC);

CREATE INDEX attendance_qr_sessions_active_idx
  ON attendance_qr_sessions (session_type, is_active, valid_from, valid_until);
CREATE INDEX attendance_qr_sessions_staff_idx ON attendance_qr_sessions (staff_profile_id, valid_until DESC);
CREATE INDEX staff_attendance_date_shift_status_idx
  ON staff_attendance_records (attendance_date, shift, status);
CREATE INDEX staff_attendance_staff_date_idx
  ON staff_attendance_records (staff_profile_id, attendance_date DESC);
CREATE INDEX staff_attendance_unit_date_idx
  ON staff_attendance_records (unit_id, attendance_date DESC, status)
  WHERE unit_id IS NOT NULL;

CREATE INDEX notifications_category_created_idx ON notifications (category, created_at DESC);
CREATE INDEX notifications_urgent_idx ON notifications (is_urgent, created_at DESC) WHERE is_urgent;
CREATE INDEX notification_recipients_user_unread_idx
  ON notification_recipients (user_id, created_at DESC)
  WHERE read_at IS NULL AND dismissed_at IS NULL;

CREATE INDEX conversations_patient_idx ON conversations (patient_id);
CREATE INDEX conversations_last_message_idx ON conversations (last_message_at DESC);
CREATE INDEX messages_conversation_created_idx ON messages (conversation_id, created_at);
CREATE INDEX messages_body_trgm_idx ON messages USING gin (body gin_trgm_ops);
CREATE INDEX files_uploaded_by_idx ON files (uploaded_by, created_at DESC);
CREATE INDEX support_faqs_published_idx ON support_faqs (is_published, display_order);
CREATE INDEX support_tickets_reporter_status_idx ON support_tickets (reporter_user_id, status, created_at DESC);
CREATE INDEX support_tickets_assignee_status_idx ON support_tickets (assigned_staff_id, status, created_at DESC);
CREATE INDEX support_ticket_messages_ticket_created_idx ON support_ticket_messages (ticket_id, created_at);
CREATE INDEX user_data_export_jobs_user_status_idx ON user_data_export_jobs (requested_by, status, requested_at DESC);
CREATE INDEX patient_timeline_patient_event_idx ON patient_timeline_events (patient_id, event_at DESC);

CREATE INDEX public_reviews_published_idx ON public_reviews (is_published, reviewed_at DESC);
CREATE INDEX audit_logs_actor_created_idx ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_table, entity_id, created_at DESC);
CREATE INDEX audit_logs_action_created_idx ON audit_logs (action, created_at DESC);

-- updated_at triggers

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users',
    'user_devices',
    'auth_sessions',
    'auth_accounts',
    'auth_verifications',
    'auth_two_factors',
    'roles',
    'permissions',
    'user_roles',
    'clinic_profiles',
    'clinic_units',
    'service_categories',
    'medical_specialties',
    'clinic_rooms',
    'clinic_services',
    'clinic_service_complaints',
    'patient_profiles',
    'patient_addresses',
    'patient_emergency_contacts',
    'patient_allergies',
    'staff_profiles',
    'practitioners',
    'staff_credentials',
    'practitioner_availability',
    'practitioner_schedule_day_settings',
    'staff_leave_requests',
    'practitioner_leave_periods',
    'practitioner_schedule_sessions',
    'appointments',
    'queue_tickets',
    'medical_intake_submissions',
    'clinical_encounters',
    'attendance_qr_sessions',
    'staff_attendance_records',
    'notifications',
    'notification_actions',
    'notification_recipients',
    'conversations',
    'conversation_participants',
    'messages',
    'files',
    'support_faqs',
    'support_tickets',
    'support_ticket_messages',
    'user_data_export_jobs',
    'patient_timeline_events',
    'clinic_facilities',
    'public_testimonials',
    'public_reviews'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      table_name
    );
  END LOOP;
END $$;
