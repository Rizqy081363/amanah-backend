import { SYSTEM_ROLES, type SystemRole } from '../../auth/constants/auth.constants';

export interface AuthenticatedStaffProfile {
  id: string;
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
  name: SystemRole;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  systemRole: SystemRole;
  roleCode: string;
  roles: string[];
  role: AuthenticatedUserRole;
  staff: AuthenticatedStaffProfile | null;
  patient: AuthenticatedPatientProfile | null;
  session?: unknown;
}

/**
 * Type guard for Admin principal.
 */
export function isAdminUser(user: AuthenticatedUser): boolean {
  return user.systemRole === SYSTEM_ROLES.ADMIN;
}

/**
 * Type guard for Staff principal with verified staff profile.
 */
export function isStaffUser(
  user: AuthenticatedUser,
): user is AuthenticatedUser & { staff: AuthenticatedStaffProfile } {
  return user.systemRole === SYSTEM_ROLES.STAF && user.staff !== null;
}

/**
 * Type guard for Patient principal with verified patient profile.
 */
export function isPatientUser(
  user: AuthenticatedUser,
): user is AuthenticatedUser & { patient: AuthenticatedPatientProfile } {
  return user.systemRole === SYSTEM_ROLES.PATIENT && user.patient !== null;
}
