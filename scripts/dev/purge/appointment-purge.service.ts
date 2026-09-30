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

export interface PatientAppointmentSummary {
  patientId: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string;
  appointmentCount: number;
}

export interface AppointmentPurgeInspection {
  mode: 'ALL' | 'PATIENT';
  patientId?: string;
  patientName?: string;
  patientEmail?: string;
  appointmentCount: number;
  queueTicketCount: number;
  statusEventCount: number;
  callAttemptCount: number;
  intakeCount: number;
  encountersToUnlink: number;
  sessionsToRestore: number;
}

export async function fetchPatientsWithAppointments(
  pool: Pool,
  search?: string,
): Promise<PatientAppointmentSummary[]> {
  let whereClause = '';
  const params: unknown[] = [];

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClause = `
      AND (
        LOWER(p.full_name) LIKE $1 
        OR LOWER(p.email::text) LIKE $1 
        OR LOWER(p.phone) LIKE $1
        OR p.id::text LIKE $1
        OR (u.id IS NOT NULL AND u.id::text LIKE $1)
      )
    `;
  }

  const query = `
    SELECT 
      p.id AS patient_id,
      p.user_id,
      p.full_name AS name,
      COALESCE(p.email::text, u.email::text, '-') AS email,
      COALESCE(p.phone, '-') AS phone,
      COUNT(a.id) AS appointment_count
    FROM patient_profiles p
    LEFT JOIN users u ON p.user_id = u.id
    JOIN appointments a ON a.patient_id = p.id
    WHERE 1=1 ${whereClause}
    GROUP BY p.id, p.user_id, p.full_name, p.email, u.email, p.phone
    ORDER BY appointment_count DESC, p.full_name ASC;
  `;

  const res = await pool.query(query, params);
  return res.rows.map((r) => ({
    patientId: String(r.patient_id),
    userId: r.user_id ? String(r.user_id) : null,
    name: String(r.name),
    email: String(r.email),
    phone: String(r.phone),
    appointmentCount: Number(r.appointment_count),
  }));
}

export async function inspectAllAppointments(pool: Pool): Promise<AppointmentPurgeInspection> {
  const [appts, tickets, events, attempts, intakes, encounters, sessions] = await Promise.all([
    pool.query('SELECT count(*) FROM appointments'),
    pool.query('SELECT count(*) FROM queue_tickets WHERE appointment_id IS NOT NULL'),
    pool.query('SELECT count(*) FROM appointment_status_events'),
    pool.query('SELECT count(*) FROM appointment_call_attempts'),
    pool.query('SELECT count(*) FROM medical_intake_submissions WHERE appointment_id IS NOT NULL'),
    pool.query('SELECT count(*) FROM clinical_encounters WHERE appointment_id IS NOT NULL'),
    pool.query('SELECT count(*) FROM practitioner_schedule_sessions'),
  ]);

  return {
    mode: 'ALL',
    appointmentCount: parseInt(appts.rows[0]?.count ?? '0', 10),
    queueTicketCount: parseInt(tickets.rows[0]?.count ?? '0', 10),
    statusEventCount: parseInt(events.rows[0]?.count ?? '0', 10),
    callAttemptCount: parseInt(attempts.rows[0]?.count ?? '0', 10),
    intakeCount: parseInt(intakes.rows[0]?.count ?? '0', 10),
    encountersToUnlink: parseInt(encounters.rows[0]?.count ?? '0', 10),
    sessionsToRestore: parseInt(sessions.rows[0]?.count ?? '0', 10),
  };
}

