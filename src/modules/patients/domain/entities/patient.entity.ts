export class PatientEntity {
  id: string;
  userId: number;
  medicalRecordNumber: string;
  nik: string;
  fullName: string;
  gender: 'Laki-laki' | 'Perempuan';
  birthPlace: string;
  birthDate: string;
  bloodType: string;
  namaIbuKandung?: string | null;
  pekerjaan?: string | null;
  phoneNumber: string;
  address: string;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  allergies?: any;
  medicalHistory?: string | null;
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
