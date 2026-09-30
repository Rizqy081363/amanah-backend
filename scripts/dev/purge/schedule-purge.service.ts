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

export interface DoctorScheduleSummary {
  practitionerId: string;
  doctorName: string;
  specialty: string;
  sessionCount: number;
  daySettingCount: number;
  availabilityCount: number;
  closureCount: number;
  appointmentCount: number;
}

export interface SchedulePurgeInspection {
  mode: 'ALL' | 'DOCTOR';
  practitionerId?: string;
  doctorName?: string;
  sessionCount: number;
  daySettingCount: number;
  availabilityCount: number;
  closureCount: number;
  rescheduleCount: number;
  leavePeriodCount: number;
  linkedAppointmentsCount: number;
}

export async function fetchDoctorsWithSchedules(
  pool: Pool,
  search?: string,
): Promise<DoctorScheduleSummary[]> {
  let whereClause = '';
  const params: unknown[] = [];

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClause = `
      AND (
        LOWER(p.display_name) LIKE $1 
        OR LOWER(sp.full_name) LIKE $1 
        OR LOWER(COALESCE(ms.name, '')) LIKE $1
        OR p.id::text LIKE $1
      )
    `;
  }

  const query = `
    SELECT 
      p.id AS practitioner_id,
      p.display_name AS doctor_name,
      COALESCE(ms.name, 'General') AS specialty,
      COUNT(DISTINCT s.id) AS session_count,
      COUNT(DISTINCT ds.id) AS day_setting_count,
      COUNT(DISTINCT pa.id) AS availability_count,
      COUNT(DISTINCT sc.id) AS closure_count,
      COUNT(DISTINCT a.id) AS appointment_count
    FROM practitioners p
    JOIN staff_profiles sp ON p.staff_profile_id = sp.id
    LEFT JOIN medical_specialties ms ON p.specialty_id = ms.id
    LEFT JOIN practitioner_schedule_sessions s ON s.practitioner_id = p.id
    LEFT JOIN practitioner_schedule_day_settings ds ON ds.practitioner_id = p.id
    LEFT JOIN practitioner_availability pa ON pa.practitioner_id = p.id
    LEFT JOIN practitioner_schedule_closures sc ON sc.practitioner_id = p.id
    LEFT JOIN appointments a ON a.practitioner_id = p.id OR a.schedule_session_id = s.id
    WHERE 1=1 ${whereClause}
    GROUP BY p.id, p.display_name, ms.name
    ORDER BY session_count DESC, p.display_name ASC;
  `;

  const res = await pool.query(query, params);
  return res.rows.map((r) => ({
    practitionerId: String(r.practitioner_id),
    doctorName: String(r.doctor_name),
    specialty: String(r.specialty),
    sessionCount: Number(r.session_count),
    daySettingCount: Number(r.day_setting_count),
    availabilityCount: Number(r.availability_count),
    closureCount: Number(r.closure_count),
    appointmentCount: Number(r.appointment_count),
  }));
}

export async function inspectAllSchedules(pool: Pool): Promise<SchedulePurgeInspection> {
  const [sessions, days, avail, closures, resched, leaves, appts] = await Promise.all([
    pool.query('SELECT count(*) FROM practitioner_schedule_sessions'),
    pool.query('SELECT count(*) FROM practitioner_schedule_day_settings'),
    pool.query('SELECT count(*) FROM practitioner_availability'),
    pool.query('SELECT count(*) FROM practitioner_schedule_closures'),
    pool.query('SELECT count(*) FROM schedule_reschedule_events'),
    pool.query('SELECT count(*) FROM practitioner_leave_periods'),
    pool.query('SELECT count(*) FROM appointments WHERE schedule_session_id IS NOT NULL'),
  ]);

  return {
    mode: 'ALL',
    sessionCount: parseInt(sessions.rows[0]?.count ?? '0', 10),
    daySettingCount: parseInt(days.rows[0]?.count ?? '0', 10),
    availabilityCount: parseInt(avail.rows[0]?.count ?? '0', 10),
    closureCount: parseInt(closures.rows[0]?.count ?? '0', 10),
    rescheduleCount: parseInt(resched.rows[0]?.count ?? '0', 10),
    leavePeriodCount: parseInt(leaves.rows[0]?.count ?? '0', 10),
    linkedAppointmentsCount: parseInt(appts.rows[0]?.count ?? '0', 10),
  };
}