export async function inspectPatientAppointments(
  pool: Pool,
  patientIdentifier: string,
): Promise<AppointmentPurgeInspection | null> {
  const targetIsUuid = isUuid(patientIdentifier);

  const patQuery = targetIsUuid
    ? `
      SELECT p.id, p.full_name, COALESCE(p.email::text, u.email::text, '-') AS email
      FROM patient_profiles p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = $1::uuid OR p.user_id = $1::uuid
      LIMIT 1;
    `
    : `
      SELECT p.id, p.full_name, COALESCE(p.email::text, u.email::text, '-') AS email
      FROM patient_profiles p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE LOWER(p.email::text) = LOWER($1) OR LOWER(u.email::text) = LOWER($1)
      LIMIT 1;
    `;

  const patRes = await pool.query(patQuery, [patientIdentifier.trim()]);
  if (patRes.rows.length === 0) return null;

  const patientId = String(patRes.rows[0].id);
  const patientName = String(patRes.rows[0].full_name);
  const patientEmail = String(patRes.rows[0].email);

  const [appts, tickets, events, attempts, intakes, encounters, affectedSessions] = await Promise.all([
    pool.query('SELECT count(*) FROM appointments WHERE patient_id = $1', [patientId]),
    pool.query(
      'SELECT count(*) FROM queue_tickets qt JOIN appointments a ON qt.appointment_id = a.id WHERE a.patient_id = $1',
      [patientId],
    ),
    pool.query(
      'SELECT count(*) FROM appointment_status_events ase JOIN appointments a ON ase.appointment_id = a.id WHERE a.patient_id = $1',
      [patientId],
    ),
    pool.query(
      'SELECT count(*) FROM appointment_call_attempts aca JOIN appointments a ON aca.appointment_id = a.id WHERE a.patient_id = $1',
      [patientId],
    ),
    pool.query(
      'SELECT count(*) FROM medical_intake_submissions mis JOIN appointments a ON mis.appointment_id = a.id WHERE a.patient_id = $1',
      [patientId],
    ),
    pool.query(
      'SELECT count(*) FROM clinical_encounters ce JOIN appointments a ON ce.appointment_id = a.id WHERE a.patient_id = $1',
      [patientId],
    ),
    pool.query(
      'SELECT count(DISTINCT schedule_session_id) FROM appointments WHERE patient_id = $1 AND schedule_session_id IS NOT NULL',
      [patientId],
    ),
  ]);

  return {
    mode: 'PATIENT',
    patientId,
    patientName,
    patientEmail,
    appointmentCount: parseInt(appts.rows[0]?.count ?? '0', 10),
    queueTicketCount: parseInt(tickets.rows[0]?.count ?? '0', 10),
    statusEventCount: parseInt(events.rows[0]?.count ?? '0', 10),
    callAttemptCount: parseInt(attempts.rows[0]?.count ?? '0', 10),
    intakeCount: parseInt(intakes.rows[0]?.count ?? '0', 10),
    encountersToUnlink: parseInt(encounters.rows[0]?.count ?? '0', 10),
    sessionsToRestore: parseInt(affectedSessions.rows[0]?.count ?? '0', 10),
  };
}

