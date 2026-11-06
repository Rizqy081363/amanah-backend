import { UserStatus } from '../../../../common/constants';

export interface UserRoleSummary {
  id: string;
  code: string;
  name: string;
  tier: string;
  audience: string;
  isSystem: boolean;
  isActive: boolean;
  isClinical: boolean;
}

export interface UserStaffSummary {
  id: string;
  staffCode: string;
  fullName: string;
  positionTitle?: string | null;
  departmentName?: string | null;
  hiredAt?: string | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  primaryUnitId?: string | null;
  primaryUnitName?: string | null;
}

export interface UserPatientAddressSummary {
  fullAddress: string;
  provinceName?: string | null;
  regencyName?: string | null;
  districtName?: string | null;
  villageName?: string | null;
}

export interface UserPatientEmergencyContactSummary {
  name: string;
  relationship?: string | null;
  phone: string;
}

export interface UserPatientSummary {
  id: string;
  medicalRecordNumber: string;
  fullName: string;
  motherName?: string | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  bloodType?: string | null;
  bloodTypeId?: string | null;
  bloodTypeCode?: string | null;
  occupation?: string | null;
  occupationId?: string | null;
  visitCount?: number;
  lastVisitAt?: string | null;
  address?: UserPatientAddressSummary | null;
  emergencyContact?: UserPatientEmergencyContactSummary | null;
}

export interface UserAffiliationSummary {
  id: string;
  patientId: string;
  fullName: string;
  medicalRecordNumber: string;
  relationshipName: string;
  relationLabel?: string | null;
  isPrimary: boolean;
}

export class UserDirectoryEntity {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  status: UserStatus;
  preferredLocale?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  authVersion: number;
  roles: UserRoleSummary[];
  primaryRole?: UserRoleSummary | null;
  primaryAudience: string;
  staffProfileId?: string | null;
  staffProfile?: UserStaffSummary | null;
  patientProfileId?: string | null;
  patientProfile?: UserPatientSummary | null;
  patientAffiliations: UserAffiliationSummary[];
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserListPaginatedResult {
  users: UserDirectoryEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
