import type { PatientEntity } from './patient.entity';

export type PatientRelationshipType = string;

export class PatientAffiliationEntity {
  id: string;
  userId: string;
  patientId: string;
  relationshipTypeId: string;
  relationshipType: PatientRelationshipType;
  relationLabel?: string | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
  patient?: PatientEntity;
}
