import type * as readline from 'node:readline/promises';
import { Pool, type PoolClient } from 'pg';
import type Redis from 'ioredis';
import { invalidateRedisTagsAndPrefixes } from './db-connection';
import {
  printSection,
  padRight,
  askSafeQuestion,
  confirmPurge,
  isUuid,
} from './purge-helpers';

export interface DoctorListItem {
  practitionerId: string;
  staffProfileId: string;
  userId: string | null;
  staffCode: string;
  name: string;
  email: string;
  specialty: string;
  sessionCount: number;
  appointmentCount: number;
}

export interface DoctorPurgeInspection {
  mode: 'ALL' | 'DOCTOR';
  practitionerId?: string;
  staffProfileId?: string;
  userId?: string | null;
  doctorName?: string;
  email?: string;
  practitionerCount: number;
  sessionCount: number;
  credentialCount: number;
  attendanceCount: number;
  leaveRequestCount: number;
  appointmentCount: number;
  encounterCount: number;
  hasLinkedUser: boolean;
}

export async function fetchDoctorsList(pool: Pool, search?: string): Promise<DoctorListItem[]> {
  let whereClause = '';
  const params: unknown[] = [];

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClause = `
      AND (
        LOWER(p.display_name) LIKE $1 
        OR LOWER(sp.full_name) LIKE $1 
        OR LOWER(sp.staff_code) LIKE $1
        OR LOWER(COALESCE(u.email::text, sp.email::text, '')) LIKE $1
        OR p.id::text LIKE $1
      )
    `;
  }

  const query = `
    SELECT 
      p.id AS practitioner_id,
      sp.id AS staff_profile_id,
      sp.user_id,
      sp.staff_code,
      p.display_name AS doctor_name,
      COALESCE(u.email::text, sp.email::text, '-') AS email,
      COALESCE(ms.name, 'General') AS specialty,
      COUNT(DISTINCT da.id) AS session_count,
      COUNT(DISTINCT a.id) AS appointment_count
    FROM practitioners p
    JOIN staff_profiles sp ON p.staff_profile_id = sp.id
    LEFT JOIN users u ON sp.user_id = u.id
    LEFT JOIN medical_specialties ms ON p.specialty_id = ms.id
    LEFT JOIN doctor_assignment da ON da.doctor_id = p.id
    LEFT JOIN appointments a ON a.practitioner_id = p.id
    WHERE 1=1 ${whereClause}
    GROUP BY p.id, sp.id, sp.user_id, sp.staff_code, p.display_name, u.email, sp.email, ms.name
    ORDER BY p.display_name ASC;
  `;

  const res = await pool.query(query, params);
  return res.rows.map((r) => ({
    practitionerId: String(r.practitioner_id),
    staffProfileId: String(r.staff_profile_id),
    userId: r.user_id ? String(r.user_id) : null,
    staffCode: String(r.staff_code),
    name: String(r.doctor_name),
    email: String(r.email),
    specialty: String(r.specialty),
    sessionCount: Number(r.session_count),
    appointmentCount: Number(r.appointment_count),
  }));
}

export async function inspectAllDoctors(pool: Pool): Promise<DoctorPurgeInspection> {
  const [pracs, sess, creds, att, leaves, appts, encs] = await Promise.all([
    pool.query('SELECT count(*) FROM practitioners'),
    pool.query('SELECT count(*) FROM doctor_assignment'),
    pool.query('SELECT count(*) FROM staff_credentials'),
    pool.query('SELECT count(*) FROM staff_attendance_records'),
    pool.query('SELECT count(*) FROM staff_leave_requests'),
    pool.query('SELECT count(*) FROM appointments WHERE practitioner_id IS NOT NULL'),
    pool.query('SELECT count(*) FROM clinical_encounters WHERE practitioner_id IS NOT NULL'),
  ]);

  return {
    mode: 'ALL',
    practitionerCount: parseInt(pracs.rows[0]?.count ?? '0', 10),
    sessionCount: parseInt(sess.rows[0]?.count ?? '0', 10),
    credentialCount: parseInt(creds.rows[0]?.count ?? '0', 10),
    attendanceCount: parseInt(att.rows[0]?.count ?? '0', 10),
    leaveRequestCount: parseInt(leaves.rows[0]?.count ?? '0', 10),
    appointmentCount: parseInt(appts.rows[0]?.count ?? '0', 10),
    encounterCount: parseInt(encs.rows[0]?.count ?? '0', 10),
    hasLinkedUser: true,
  };
}

