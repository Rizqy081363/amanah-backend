export class MedicalIntakeSubmissionEntity {
  id: string;
  appointmentId?: string | null;
  patientId: string;
  flow: 'pregnancy' | 'immunization';
  schemaVersion: string;
  schemaTitle: string;
  answers: Record<string, any>;
  automatic: Record<string, any>;
  submittedBy?: string | null;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
