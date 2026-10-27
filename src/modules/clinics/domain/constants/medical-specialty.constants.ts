/**
 * Canonical medical specialty codes matching the `medical_specialties` database table.
 */
export const MEDICAL_SPECIALTY_CODES = {
  GENERAL_PRACTITIONER: 'general_practitioner',
  MATERNAL_CHILD_HEALTH: 'maternal_child_health',
} as const;

type MedicalSpecialtyCode =
  (typeof MEDICAL_SPECIALTY_CODES)[keyof typeof MEDICAL_SPECIALTY_CODES];