export async function inspectDoctor(
  pool: Pool,
  doctorIdentifier: string,
): Promise<DoctorPurgeInspection | null> {
  const targetIsUuid = isUuid(doctorIdentifier);

  const docQuery = targetIsUuid
    ? `
      SELECT p.id AS practitioner_id, sp.id AS staff_profile_id, sp.user_id, p.display_name, COALESCE(u.email::text, sp.email::text, '-') as email
      FROM practitioners p
      JOIN staff_profiles sp ON p.staff_profile_id = sp.id
      LEFT JOIN users u ON sp.user_id = u.id
      WHERE p.id = $1::uuid OR sp.id = $1::uuid OR sp.user_id = $1::uuid
      LIMIT 1;
    `
    : `
      SELECT p.id AS practitioner_id, sp.id AS staff_profile_id, sp.user_id, p.display_name, COALESCE(u.email::text, sp.email::text, '-') as email
      FROM practitioners p
      JOIN staff_profiles sp ON p.staff_profile_id = sp.id
      LEFT JOIN users u ON sp.user_id = u.id
      WHERE LOWER(p.display_name) LIKE LOWER($1) OR LOWER(sp.full_name) LIKE LOWER($1) OR LOWER(sp.staff_code) = LOWER($1)
      LIMIT 1;
    `;

  const docRes = await pool.query(docQuery, [targetIsUuid ? doctorIdentifier.trim() : `%${doctorIdentifier.trim()}%`]);
  if (docRes.rows.length === 0) return null;

  const row = docRes.rows[0];
  const practitionerId = String(row.practitioner_id);
  const staffProfileId = String(row.staff_profile_id);
  const userId = row.user_id ? String(row.user_id) : null;
  const doctorName = String(row.display_name);
  const email = String(row.email);

  const [sess, creds, att, leaves, appts, encs] = await Promise.all([
    pool.query('SELECT count(*) FROM doctor_assignment WHERE doctor_id = $1', [practitionerId]),
    pool.query('SELECT count(*) FROM staff_credentials WHERE staff_profile_id = $1', [staffProfileId]),
    pool.query('SELECT count(*) FROM staff_attendance_records WHERE staff_profile_id = $1', [staffProfileId]),
    pool.query('SELECT count(*) FROM staff_leave_requests WHERE staff_profile_id = $1', [staffProfileId]),
    pool.query('SELECT count(*) FROM appointments WHERE practitioner_id = $1', [practitionerId]),
    pool.query('SELECT count(*) FROM clinical_encounters WHERE practitioner_id = $1', [practitionerId]),
  ]);

  return {
    mode: 'DOCTOR',
    practitionerId,
    staffProfileId,
    userId,
    doctorName,
    email,
    practitionerCount: 1,
    sessionCount: parseInt(sess.rows[0]?.count ?? '0', 10),
    credentialCount: parseInt(creds.rows[0]?.count ?? '0', 10),
    attendanceCount: parseInt(att.rows[0]?.count ?? '0', 10),
    leaveRequestCount: parseInt(leaves.rows[0]?.count ?? '0', 10),
    appointmentCount: parseInt(appts.rows[0]?.count ?? '0', 10),
    encounterCount: parseInt(encs.rows[0]?.count ?? '0', 10),
    hasLinkedUser: Boolean(userId),
  };
}

