export interface StaffAddressData {
  provinceCode?: string | null;
  provinceName?: string | null;
  regencyCode?: string | null;
  regencyName?: string | null;
  districtCode?: string | null;
  districtName?: string | null;
  villageCode?: string | null;
  villageName?: string | null;
  line1?: string | null;
  fullAddress?: string | null;
}

export class StaffEntity {
  id: string;
  userId: string;
  poliklinikId: string;
  fullName: string;
  profession: string;
  staffType: 'doctor' | 'midwife' | 'worker';
  idCardNumber: string;
  birthPlace?: string | null;
  birthDate?: string | null;
  gender?: 'male' | 'female' | null;
  nationalId?: string | null;
  email?: string | null;
  photoUrl?: string | null;
  phoneNumber: string;
  isActive: boolean;
  address?: StaffAddressData | null;
  createdAt: Date;
  updatedAt: Date;
}
