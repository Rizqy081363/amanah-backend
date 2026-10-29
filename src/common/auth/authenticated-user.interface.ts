import { SYSTEM_ROLES, type SystemRole } from '../../auth/constants/auth.constants';
import { STAFF_TYPES, type StaffType } from '../constants/staff-types.constant';

export interface AuthenticatedStaffProfile {
  id: string;
  staffType: StaffType;
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
/**
 * Type guard for Doctor staff principal.
 */
export function isDoctorStaff(
  user: AuthenticatedUser,
): user is AuthenticatedUser & { staff: AuthenticatedStaffProfile & { staffType: typeof STAFF_TYPES.DOCTOR } } {
  return isStaffUser(user) && user.staff.staffType === STAFF_TYPES.DOCTOR;
}

/**
 * Type guard for Midwife staff principal.
 */
export function isMidwifeStaff(
  user: AuthenticatedUser,
): user is AuthenticatedUser & { staff: AuthenticatedStaffProfile & { staffType: typeof STAFF_TYPES.MIDWIFE } } {
  return isStaffUser(user) && user.staff.staffType === STAFF_TYPES.MIDWIFE;
}

/**
 * Type guard for Operational Worker staff principal.
 */
export function isWorkerStaff(
  user: AuthenticatedUser,
): user is AuthenticatedUser & { staff: AuthenticatedStaffProfile & { staffType: typeof STAFF_TYPES.WORKER } } {
  return isStaffUser(user) && user.staff.staffType === STAFF_TYPES.WORKER;
}

/**
 * Type guard for Clinical staff (Doctor or Midwife).
 */
export function isClinicalStaff(
  user: AuthenticatedUser,
): user is AuthenticatedUser & {
  staff: AuthenticatedStaffProfile & {
    staffType: typeof STAFF_TYPES.DOCTOR | typeof STAFF_TYPES.MIDWIFE;
  };
} {
  return (
    isStaffUser(user) &&
    (user.staff.staffType === STAFF_TYPES.DOCTOR ||
      user.staff.staffType === STAFF_TYPES.MIDWIFE)
  );
}

/**
 * Type guard for Patient principal with verified patient profile.
 */
export function isPatientUser(
  user: AuthenticatedUser,
): user is AuthenticatedUser & { patient: AuthenticatedPatientProfile } {
  return user.systemRole === SYSTEM_ROLES.PATIENT && user.patient !== null;
}
