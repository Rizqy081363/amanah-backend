CREATE TABLE IF NOT EXISTS clinic_schedule_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT 'default',
  default_consultation_duration_minutes integer NOT NULL DEFAULT 30,
  default_start_precision_minutes integer NOT NULL DEFAULT 1,
  early_morning_start text NOT NULL DEFAULT '00:00',
  early_morning_end text NOT NULL DEFAULT '06:00',
  morning_start text NOT NULL DEFAULT '06:00',
  morning_end text NOT NULL DEFAULT '12:00',
  afternoon_start text NOT NULL DEFAULT '12:00',
  afternoon_end text NOT NULL DEFAULT '18:00',
  night_start text NOT NULL DEFAULT '18:00',
  night_end text NOT NULL DEFAULT '24:00',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT clinic_schedule_policies_duration_positive CHECK (default_consultation_duration_minutes > 0),
  CONSTRAINT clinic_schedule_policies_precision_positive CHECK (default_start_precision_minutes > 0)
);

INSERT INTO clinic_schedule_policies (
  code,
  default_consultation_duration_minutes,
  default_start_precision_minutes,
  early_morning_start,
  early_morning_end,
  morning_start,
  morning_end,
  afternoon_start,
  afternoon_end,
  night_start,
  night_end
)
VALUES (
  'default',
  30,
  1,
  '00:00',
  '06:00',
  '06:00',
  '12:00',
  '12:00',
  '18:00',
  '18:00',
  '24:00'
)
ON CONFLICT (code) DO NOTHING;
