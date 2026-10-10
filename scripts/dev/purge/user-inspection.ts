import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import type Redis from 'ioredis';
import { resolvedStorageRoot } from './db-connection';
import { printSection, padRight, isUuid } from './purge-helpers';

export interface TableCount {
  tableName: string;
  rowCount: number;
}

export interface UserInspectionResult {
  coreUserId: string | null;
  authUserId: string | null;
  email: string;
  name: string;
  roles: string[];
  staffProfileId: string | null;
  practitionerId: string | null;
  patientProfileId: string | null;
  tableCounts: TableCount[];
  totalDbRows: number;
  avatarDirExists: boolean;
  avatarDirPath: string | null;
  redisKeyCount: number;
}

export async function inspectUserRecords(
  pool: Pool,
  targetEmailOrId: string,
  redisClient: Redis | null,
): Promise<UserInspectionResult | null> {
  const targetIsUuid = isUuid(targetEmailOrId);

  const userQuery = targetIsUuid
    ? `
      SELECT 
        u.id AS core_id, 
        bu.id AS auth_id, 
        COALESCE(u.email, bu.email) AS email, 
        COALESCE(u.name, bu.name) AS name 
      FROM users u
      FULL OUTER JOIN "user" bu ON LOWER(u.email::text) = LOWER(bu.email)
      WHERE u.id = $1::uuid OR bu.id = $1::uuid
      LIMIT 1;
    `
    : `
      SELECT 
        u.id AS core_id, 
        bu.id AS auth_id, 
        COALESCE(u.email, bu.email) AS email, 
        COALESCE(u.name, bu.name) AS name 
      FROM users u
      FULL OUTER JOIN "user" bu ON LOWER(u.email::text) = LOWER(bu.email)
      WHERE LOWER(u.email::text) = LOWER($1) OR LOWER(bu.email) = LOWER($1)
      LIMIT 1;
    `;

  const userRes = await pool.query(userQuery, [targetEmailOrId.trim()]);
  if (userRes.rows.length === 0) {
    return null;
  }

  const coreUserId: string | null = userRes.rows[0].core_id ? String(userRes.rows[0].core_id) : null;
  const authUserId: string | null = userRes.rows[0].auth_id ? String(userRes.rows[0].auth_id) : null;
  const email: string = String(userRes.rows[0].email);
  const name: string = String(userRes.rows[0].name);

  const rolesRes = coreUserId
    ? await pool.query(
        `SELECT r.code FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1`,
        [coreUserId],
      )
    : { rows: [] };
  const roles: string[] = rolesRes.rows.map((r) => r.code);

  let staffProfileId: string | null = null;
  let practitionerId: string | null = null;

  const staffRes = await pool.query(
    `SELECT id FROM staff_profiles WHERE (user_id IS NOT NULL AND user_id = $1) OR LOWER(email::text) = LOWER($2) LIMIT 1`,
    [coreUserId, email],
  );
  if (staffRes.rows.length > 0) {
    staffProfileId = String(staffRes.rows[0].id);
    const pracRes = await pool.query(
      `SELECT id FROM practitioners WHERE staff_profile_id = $1 LIMIT 1`,
      [staffProfileId],
    );
    if (pracRes.rows.length > 0) {
      practitionerId = String(pracRes.rows[0].id);
    }
  }

  let patientProfileId: string | null = null;
  const patientRes = await pool.query(
    `SELECT id FROM patient_profiles WHERE (user_id IS NOT NULL AND user_id = $1) OR LOWER(email::text) = LOWER($2) LIMIT 1`,
    [coreUserId, email],
  );
  if (patientRes.rows.length > 0) {
    patientProfileId = String(patientRes.rows[0].id);
  }

  const tableCounts: TableCount[] = [];

  async function checkCount(tableName: string, sql: string, params: unknown[]): Promise<void> {
    try {
      const r = await pool.query(sql, params);
      const cnt = parseInt(r.rows[0]?.count ?? '0', 10);
      if (cnt > 0) {
        tableCounts.push({ tableName, rowCount: cnt });
      }
    } catch {
      // Ignore non-existent tables or query issues
    }
  }

  if (authUserId) {
    await checkCount('user (Better Auth)', 'SELECT count(*) FROM "user" WHERE id = $1', [authUserId]);
    await checkCount('session', 'SELECT count(*) FROM "session" WHERE "userId" = $1', [authUserId]);
    await checkCount('account', 'SELECT count(*) FROM "account" WHERE "userId" = $1', [authUserId]);
  }
  await checkCount('verification', 'SELECT count(*) FROM "verification" WHERE identifier = $1', [email]);

  if (coreUserId) {
    await checkCount('users', 'SELECT count(*) FROM users WHERE id = $1', [coreUserId]);
    await checkCount('user_roles', 'SELECT count(*) FROM user_roles WHERE user_id = $1', [coreUserId]);
    await checkCount('user_devices', 'SELECT count(*) FROM user_devices WHERE user_id = $1', [coreUserId]);
    await checkCount('user_data_export_jobs', 'SELECT count(*) FROM user_data_export_jobs WHERE requested_by = $1', [coreUserId]);
    await checkCount('auth_accounts', 'SELECT count(*) FROM auth_accounts WHERE user_id = $1', [coreUserId]);
    await checkCount('auth_sessions', 'SELECT count(*) FROM auth_sessions WHERE user_id = $1', [coreUserId]);
    await checkCount('auth_two_factors', 'SELECT count(*) FROM auth_two_factors WHERE user_id = $1', [coreUserId]);
    await checkCount('auth_verifications', 'SELECT count(*) FROM auth_verifications WHERE identifier = $1', [email]);
    await checkCount('audit_logs', 'SELECT count(*) FROM audit_logs WHERE actor_user_id = $1', [coreUserId]);
    await checkCount('files', 'SELECT count(*) FROM files WHERE uploaded_by = $1', [coreUserId]);
    await checkCount('notifications (created)', 'SELECT count(*) FROM notifications WHERE created_by = $1', [coreUserId]);
    await checkCount('notification_recipients', 'SELECT count(*) FROM notification_recipients WHERE user_id = $1', [coreUserId]);
    await checkCount('support_tickets (reported)', 'SELECT count(*) FROM support_tickets WHERE reporter_user_id = $1', [coreUserId]);
    await checkCount('support_ticket_messages', 'SELECT count(*) FROM support_ticket_messages WHERE sender_user_id = $1', [coreUserId]);
    await checkCount('conversation_participants', 'SELECT count(*) FROM conversation_participants WHERE user_id = $1', [coreUserId]);
    await checkCount('messages', 'SELECT count(*) FROM messages WHERE sender_user_id = $1', [coreUserId]);
    await checkCount('attendance_qr_sessions (created)', 'SELECT count(*) FROM attendance_qr_sessions WHERE created_by = $1', [coreUserId]);
    await checkCount('clinical_encounters (created)', 'SELECT count(*) FROM clinical_encounters WHERE created_by = $1', [coreUserId]);
    await checkCount('appointments (created/updated)', 'SELECT count(*) FROM appointments WHERE created_by = $1 OR updated_by = $1', [coreUserId]);
    await checkCount('appointment_status_events', 'SELECT count(*) FROM appointment_status_events WHERE changed_by = $1', [coreUserId]);
  }

  if (staffProfileId) {
    await checkCount('staff_profiles', 'SELECT count(*) FROM staff_profiles WHERE id = $1', [staffProfileId]);
    await checkCount('staff_credentials', 'SELECT count(*) FROM staff_credentials WHERE staff_profile_id = $1', [staffProfileId]);
    await checkCount('staff_attendance_records', 'SELECT count(*) FROM staff_attendance_records WHERE staff_profile_id = $1', [staffProfileId]);
    await checkCount('staff_leave_requests', 'SELECT count(*) FROM staff_leave_requests WHERE staff_profile_id = $1', [staffProfileId]);
    await checkCount('attendance_qr_sessions (staff)', 'SELECT count(*) FROM attendance_qr_sessions WHERE staff_profile_id = $1', [staffProfileId]);
  }

  if (practitionerId) {
    await checkCount('practitioners', 'SELECT count(*) FROM practitioners WHERE id = $1', [practitionerId]);
    await checkCount('doctor_assignment', 'SELECT count(*) FROM doctor_assignment WHERE doctor_id = $1', [practitionerId]);
    await checkCount('shift_exception', 'SELECT count(*) FROM shift_exception WHERE doctor_id = $1', [practitionerId]);
    await checkCount('appointments (as doctor)', 'SELECT count(*) FROM appointments WHERE practitioner_id = $1', [practitionerId]);
    await checkCount('queue_tickets (as doctor)', 'SELECT count(*) FROM queue_tickets qt JOIN appointments a ON qt.appointment_id = a.id WHERE a.practitioner_id = $1', [practitionerId]);
  }

  if (patientProfileId) {
    await checkCount('patient_profiles', 'SELECT count(*) FROM patient_profiles WHERE id = $1', [patientProfileId]);
    await checkCount('patient_addresses', 'SELECT count(*) FROM patient_addresses WHERE patient_id = $1', [patientProfileId]);
    await checkCount('patient_allergies', 'SELECT count(*) FROM patient_allergies WHERE patient_id = $1', [patientProfileId]);
    await checkCount('patient_emergency_contacts', 'SELECT count(*) FROM patient_emergency_contacts WHERE patient_id = $1', [patientProfileId]);
    await checkCount('patient_timeline_events', 'SELECT count(*) FROM patient_timeline_events WHERE patient_id = $1', [patientProfileId]);
    await checkCount('medical_intake_submissions', 'SELECT count(*) FROM medical_intake_submissions WHERE patient_id = $1', [patientProfileId]);
    await checkCount('clinical_encounters (patient)', 'SELECT count(*) FROM clinical_encounters WHERE patient_id = $1', [patientProfileId]);
    await checkCount('appointments (as patient)', 'SELECT count(*) FROM appointments WHERE patient_id = $1', [patientProfileId]);
    await checkCount('queue_tickets (as patient)', 'SELECT count(*) FROM queue_tickets qt JOIN appointments a ON qt.appointment_id = a.id WHERE a.patient_id = $1', [patientProfileId]);
    await checkCount('public_testimonials', 'SELECT count(*) FROM public_testimonials WHERE patient_id = $1', [patientProfileId]);
  }

  const targetAggIds = [coreUserId, authUserId].filter(Boolean) as string[];
  if (targetAggIds.length > 0) {
    await checkCount(
      'outbox_events',
      'SELECT count(*) FROM outbox_events WHERE aggregate_id = ANY($1) OR payload::text LIKE $2',
      [targetAggIds, `%${email}%`],
    );
  }

  const totalDbRows = tableCounts.reduce((acc, curr) => acc + curr.rowCount, 0);

  let avatarDirExists = false;
  let avatarDirPath: string | null = null;
  const potentialPaths = [
    coreUserId ? resolve(resolvedStorageRoot, 'avatars', coreUserId) : null,
    authUserId ? resolve(resolvedStorageRoot, 'avatars', authUserId) : null,
  ].filter(Boolean) as string[];

  for (const p of potentialPaths) {
    if (existsSync(p)) {
      avatarDirExists = true;
      avatarDirPath = p;
      break;
    }
  }

  let redisKeyCount = 0;
  if (redisClient) {
    try {
      const patterns = [
        coreUserId ? `*${coreUserId}*` : null,
        authUserId ? `*${authUserId}*` : null,
        `*${email}*`,
      ].filter(Boolean) as string[];

      const foundKeys = new Set<string>();
      for (const pat of patterns) {
        const keys = await redisClient.keys(pat);
        for (const k of keys) foundKeys.add(k);
      }
      redisKeyCount = foundKeys.size;
    } catch {
      redisKeyCount = 0;
    }
  }

  return {
    coreUserId,
    authUserId,
    email,
    name,
    roles,
    staffProfileId,
    practitionerId,
    patientProfileId,
    tableCounts,
    totalDbRows,
    avatarDirExists,
    avatarDirPath,
    redisKeyCount,
  };
}

