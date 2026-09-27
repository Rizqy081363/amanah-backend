import type { PatientEntity } from './patient.entity';

export type PatientRelationshipType =
  | 'self'
  | 'parent'
  | 'child'
  | 'spouse'
  | 'relative'
  | 'friend'
  | 'other';

export class PatientAffiliationEntity {
  id: string;
  userId: string;
  patientId: string;
  relationshipType: PatientRelationshipType;
  relationLabel?: string | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
  patient?: PatientEntity;
}
