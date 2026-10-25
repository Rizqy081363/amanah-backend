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
  gender: 'male' | 'female';
  birthPlace: string;
  birthDate: string;
  bloodType: string;
  motherName?: string | null;
  occupation?: string | null;
  phoneNumber: string;
  email?: string | null;
  address: string;
  line1?: string | null;
  provinceName?: string | null;
  provinceCode?: string | null;
  regencyName?: string | null;
  regencyCode?: string | null;
  districtName?: string | null;
  districtCode?: string | null;
  villageName?: string | null;
  villageCode?: string | null;
  addressDetail?: PatientAddressDetail | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactDetail?: PatientEmergencyContactDetail | null;
  allergies?: any;
  medicalHistory?: string | null;
  avatarUrl?: string | null;
  status?: string;
  // Account & login timestamps
  registeredAt?: string | null;
  firstLoginAt?: string | null;
  lastLoginAt?: string | null;
  // Authoritative appointment statistics
  totalAppointments?: number;
  completedVisits?: number;
  missedAppointments?: number;
  cancelledAppointments?: number;
  lastVisitDate?: string | null;
  // Affiliation paradigm metadata
  isMaster?: boolean;
  hasOwnAccount?: boolean;
  affiliateCount?: number;
  relationshipType?: string | null;
  relationLabel?: string | null;
  masterPatientId?: string | null;
  masterPatientName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
