export class PatientAddressDetail {
  id?: string;
  type: string;
  provinceCode?: string | null;
  provinceName?: string | null;
  regencyCode?: string | null;
  regencyName?: string | null;
  districtCode?: string | null;
  districtName?: string | null;
  villageCode?: string | null;
  villageName?: string | null;
  line1: string;
  fullAddress: string;
  isPrimary: boolean;
}

export class PatientEmergencyContactDetail {
  id?: string;
  name?: string | null;
  phone: string;
  relationship?: string | null;
  notes?: string | null;
}

export class PatientEntity {
  id: string;
  userId: string;
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
  email?: string | null;
  address: string;
  alamatDetail?: string | null;
  provinsi?: string | null;
  provinsiId?: string | null;
  kabupaten?: string | null;
  kabupatenId?: string | null;
  kecamatan?: string | null;
  kecamatanId?: string | null;
  kelurahan?: string | null;
  kelurahanId?: string | null;
  addressDetail?: PatientAddressDetail | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactDetail?: PatientEmergencyContactDetail | null;
  allergies?: any;
  medicalHistory?: string | null;
  avatarUrl?: string | null;
  status?: string;
  createdAt: Date;
  updatedAt: Date;
}
