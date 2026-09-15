export class MedicalRecordEntity {
  id: string;
  kunjunganId: string;
  patientId: string;
  staffId?: string | null;
  flowType: 'pregnancy' | 'immunization' | 'general';
  motherNik?: string | null;
  partnerNik?: string | null;
  childNik?: string | null;
  formData: Record<string, any>;
  computedData: Record<string, any>;
  diagnosis?: string | null;
  tindakan?: string | null;
  resepObat?: string | null;
  catatanMedis?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