export async function executeDoctorPurge(
  pool: Pool,
  redisClient: Redis | null,
  options: { isAll: boolean; practitionerId?: string; staffProfileId?: string; purgeLinkedUserAccount?: boolean; userId?: string | null },
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN');

    let deletedPracs = 0;

    if (options.isAll) {
      await client.query('DELETE FROM clinic_closure WHERE scope = \'doctor\'');
      await client.query('UPDATE appointments SET practitioner_id = NULL');
      await client.query('UPDATE clinical_encounters SET practitioner_id = NULL');
      await client.query('UPDATE conversations SET assigned_practitioner_id = NULL, assigned_staff_id = NULL');
      await client.query('UPDATE support_tickets SET assigned_staff_id = NULL');
      await client.query('UPDATE staff_leave_requests SET substitute_practitioner_id = NULL, practitioner_id = NULL');

      await client.query('DELETE FROM shift_exception');
      await client.query('DELETE FROM doctor_assignment');

      const delPracs = await client.query('DELETE FROM practitioners');
      deletedPracs = delPracs.rowCount ?? 0;

      await client.query('DELETE FROM attendance_qr_sessions WHERE staff_profile_id IS NOT NULL');
      await client.query('DELETE FROM staff_attendance_records');
      await client.query('DELETE FROM staff_leave_requests');
      await client.query('DELETE FROM staff_credentials');
      await client.query('DELETE FROM staff_profiles');
    } else if (options.practitionerId && options.staffProfileId) {
      const pid = options.practitionerId;
      const spid = options.staffProfileId;

      await client.query('DELETE FROM clinic_closure WHERE doctor_id = $1', [pid]);
      await client.query('UPDATE appointments SET practitioner_id = NULL WHERE practitioner_id = $1', [pid]);
      await client.query('UPDATE clinical_encounters SET practitioner_id = NULL WHERE practitioner_id = $1', [pid]);
      await client.query('UPDATE conversations SET assigned_practitioner_id = NULL WHERE assigned_practitioner_id = $1', [pid]);
      await client.query('UPDATE staff_leave_requests SET substitute_practitioner_id = NULL, practitioner_id = NULL WHERE substitute_practitioner_id = $1 OR practitioner_id = $1', [pid]);

      await client.query('DELETE FROM shift_exception WHERE doctor_id = $1', [pid]);
      await client.query('DELETE FROM doctor_assignment WHERE doctor_id = $1', [pid]);

      const delPrac = await client.query('DELETE FROM practitioners WHERE id = $1', [pid]);
      deletedPracs = delPrac.rowCount ?? 0;

      await client.query('DELETE FROM attendance_qr_sessions WHERE staff_profile_id = $1', [spid]);
      await client.query('DELETE FROM staff_attendance_records WHERE staff_profile_id = $1', [spid]);
      await client.query('DELETE FROM staff_leave_requests WHERE staff_profile_id = $1', [spid]);
      await client.query('DELETE FROM staff_credentials WHERE staff_profile_id = $1', [spid]);
      await client.query('UPDATE conversations SET assigned_staff_id = NULL WHERE assigned_staff_id = $1', [spid]);
      await client.query('UPDATE support_tickets SET assigned_staff_id = NULL WHERE assigned_staff_id = $1', [spid]);
      await client.query('DELETE FROM staff_profiles WHERE id = $1', [spid]);

      if (options.purgeLinkedUserAccount && options.userId) {
        await client.query('SELECT purge_user_systemic($1)', [options.userId]);
      }
    }

    await client.query('COMMIT');

    await invalidateRedisTagsAndPrefixes(
      redisClient,
      ['schedule', 'schedule:list', 'schedule:detail', 'schedule:ref', 'schedule:patients', 'booking', 'appointments'],
      ['*schedule*', '*booking*'],
    );

    return { success: true, deletedCount: deletedPracs };
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, deletedCount: 0, error: msg };
  } finally {
    client.release();
  }
}

function renderInspection(insp: DoctorPurgeInspection): void {
  printSection('Doctor / Practitioner Purge Inspection');
  if (insp.mode === 'ALL') {
    console.log(' Scope                 : ALL DOCTORS & PRACTITIONERS (Clinic-wide)');
    console.log(` Practitioners to Flush : ${insp.practitionerCount}`);
  } else {
    console.log(` Doctor Name          : ${insp.doctorName}`);
    console.log(` Email                : ${insp.email}`);
    console.log(` Practitioner ID      : ${insp.practitionerId}`);
    console.log(` Staff Profile ID     : ${insp.staffProfileId}`);
    console.log(` Linked User Account  : ${insp.userId ? `YES (${insp.userId})` : 'NO'}`);
  }
  console.log(` Schedule Sessions     : ${insp.sessionCount}`);
  console.log(` Staff Credentials     : ${insp.credentialCount}`);
  console.log(` Attendance Records    : ${insp.attendanceCount}`);
  console.log(` Leave Requests        : ${insp.leaveRequestCount}`);
  console.log(` Linked Appointments   : ${insp.appointmentCount} (will be unlinked)`);
  console.log(` Clinical Encounters   : ${insp.encounterCount} (will be unlinked)`);
}

function renderDoctorsList(list: DoctorListItem[]): void {
  if (list.length === 0) {
    console.log('No doctors found.');
    return;
  }

  const idxW = 4;
  const codeW = 10;
  const nameW = 24;
  const specW = 14;
  const sessW = 8;
  const emailW = 28;

  console.log(
    padRight('#', idxW) + ' ' +
    padRight('Code', codeW) + ' ' +
    padRight('Doctor Name', nameW) + ' ' +
    padRight('Specialty', specW) + ' ' +
    padRight('Sessions', sessW) + ' ' +
    padRight('Email', emailW)
  );
  console.log('-'.repeat(idxW + codeW + nameW + specW + sessW + emailW + 5));

  list.forEach((d, i) => {
    console.log(
      padRight(String(i + 1), idxW) + ' ' +
      padRight(d.staffCode, codeW) + ' ' +
      padRight(d.name, nameW) + ' ' +
      padRight(d.specialty, specW) + ' ' +
      padRight(String(d.sessionCount), sessW) + ' ' +
      padRight(d.email, emailW)
    );
  });
  console.log(`\nShowing ${list.length} doctor(s).`);
}

