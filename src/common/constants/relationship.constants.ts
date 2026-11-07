/**
 * Canonical Patient Relationship Type Codes.
 * Persistent machine identifiers stored in patient_relationship_types.code.
 * Display names (e.g. 'Diri Sendiri', 'Pasangan') remain mutable in the database.
 */
export const PATIENT_RELATIONSHIP_CODE = {
  SELF: 'self',
  SPOUSE: 'spouse',
  CHILD: 'child',
  PARENT: 'parent',
  RELATIVE: 'relative',
  FRIEND: 'friend',
  OTHER: 'other',
} as const;

export type PatientRelationshipCode =
  (typeof PATIENT_RELATIONSHIP_CODE)[keyof typeof PATIENT_RELATIONSHIP_CODE];

/**
 * Protected canonical relationship codes that cannot be deleted or re-slugged by admin in Clinic Essentials.
 */
export const PROTECTED_RELATIONSHIP_CODES = new Set<string>([
  PATIENT_RELATIONSHIP_CODE.SELF,
  PATIENT_RELATIONSHIP_CODE.SPOUSE,
  PATIENT_RELATIONSHIP_CODE.CHILD,
  PATIENT_RELATIONSHIP_CODE.PARENT,
]);