export async function executeAppointmentPurge(
  pool: Pool,
  redisClient: Redis | null,
  options: { isAll: boolean; patientId?: string },
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    let totalDeleted = 0;

    if (options.isAll) {
      await client.query('DELETE FROM appointment_call_attempts');
      await client.query('DELETE FROM queue_tickets WHERE appointment_id IS NOT NULL');
      await client.query('DELETE FROM appointment_status_events');
      await client.query('DELETE FROM medical_intake_submissions WHERE appointment_id IS NOT NULL');
      await client.query('UPDATE clinical_encounters SET appointment_id = NULL WHERE appointment_id IS NOT NULL');
      await client.query('UPDATE patient_timeline_events SET appointment_id = NULL WHERE appointment_id IS NOT NULL');
      
      const delAppt = await client.query('DELETE FROM appointments');
      totalDeleted = delAppt.rowCount ?? 0;

      // Reset all schedule sessions available slots back to full capacity
      await client.query('UPDATE practitioner_schedule_sessions SET available_slots = capacity, updated_at = NOW()');
    } else if (options.patientId) {
      const apptRes = await client.query(
        'SELECT id, schedule_session_id FROM appointments WHERE patient_id = $1',
        [options.patientId],
      );
      const apptIds: string[] = apptRes.rows.map((r) => String(r.id));
      const sessionIds: string[] = Array.from(
        new Set(apptRes.rows.map((r) => r.schedule_session_id).filter(Boolean)),
      ) as string[];

      if (apptIds.length > 0) {
        await client.query('DELETE FROM appointment_call_attempts WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
        await client.query('DELETE FROM queue_tickets WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
        await client.query('DELETE FROM appointment_status_events WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
        await client.query('DELETE FROM medical_intake_submissions WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
        await client.query('UPDATE clinical_encounters SET appointment_id = NULL WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
        await client.query('UPDATE patient_timeline_events SET appointment_id = NULL WHERE appointment_id = ANY($1::uuid[])', [apptIds]);

        const delRes = await client.query('DELETE FROM appointments WHERE id = ANY($1::uuid[])', [apptIds]);
        totalDeleted = delRes.rowCount ?? 0;

        if (sessionIds.length > 0) {
          await client.query(
            `
            UPDATE practitioner_schedule_sessions s
            SET available_slots = GREATEST(0, s.capacity - (
              SELECT count(*) FROM appointments a 
              WHERE a.schedule_session_id = s.id 
              AND a.status NOT IN ('CANCELLED', 'NO_SHOW')
            )), updated_at = NOW()
            WHERE s.id = ANY($1::uuid[])
            `,
            [sessionIds],
          );
        }
      }
    }

    await client.query('COMMIT');

    // Invalidate Redis caches
    await invalidateRedisTagsAndPrefixes(
      redisClient,
      ['appointments', 'appointments:me', 'queue', 'daily', 'display', 'schedule', 'schedule:patients', 'booking'],
      ['*appointment*', '*queue*', '*booking*'],
    );

    return { success: true, deletedCount: totalDeleted };
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, deletedCount: 0, error: msg };
  } finally {
    client.release();
  }
}

function renderInspection(insp: AppointmentPurgeInspection): void {
  printSection('Appointment Purge Impact Inspection');
  if (insp.mode === 'ALL') {
    console.log(' Scope                   : ALL PATIENTS (System-wide 100% Flush)');
  } else {
    console.log(` Patient Name            : ${insp.patientName}`);
    console.log(` Patient Email           : ${insp.patientEmail}`);
    console.log(` Patient Profile ID      : ${insp.patientId}`);
  }
  console.log(` Appointments to Delete  : ${insp.appointmentCount}`);
  console.log(` Queue Tickets to Delete : ${insp.queueTicketCount}`);
  console.log(` Status Events to Delete : ${insp.statusEventCount}`);
  console.log(` Call Attempts to Delete : ${insp.callAttemptCount}`);
  console.log(` Intakes to Delete       : ${insp.intakeCount}`);
  console.log(` Encounters to Unlink    : ${insp.encountersToUnlink}`);
  console.log(` Sessions Restoring Slot : ${insp.sessionsToRestore}`);
}

function renderPatientsTable(list: PatientAppointmentSummary[]): void {
  if (list.length === 0) {
    console.log('No patients found with registered appointments.');
    return;
  }

  const idxW = 4;
  const nameW = 24;
  const emailW = 28;
  const cntW = 8;
  const idW = 36;

  console.log(
    padRight('#', idxW) + ' ' +
    padRight('Patient Name', nameW) + ' ' +
    padRight('Email', emailW) + ' ' +
    padRight('Appts', cntW) + ' ' +
    padRight('Patient ID', idW)
  );
  console.log('-'.repeat(idxW + nameW + emailW + cntW + idW + 4));

  list.forEach((p, i) => {
    console.log(
      padRight(String(i + 1), idxW) + ' ' +
      padRight(p.name, nameW) + ' ' +
      padRight(p.email, emailW) + ' ' +
      padRight(String(p.appointmentCount), cntW) + ' ' +
      padRight(p.patientId, idW)
    );
  });
  console.log(`\nShowing ${list.length} patient(s) with appointments.`);
}

export async function runAppointmentPurgeInteractive(
  pool: Pool,
  redisClient: Redis | null,
  rl: readline.Interface,
): Promise<void> {
  while (true) {
    const totalApptRes = await pool.query('SELECT count(*) FROM appointments');
    const totalCount = parseInt(totalApptRes.rows[0]?.count ?? '0', 10);

    printSection(`Appointment Purge Menu [Total Appointments in DB: ${totalCount}]`);
    console.log('Options:');
    console.log(' [1] Purge ALL Appointments (100% Flush Across ALL Patients)');
    console.log(' [2] List Patients with Appointments & Purge by Patient');
    console.log(' [3] Search Patient by Keyword (Name / Email / Phone / UUID)');
    console.log(' [4] Direct Input: Enter Patient UUID or Email');
    console.log(' [b] Back to Main Menu\n');

    const choice = await askSafeQuestion(rl, 'Enter selection [1-4 or b]: ');
    if (!choice || choice.toLowerCase() === 'b' || choice.toLowerCase() === 'back') {
      break;
    }

    if (choice === '1') {
      const insp = await inspectAllAppointments(pool);
      renderInspection(insp);

      if (insp.appointmentCount === 0) {
        console.log('\n[INFO] Zero appointments in database. Nothing to purge.');
        continue;
      }

      const confirmed = await confirmPurge(
        rl,
        'ALL APPOINTMENTS (SYSTEM-WIDE)',
        insp.appointmentCount,
        'All queue tickets, status events, call attempts will be wiped. Doctor schedule session available slots will be restored to 100% capacity.',
      );

      if (!confirmed) {
        console.log('[INFO] Purge canceled.');
        continue;
      }

      console.log('\n[INFO] Executing system-wide appointments purge...');
      const res = await executeAppointmentPurge(pool, redisClient, { isAll: true });
      if (res.success) {
        console.log(`\n[SUCCESS] Purged ${res.deletedCount} appointments and refreshed schedule slots.`);
      } else {
        console.log(`\n[ERROR] Failed to purge appointments: ${res.error}`);
      }
      continue;
    }

    let patients: PatientAppointmentSummary[] = [];

    if (choice === '2') {
      patients = await fetchPatientsWithAppointments(pool);
      renderPatientsTable(patients);
    } else if (choice === '3') {
      const keyword = await askSafeQuestion(rl, 'Enter patient search keyword: ');
      if (!keyword) continue;
      patients = await fetchPatientsWithAppointments(pool, keyword);
      renderPatientsTable(patients);
    } else if (choice === '4') {
      // Direct input
    } else {
      console.log('[WARN] Invalid option.');
      continue;
    }

    console.log('\nTo purge appointments for a patient:');
    console.log('- Enter row number from list (e.g. 1)');
    console.log('- Or paste Patient Profile UUID / Email');
    console.log('- Or press Enter / "c" to cancel.');

    const targetInput = await askSafeQuestion(rl, '\nSelect Patient: ');
    if (!targetInput || targetInput.toLowerCase() === 'c') {
      console.log('[INFO] Selection canceled.');
      continue;
    }

    let targetIdentifier = targetInput;
    const num = parseInt(targetInput, 10);
    if (!isNaN(num) && num >= 1 && num <= patients.length) {
      targetIdentifier = patients[num - 1].patientId;
    }

    console.log(`\n[INFO] Inspecting appointments for: ${targetIdentifier} ...`);
    const insp = await inspectPatientAppointments(pool, targetIdentifier);

    if (!insp) {
      console.log(`[ERROR] No patient found with identifier: ${targetIdentifier}`);
      continue;
    }

    renderInspection(insp);

    if (insp.appointmentCount === 0) {
      console.log('\n[INFO] Patient has 0 appointments. Nothing to purge.');
      continue;
    }

    const confirmed = await confirmPurge(
      rl,
      `Appointments for ${insp.patientName} (${insp.patientEmail})`,
      insp.appointmentCount,
      'Associated queue tickets and events will be deleted. The patient profile and user account itself will remain.',
    );

    if (!confirmed) {
      console.log('[INFO] Purge canceled.');
      continue;
    }

    console.log('\n[INFO] Executing selective appointment purge...');
    const res = await executeAppointmentPurge(pool, redisClient, {
      isAll: false,
      patientId: insp.patientId,
    });

    if (res.success) {
      console.log(`\n[SUCCESS] Successfully purged ${res.deletedCount} appointment(s) for ${insp.patientName}.`);
    } else {
      console.log(`\n[ERROR] Failed to purge patient appointments: ${res.error}`);
    }
  }
}
