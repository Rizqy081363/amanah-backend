import {
  ROLE_AUDIENCE,
  type RoleAudience,
  type RoleTier,
} from '../constants/role-audience.constants';

export interface AuthenticatedStaffProfile {
  id: string;
  roleId: string | null;
  roleCode: string | null;
  roleName?: string | null;
  isClinical: boolean;
  practitionerId: string | null;
  userId: string;
  poliklinikId?: string | null;
  fullName: string;
  profession?: string | null;
  staffCode?: string | null;
  idCardNumber?: string | null;
  gender?: string | null;
  photoUrl?: string | null;
  phoneNumber?: string | null;
  isActive: boolean;
}

export interface AuthenticatedPatientProfile {
  id: string;
  userId: string;
  medicalRecordNumber: string;
  nik: string;
  maskedNik?: string | null;
  fullName: string;
  gender?: string | null;
  birthPlace?: string | null;
  birthDate?: string | Date | null;
  bloodType?: string | null;
  phoneNumber?: string | null;
  status?: string | null;
}

interface AuthenticatedUserRole {
  id?: string;
  code?: string;
  name: string;
  tier?: RoleTier;
  audience: RoleAudience;
  isClinical?: boolean;
  isSystem?: boolean;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  systemRole?: string;
  roleCode: string;
  roles: string[];
  role: AuthenticatedUserRole | null;
  audience: RoleAudience;
  permissions?: string[];
  staff: AuthenticatedStaffProfile | null;
  patient: AuthenticatedPatientProfile | null;
  session?: unknown;
}

/**
 * Type guard for Admin principal (Super Administrator or wildcard permission holder).
 */
export function isAdminUser(user: AuthenticatedUser): boolean {
  return (
    (user.role?.isSystem === true && user.role?.code === 'admin') ||
    user.roleCode === 'admin' ||
    (user.permissions?.includes('*') ?? false)
  );
}

/**
 * Type guard for Staff principal with verified staff profile.
 */
export function isStaffUser(
  user: AuthenticatedUser,
): user is AuthenticatedUser & { staff: AuthenticatedStaffProfile } {
  return user.audience === ROLE_AUDIENCE.INTERNAL && user.staff !== null;
}

/**
 * Type guard for Patient principal with verified patient profile.
 */
export function isPatientUser(
  user: AuthenticatedUser,
): user is AuthenticatedUser & { patient: AuthenticatedPatientProfile } {
  return user.audience === ROLE_AUDIENCE.EXTERNAL && user.patient !== null;
}
