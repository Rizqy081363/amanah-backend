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

export interface UserPatientSummary {
  id: string;
  medicalRecordNumber: string;
  fullName: string;
  motherName?: string | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  bloodType?: string | null;
  occupation?: string | null;
  visitCount?: number;
  lastVisitAt?: string | null;
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