export async function inspectDoctorSchedules(
  pool: Pool,
  doctorIdentifier: string,
): Promise<SchedulePurgeInspection | null> {
  const targetIsUuid = isUuid(doctorIdentifier);

  const docQuery = targetIsUuid
    ? `
      SELECT p.id, p.display_name 
      FROM practitioners p
      LEFT JOIN staff_profiles sp ON p.staff_profile_id = sp.id
      WHERE p.id = $1::uuid OR sp.id = $1::uuid OR sp.user_id = $1::uuid
      LIMIT 1;
    `
    : `
      SELECT p.id, p.display_name 
      FROM practitioners p
      LEFT JOIN staff_profiles sp ON p.staff_profile_id = sp.id
      WHERE LOWER(p.display_name) LIKE LOWER($1) OR LOWER(sp.full_name) LIKE LOWER($1)
      LIMIT 1;
    `;

  const docRes = await pool.query(docQuery, [targetIsUuid ? doctorIdentifier.trim() : `%${doctorIdentifier.trim()}%`]);
  if (docRes.rows.length === 0) return null;

  const practitionerId = String(docRes.rows[0].id);
  const doctorName = String(docRes.rows[0].display_name);

  const [sessions, days, avail, closures, resched, leaves, appts] = await Promise.all([
    pool.query('SELECT count(*) FROM practitioner_schedule_sessions WHERE practitioner_id = $1', [practitionerId]),
    pool.query('SELECT count(*) FROM practitioner_schedule_day_settings WHERE practitioner_id = $1', [practitionerId]),
    pool.query('SELECT count(*) FROM practitioner_availability WHERE practitioner_id = $1', [practitionerId]),
    pool.query('SELECT count(*) FROM practitioner_schedule_closures WHERE practitioner_id = $1', [practitionerId]),
    pool.query('SELECT count(*) FROM schedule_reschedule_events WHERE practitioner_id = $1', [practitionerId]),
    pool.query('SELECT count(*) FROM practitioner_leave_periods WHERE practitioner_id = $1', [practitionerId]),
    pool.query(
      `SELECT count(*) FROM appointments WHERE practitioner_id = $1 OR schedule_session_id IN (
        SELECT id FROM practitioner_schedule_sessions WHERE practitioner_id = $1
      )`,
      [practitionerId],
    ),
  ]);

  return {
    mode: 'DOCTOR',
    practitionerId,
    doctorName,
    sessionCount: parseInt(sessions.rows[0]?.count ?? '0', 10),
    daySettingCount: parseInt(days.rows[0]?.count ?? '0', 10),
    availabilityCount: parseInt(avail.rows[0]?.count ?? '0', 10),
    closureCount: parseInt(closures.rows[0]?.count ?? '0', 10),
    rescheduleCount: parseInt(resched.rows[0]?.count ?? '0', 10),
    leavePeriodCount: parseInt(leaves.rows[0]?.count ?? '0', 10),
    linkedAppointmentsCount: parseInt(appts.rows[0]?.count ?? '0', 10),
  };
}