export async function runDoctorPurgeInteractive(
  pool: Pool,
  redisClient: Redis | null,
  rl: readline.Interface,
): Promise<void> {
  while (true) {
    const totalPracRes = await pool.query('SELECT count(*) FROM practitioners');
    const doctorCount = parseInt(totalPracRes.rows[0]?.count ?? '0', 10);

    printSection(`Doctor / Practitioner Purge Menu [Total Doctors in DB: ${doctorCount}]`);
    console.log('Options:');
    console.log(' [1] Purge ALL Doctors (Flush all practitioners, staff profiles, and schedules)');
    console.log(' [2] List Doctors & Purge a Specific Doctor');
    console.log(' [3] Search Doctor by Keyword (Name / Code / Specialty / UUID)');
    console.log(' [4] Direct Input: Enter Practitioner UUID or Staff Code');
    console.log(' [b] Back to Main Menu\n');

    const choice = await askSafeQuestion(rl, 'Enter selection [1-4 or b]: ');
    if (!choice || choice.toLowerCase() === 'b' || choice.toLowerCase() === 'back') {
      break;
    }

    if (choice === '1') {
      const insp = await inspectAllDoctors(pool);
      renderInspection(insp);

      if (insp.practitionerCount === 0) {
        console.log('\n[INFO] Zero doctors found in database.');
        continue;
      }

      const confirmed = await confirmPurge(
        rl,
        'ALL DOCTORS & PRACTITIONERS (CLINIC-WIDE)',
        insp.practitionerCount + insp.sessionCount + insp.credentialCount,
        'All doctor profiles, credentials, attendance, and schedules will be deleted. Appointments and encounters will have practitioner_id set to NULL.',
      );

      if (!confirmed) {
        console.log('[INFO] Purge canceled.');
        continue;
      }

      console.log('\n[INFO] Executing clinic-wide doctor flush...');
      const res = await executeDoctorPurge(pool, redisClient, { isAll: true });

      if (res.success) {
        console.log(`\n[SUCCESS] Flushed ${res.deletedCount} doctor profile(s) and affiliated schedules.`);
      } else {
        console.log(`\n[ERROR] Failed to purge doctors: ${res.error}`);
      }
      continue;
    }

    let doctors: DoctorListItem[] = [];

    if (choice === '2') {
      doctors = await fetchDoctorsList(pool);
      renderDoctorsList(doctors);
    } else if (choice === '3') {
      const kw = await askSafeQuestion(rl, 'Enter doctor search keyword: ');
      if (!kw) continue;
      doctors = await fetchDoctorsList(pool, kw);
      renderDoctorsList(doctors);
    } else if (choice === '4') {
      // Direct input
    } else {
      console.log('[WARN] Invalid option.');
      continue;
    }

    console.log('\nTo purge a doctor:');
    console.log('- Enter row number from list (e.g. 1)');
    console.log('- Or paste Practitioner UUID / Staff Code / Name');
    console.log('- Or press Enter / "c" to cancel.');

    const targetInput = await askSafeQuestion(rl, '\nSelect Doctor: ');
    if (!targetInput || targetInput.toLowerCase() === 'c') {
      console.log('[INFO] Selection canceled.');
      continue;
    }

    let targetIdentifier = targetInput;
    const num = parseInt(targetInput, 10);
    if (!isNaN(num) && num >= 1 && num <= doctors.length) {
      targetIdentifier = doctors[num - 1].practitionerId;
    }

    console.log(`\n[INFO] Inspecting doctor: ${targetIdentifier} ...`);
    const insp = await inspectDoctor(pool, targetIdentifier);

    if (!insp) {
      console.log(`[ERROR] Doctor not found: ${targetIdentifier}`);
      continue;
    }

    renderInspection(insp);

    let purgeUser = false;
    if (insp.hasLinkedUser) {
      const userAns = await askSafeQuestion(
        rl,
        `\nAlso purge linked login user account (${insp.email})? [y/N]: `,
      );
      purgeUser = userAns?.toLowerCase() === 'y';
    }

    const confirmed = await confirmPurge(
      rl,
      `Dr. ${insp.doctorName} (${insp.email})`,
      insp.sessionCount + insp.credentialCount + 2,
      purgeUser
        ? 'Doctor practitioner, staff profile, schedules, and login user account will be permanently deleted.'
        : 'Doctor practitioner, staff profile, and schedules will be deleted. The user login account will be preserved.',
    );

    if (!confirmed) {
      console.log('[INFO] Purge canceled.');
      continue;
    }

    console.log('\n[INFO] Executing doctor purge...');
    const res = await executeDoctorPurge(pool, redisClient, {
      isAll: false,
      practitionerId: insp.practitionerId,
      staffProfileId: insp.staffProfileId,
      userId: insp.userId,
      purgeLinkedUserAccount: purgeUser,
    });

    if (res.success) {
      console.log(`\n[SUCCESS] Successfully purged Dr. ${insp.doctorName}.`);
    } else {
      console.log(`\n[ERROR] Failed to purge doctor: ${res.error}`);
    }
  }
}
