export interface VitalSigns {
  systolic?: number;
  diastolic?: number;
  heartRate?: number;
  respiratoryRate?: number;
  temperature?: number;
  weightKg?: number;
  heightCm?: number;
  oxygenSaturation?: number;
  consciousness?: string;
}

export interface PrescriptionItem {
  namaObat: string;
  jumlah: number;
  satuan: string;
  aturanPakai: string;
  catatan?: string;
}

export interface MedicalRecordPatientSummary {
  id: string;
  fullName: string;
  medicalRecordNumber: string;
  nik?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  phone?: string | null;
}

export interface MedicalRecordPractitionerSummary {
  id: string;
  fullName: string;
  profession?: string | null;
  staffCode?: string | null;
  sipNumber?: string | null;
}

export interface MedicalRecordServiceSummary {
  id: string;
  name: string;
  serviceCode?: string | null;
}

export class MedicalRecordEntity {
  id: string;
  kunjunganId?: string | null;
  patientId: string;
  staffId?: string | null;
  serviceId?: string | null;
  sourceIntakeId?: string | null;
  encounterDate: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';

  // SOAP Components
  subjective?: string | null;
  objectiveNotes?: string | null;
  vitalSigns?: VitalSigns | null;
  diagnosis?: string | null;
  diagnosisIcd10Code?: string | null;
  diagnosisIcd10Name?: string | null;
  tindakan?: string | null;
  resepObat?: string | null;
  prescriptions?: PrescriptionItem[] | null;
  catatanMedis?: string | null;

  // KIA & Flow
  flowType: 'pregnancy' | 'immunization' | 'general';
  motherNik?: string | null;
  partnerNik?: string | null;
  childNik?: string | null;
  formData: Record<string, any>;
  computedData: Record<string, any>;

  // Hydrated summaries
  patient?: MedicalRecordPatientSummary | null;
  practitioner?: MedicalRecordPractitionerSummary | null;
  service?: MedicalRecordServiceSummary | null;

  createdAt: Date;
  updatedAt: Date;
}