export async function executeSchedulePurge(
  pool: Pool,
  redisClient: Redis | null,
  options: { isAll: boolean; practitionerId?: string; deleteAppointments?: boolean },
): Promise<{ success: boolean; deletedSessions: number; error?: string }> {
  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN');

    let deletedSessions = 0;

    if (options.isAll) {
      await client.query('DELETE FROM schedule_reschedule_events');
      await client.query('DELETE FROM practitioner_schedule_closures');

      if (options.deleteAppointments) {
        await client.query('DELETE FROM appointment_call_attempts');
        await client.query('DELETE FROM queue_tickets WHERE appointment_id IS NOT NULL');
        await client.query('DELETE FROM appointment_status_events');
        await client.query('DELETE FROM medical_intake_submissions WHERE appointment_id IS NOT NULL');
        await client.query('UPDATE clinical_encounters SET appointment_id = NULL WHERE appointment_id IS NOT NULL');
        await client.query('UPDATE patient_timeline_events SET appointment_id = NULL WHERE appointment_id IS NOT NULL');
        await client.query('DELETE FROM appointments');
      } else {
        await client.query('UPDATE appointments SET schedule_session_id = NULL WHERE schedule_session_id IS NOT NULL');
      }

      const delSess = await client.query('DELETE FROM practitioner_schedule_sessions');
      deletedSessions = delSess.rowCount ?? 0;

      await client.query('DELETE FROM practitioner_schedule_day_settings');
      await client.query('DELETE FROM practitioner_availability');
      await client.query('DELETE FROM practitioner_leave_periods');
    } else if (options.practitionerId) {
      const pid = options.practitionerId;

      await client.query('DELETE FROM schedule_reschedule_events WHERE practitioner_id = $1', [pid]);
      await client.query('DELETE FROM practitioner_schedule_closures WHERE practitioner_id = $1', [pid]);

      if (options.deleteAppointments) {
        const apptQuery = `
          SELECT id FROM appointments 
          WHERE practitioner_id = $1 
             OR schedule_session_id IN (SELECT id FROM practitioner_schedule_sessions WHERE practitioner_id = $1)
        `;
        const apptRes = await client.query(apptQuery, [pid]);
        const apptIds = apptRes.rows.map((r) => String(r.id));

        if (apptIds.length > 0) {
          await client.query('DELETE FROM appointment_call_attempts WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
          await client.query('DELETE FROM queue_tickets WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
          await client.query('DELETE FROM appointment_status_events WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
          await client.query('DELETE FROM medical_intake_submissions WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
          await client.query('UPDATE clinical_encounters SET appointment_id = NULL WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
          await client.query('UPDATE patient_timeline_events SET appointment_id = NULL WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
          await client.query('DELETE FROM appointments WHERE id = ANY($1::uuid[])', [apptIds]);
        }
      } else {
        await client.query(
          `UPDATE appointments SET schedule_session_id = NULL WHERE schedule_session_id IN (
            SELECT id FROM practitioner_schedule_sessions WHERE practitioner_id = $1
          )`,
          [pid],
        );
      }

      const delSess = await client.query('DELETE FROM practitioner_schedule_sessions WHERE practitioner_id = $1', [pid]);
      deletedSessions = delSess.rowCount ?? 0;

      await client.query('DELETE FROM practitioner_schedule_day_settings WHERE practitioner_id = $1', [pid]);
      await client.query('DELETE FROM practitioner_availability WHERE practitioner_id = $1', [pid]);
      await client.query('DELETE FROM practitioner_leave_periods WHERE practitioner_id = $1', [pid]);
    }

    await client.query('COMMIT');

    await invalidateRedisTagsAndPrefixes(
      redisClient,
      ['schedule', 'schedule:list', 'schedule:detail', 'schedule:ref', 'schedule:patients', 'booking', 'appointments'],
      ['*schedule*', '*booking*'],
    );

    return { success: true, deletedSessions };
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, deletedSessions: 0, error: msg };
  } finally {
    client.release();
  }
}

function renderInspection(insp: SchedulePurgeInspection): void {
  printSection('Doctor Schedule Purge Inspection');
  if (insp.mode === 'ALL') {
    console.log(' Scope                   : ALL DOCTORS (Entire Clinic)');
  } else {
    console.log(` Doctor Name            : ${insp.doctorName}`);
    console.log(` Practitioner ID        : ${insp.practitionerId}`);
  }
  console.log(` Schedule Sessions       : ${insp.sessionCount}`);
  console.log(` Day Settings (Templates): ${insp.daySettingCount}`);
  console.log(` Weekly Availabilities   : ${insp.availabilityCount}`);
  console.log(` Schedule Closures       : ${insp.closureCount}`);
  console.log(` Reschedule Events       : ${insp.rescheduleCount}`);
  console.log(` Leave Periods           : ${insp.leavePeriodCount}`);
  console.log(` Linked Appointments     : ${insp.linkedAppointmentsCount}`);
}

function renderDoctorsTable(doctors: DoctorScheduleSummary[]): void {
  if (doctors.length === 0) {
    console.log('No practitioners found in system.');
    return;
  }

  const idxW = 4;
  const nameW = 24;
  const specW = 16;
  const sessW = 8;
  const apptW = 8;
  const idW = 36;

  console.log(
    padRight('#', idxW) + ' ' +
    padRight('Doctor Name', nameW) + ' ' +
    padRight('Specialty', specW) + ' ' +
    padRight('Sessions', sessW) + ' ' +
    padRight('Appts', apptW) + ' ' +
    padRight('Practitioner ID', idW)
  );
  console.log('-'.repeat(idxW + nameW + specW + sessW + apptW + idW + 5));

  doctors.forEach((d, i) => {
    console.log(
      padRight(String(i + 1), idxW) + ' ' +
      padRight(d.doctorName, nameW) + ' ' +
      padRight(d.specialty, specW) + ' ' +
      padRight(String(d.sessionCount), sessW) + ' ' +
      padRight(String(d.appointmentCount), apptW) + ' ' +
      padRight(d.practitionerId, idW)
    );
  });
  console.log(`\nShowing ${doctors.length} doctor(s).`);
}

export async function runSchedulePurgeInteractive(
  pool: Pool,
  redisClient: Redis | null,
  rl: readline.Interface,
): Promise<void> {
  while (true) {
    const totalSess = await pool.query('SELECT count(*) FROM practitioner_schedule_sessions');
    const sessionCount = parseInt(totalSess.rows[0]?.count ?? '0', 10);

    printSection(`Doctor Schedule Purge Menu [Total Sessions in DB: ${sessionCount}]`);
    console.log('Options:');
    console.log(' [1] Purge ALL Doctor Schedules (Flush All Sessions Across Entire Clinic)');
    console.log(' [2] List Doctors & Purge Schedules for a Specific Doctor');
    console.log(' [3] Search Doctor by Keyword (Name / Specialty / UUID)');
    console.log(' [4] Direct Input: Enter Practitioner UUID or Doctor Name');
    console.log(' [b] Back to Main Menu\n');

    const choice = await askSafeQuestion(rl, 'Enter selection [1-4 or b]: ');
    if (!choice || choice.toLowerCase() === 'b' || choice.toLowerCase() === 'back') {
      break;
    }

    if (choice === '1') {
      const insp = await inspectAllSchedules(pool);
      renderInspection(insp);

      if (insp.sessionCount === 0 && insp.daySettingCount === 0 && insp.availabilityCount === 0) {
        console.log('\n[INFO] Zero schedule records in database.');
        continue;
      }

      console.log('\nAppointment handling options for schedule purge:');
      console.log(' [1] Unlink appointments (Keep appointments, set schedule_session_id = NULL)');
      console.log(' [2] Purge appointments booked on these schedules as well');
      console.log(' [c] Cancel');

      const apptOpt = await askSafeQuestion(rl, 'Choose option [1-2 or c]: ');
      if (apptOpt === 'c' || (apptOpt !== '1' && apptOpt !== '2')) {
        console.log('[INFO] Schedule purge canceled.');
        continue;
      }
      const deleteAppts = apptOpt === '2';

      const confirmed = await confirmPurge(
        rl,
        'ALL DOCTOR SCHEDULES (CLINIC-WIDE)',
        insp.sessionCount + insp.daySettingCount + insp.availabilityCount,
        deleteAppts ? 'All booked appointments will also be wiped.' : 'Booked appointments will remain but be unlinked.',
      );

      if (!confirmed) {
        console.log('[INFO] Purge canceled.');
        continue;
      }

      console.log('\n[INFO] Executing clinic-wide schedule flush...');
      const res = await executeSchedulePurge(pool, redisClient, {
        isAll: true,
        deleteAppointments: deleteAppts,
      });

      if (res.success) {
        console.log(`\n[SUCCESS] Flushed ${res.deletedSessions} schedule sessions across all doctors.`);
      } else {
        console.log(`\n[ERROR] Failed to purge schedules: ${res.error}`);
      }
      continue;
    }

    let doctors: DoctorScheduleSummary[] = [];

    if (choice === '2') {
      doctors = await fetchDoctorsWithSchedules(pool);
      renderDoctorsTable(doctors);
    } else if (choice === '3') {
      const kw = await askSafeQuestion(rl, 'Enter doctor search keyword: ');
      if (!kw) continue;
      doctors = await fetchDoctorsWithSchedules(pool, kw);
      renderDoctorsTable(doctors);
    } else if (choice === '4') {
      // Direct input
    } else {
      console.log('[WARN] Invalid option.');
      continue;
    }

    console.log('\nTo purge schedules for a doctor:');
    console.log('- Enter row number from list (e.g. 1)');
    console.log('- Or paste Practitioner UUID / Doctor Name');
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

    console.log(`\n[INFO] Inspecting schedules for: ${targetIdentifier} ...`);
    const insp = await inspectDoctorSchedules(pool, targetIdentifier);

    if (!insp) {
      console.log(`[ERROR] Doctor not found: ${targetIdentifier}`);
      continue;
    }

    renderInspection(insp);

    if (insp.sessionCount === 0 && insp.daySettingCount === 0 && insp.availabilityCount === 0) {
      console.log('\n[INFO] Doctor has no schedule sessions configured.');
      continue;
    }

    console.log('\nAppointment handling options for this doctor:');
    console.log(' [1] Unlink appointments (Keep appointments, set schedule_session_id = NULL)');
    console.log(' [2] Purge appointments booked on this doctor\'s schedules as well');
    console.log(' [c] Cancel');

    const apptOpt = await askSafeQuestion(rl, 'Choose option [1-2 or c]: ');
    if (apptOpt === 'c' || (apptOpt !== '1' && apptOpt !== '2')) {
      console.log('[INFO] Schedule purge canceled.');
      continue;
    }
    const deleteAppts = apptOpt === '2';

    const confirmed = await confirmPurge(
      rl,
      `Schedules for Dr. ${insp.doctorName}`,
      insp.sessionCount + insp.daySettingCount,
      deleteAppts ? 'Appointments booked with this doctor will also be purged.' : 'Appointments will be kept and unlinked.',
    );

    if (!confirmed) {
      console.log('[INFO] Purge canceled.');
      continue;
    }

    console.log('\n[INFO] Executing selective schedule purge...');
    const res = await executeSchedulePurge(pool, redisClient, {
      isAll: false,
      practitionerId: insp.practitionerId,
      deleteAppointments: deleteAppts,
    });

    if (res.success) {
      console.log(`\n[SUCCESS] Flushed ${res.deletedSessions} session(s) for Dr. ${insp.doctorName}.`);
    } else {
      console.log(`\n[ERROR] Failed to purge schedules: ${res.error}`);
    }
  }
}
