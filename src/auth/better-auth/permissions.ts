import { createAccessControl } from 'better-auth/plugins/access';
import {
  adminAc,
  defaultStatements,
  userAc,
} from 'better-auth/plugins/admin/access';

export const statement = {
  ...defaultStatements,
  clinic: ['create', 'read', 'update', 'delete'],
  patient: ['create', 'read', 'update', 'delete'],
  staff: ['create', 'read', 'update', 'delete'],
  schedule: ['create', 'read', 'update', 'delete'],
  appointment: ['create', 'read', 'update', 'delete', 'call', 'complete'],
  medicalRecord: ['create', 'read', 'update'],
  attendance: ['record', 'read', 'export'],
  leave: ['create', 'read', 'update', 'approve'],
} as const;

export const ac = createAccessControl(statement);

export const admin = ac.newRole({
  ...adminAc.statements,
  clinic: ['create', 'read', 'update', 'delete'],
  patient: ['create', 'read', 'update', 'delete'],
  staff: ['create', 'read', 'update', 'delete'],
  schedule: ['create', 'read', 'update', 'delete'],
  appointment: ['create', 'read', 'update', 'delete', 'call', 'complete'],
  medicalRecord: ['create', 'read', 'update'],
  attendance: ['record', 'read', 'export'],
  leave: ['create', 'read', 'update', 'approve'],
});

export const staffDoctor = ac.newRole({
  ...userAc.statements,
  clinic: ['read'],
  patient: ['read'],
  staff: ['read'],
  schedule: ['read', 'create', 'update'],
  appointment: ['read', 'call', 'complete'],
  medicalRecord: ['create', 'read', 'update'],
  attendance: ['record', 'read'],
  leave: ['create', 'read'],
});

export const staffMidwife = ac.newRole({
  ...userAc.statements,
  clinic: ['read'],
  patient: ['read'],
  staff: ['read'],
  schedule: ['read', 'create', 'update'],
  appointment: ['read', 'call', 'complete'],
  medicalRecord: ['create', 'read', 'update'],
  attendance: ['record', 'read'],
  leave: ['create', 'read'],
});

export const staffWorker = ac.newRole({
  ...userAc.statements,
  clinic: ['read'],
  staff: ['read'],
  attendance: ['record', 'read'],
  leave: ['create', 'read'],
});

export const patient = ac.newRole({
  ...userAc.statements,
  clinic: ['read'],
  patient: ['read', 'update'],
  appointment: ['create', 'read'],
  medicalRecord: ['read'],
});

export const roles = {
  admin,
  staffDoctor,
  staffMidwife,
  staffWorker,
  patient,
} as const;

export type RoleName = keyof typeof roles;

export function hasRolePermission<
  R extends keyof typeof statement,
  A extends (typeof statement)[R][number],
>(role: string | null | undefined, resource: R, action: A): boolean {
  if (!role) return false;
  const userRole = (roles as Record<string, any>)[role];
  if (!userRole) return false;
  const authRes = userRole.authorize({ [resource]: [action] });
  return Boolean(authRes?.success);
}