export function renderInspectionResult(inspection: UserInspectionResult): void {
  printSection('User Relational Inspection');
  console.log(` Name        : ${inspection.name}`);
  console.log(` Email       : ${inspection.email}`);
  console.log(` Core ID     : ${inspection.coreUserId || '(none)'}`);
  console.log(` Auth ID     : ${inspection.authUserId || '(none)'}`);
  console.log(` Roles       : ${inspection.roles.length > 0 ? inspection.roles.join(', ') : 'none'}`);
  console.log(` Staff ID    : ${inspection.staffProfileId || '(none)'}`);
  console.log(` Doctor ID   : ${inspection.practitionerId || '(none)'}`);
  console.log(` Patient ID  : ${inspection.patientProfileId || '(none)'}`);

  console.log('\nRelational Records Found in Database:');
  const tblW = 38;
  const cntW = 8;
  console.log(padRight('Table Name', tblW) + ' ' + padRight('Rows', cntW));
  console.log('-'.repeat(tblW + cntW + 1));

  if (inspection.tableCounts.length === 0) {
    console.log(' (No records found across tables)');
  } else {
    for (const tc of inspection.tableCounts) {
      console.log(padRight(tc.tableName, tblW) + ' ' + padRight(String(tc.rowCount), cntW));
    }
  }

  console.log('-'.repeat(tblW + cntW + 1));
  console.log(`Total Database Rows to Purge : ${inspection.totalDbRows}`);
  console.log(`Disk Avatar Storage Exists   : ${inspection.avatarDirExists ? `YES (${inspection.avatarDirPath})` : 'NO'}`);
  console.log(`Redis Cache Keys Found       : ${inspection.redisKeyCount}`);
}
