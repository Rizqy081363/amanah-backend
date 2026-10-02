import type * as readline from 'node:readline/promises';
import { Pool, type PoolClient } from 'pg';
import type Redis from 'ioredis';
import { invalidateRedisTagsAndPrefixes } from './db-connection';
import {
  printSection,
  askSafeQuestion,
  confirmPurge,
} from './purge-helpers';
import {
  renderUsersTable,
  renderAppointmentsTable,
  renderPatientsTable,
} from './appointment-purge.render';

export interface PatientAppointmentSummary {
  patientId: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string;
  appointmentCount: number;
}

export interface UserAppointmentSummary {
  userId: string;
  name: string;
  email: string;
  appointmentCount: number;
}

export interface UserAppointmentDetail {
  id: string;
  bookingCode: string;
  scheduledDate: string;
  session: string;
  status: string;
  patientName: string;
  serviceName: string;
  practitionerName: string;
  queueNumber: string;
}

export interface AppointmentPurgeInspection {
  mode: 'ALL' | 'PATIENT' | 'USER';
  targetId?: string;
  targetName?: string;
  targetEmail?: string;
  appointmentCount: number;
  queueTicketCount: number;
  statusEventCount: number;
  callAttemptCount: number;
  intakeCount: number;
  encountersToUnlink: number;
  sessionsToRestore: number;
}

export async function fetchUsersWithAppointments(
  pool: Pool,
  search?: string,
): Promise<UserAppointmentSummary[]> {
  let whereClause = '';
  const params: unknown[] = [];

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClause = `AND (LOWER(u.name) LIKE $1 OR LOWER(u.email::text) LIKE $1 OR u.id::text LIKE $1)`;
  }

  const query = `
    SELECT 
      u.id AS user_id,
      u.name,
      COALESCE(u.email::text, '-') AS email,
      COUNT(DISTINCT a.id) AS appointment_count
    FROM users u
    JOIN appointments a ON (
      a.created_by = u.id 
      OR a.patient_id IN (
        SELECT p.id FROM patient_profiles p WHERE p.user_id = u.id
        UNION
        SELECT pa.patient_id FROM patient_affiliations pa WHERE pa.user_id = u.id
      )
    )
    WHERE 1=1 ${whereClause}
    GROUP BY u.id, u.name, u.email
    ORDER BY appointment_count DESC, u.name ASC;
  `;

  const res = await pool.query(query, params);
  return res.rows.map((r) => ({
    userId: String(r.user_id),
    name: String(r.name),
    email: String(r.email),
    appointmentCount: Number(r.appointment_count),
  }));
}

export async function fetchAppointmentsForUser(
  pool: Pool,
  userId: string,
): Promise<UserAppointmentDetail[]> {
  const query = `
    SELECT 
      a.id,
      a.booking_code,
      TO_CHAR(a.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
      COALESCE(sess.session_label, TO_CHAR(a.scheduled_start_time, 'HH24:MI'), '-') AS session,
      a.status,
      p.full_name AS patient_name,
      COALESCE(s.name, '-') AS service_name,
      COALESCE(prac.display_name, pr.full_name, u_doc.name, '-') AS practitioner_name,
      COALESCE(qt.queue_number, '-') AS queue_number
    FROM appointments a
    JOIN patient_profiles p ON a.patient_id = p.id
    LEFT JOIN clinic_services s ON a.service_id = s.id
    LEFT JOIN practitioner_schedule_sessions sess ON a.schedule_session_id = sess.id
    LEFT JOIN practitioners prac ON a.practitioner_id = prac.id
    LEFT JOIN staff_profiles pr ON prac.staff_profile_id = pr.id
    LEFT JOIN users u_doc ON pr.user_id = u_doc.id
    LEFT JOIN queue_tickets qt ON qt.appointment_id = a.id
    WHERE a.created_by = $1
       OR a.patient_id IN (
         SELECT p2.id FROM patient_profiles p2 WHERE p2.user_id = $1
         UNION
         SELECT pa.patient_id FROM patient_affiliations pa WHERE pa.user_id = $1
       )
    ORDER BY a.scheduled_date DESC, a.created_at DESC;
  `;

  const res = await pool.query(query, [userId]);
  return res.rows.map((r) => ({
    id: String(r.id),
    bookingCode: String(r.booking_code),
    scheduledDate: String(r.scheduled_date),
    session: String(r.session),
    status: String(r.status),
    patientName: String(r.patient_name),
    serviceName: String(r.service_name),
    practitionerName: String(r.practitioner_name),
    queueNumber: String(r.queue_number),
  }));
}

export async function fetchPatientsWithAppointments(
  pool: Pool,
  search?: string,
): Promise<PatientAppointmentSummary[]> {
  let whereClause = '';
  const params: unknown[] = [];

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClause = `AND (LOWER(p.full_name) LIKE $1 OR LOWER(p.email::text) LIKE $1 OR LOWER(p.phone) LIKE $1 OR p.id::text LIKE $1)`;
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

async function deleteAppointmentsCascade(client: PoolClient, apptIds: string[]): Promise<number> {
  if (apptIds.length === 0) return 0;

  await client.query('DELETE FROM appointment_call_attempts WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
  await client.query('DELETE FROM queue_tickets WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
  await client.query('DELETE FROM appointment_status_events WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
  await client.query('DELETE FROM medical_intake_submissions WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
  await client.query('UPDATE clinical_encounters SET appointment_id = NULL WHERE appointment_id = ANY($1::uuid[])', [apptIds]);
  await client.query('UPDATE patient_timeline_events SET appointment_id = NULL WHERE appointment_id = ANY($1::uuid[])', [apptIds]);

  const sessionRes = await client.query(
    'SELECT DISTINCT schedule_session_id FROM appointments WHERE id = ANY($1::uuid[]) AND schedule_session_id IS NOT NULL',
    [apptIds],
  );
  const sessionIds = sessionRes.rows.map((r) => r.schedule_session_id).filter(Boolean);

  const delRes = await client.query('DELETE FROM appointments WHERE id = ANY($1::uuid[])', [apptIds]);
  const deletedCount = delRes.rowCount ?? 0;

  if (sessionIds.length > 0) {
    await client.query(
      `
      UPDATE practitioner_schedule_sessions s
      SET available_slots = GREATEST(0, s.capacity - (
        SELECT count(*) FROM appointments a 
        WHERE a.schedule_session_id = s.id 
        AND a.status NOT IN ('cancelled', 'no_show')
      )), updated_at = NOW()
      WHERE s.id = ANY($1::uuid[])
      `,
      [sessionIds],
    );
  }

  return deletedCount;
}

export async function executeAppointmentPurge(
  pool: Pool,
  redisClient: Redis | null,
  options: { isAll: boolean; patientId?: string; userId?: string; appointmentId?: string },
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

      await client.query('UPDATE practitioner_schedule_sessions SET available_slots = capacity, updated_at = NOW()');
    } else if (options.userId) {
      const apptRes = await client.query(
        `SELECT a.id FROM appointments a
         WHERE a.created_by = $1
            OR a.patient_id IN (
              SELECT p.id FROM patient_profiles p WHERE p.user_id = $1
              UNION
              SELECT pa.patient_id FROM patient_affiliations pa WHERE pa.user_id = $1
            )`,
        [options.userId],
      );
      const apptIds = apptRes.rows.map((r) => String(r.id));
      totalDeleted = await deleteAppointmentsCascade(client, apptIds);
    } else if (options.appointmentId) {
      totalDeleted = await deleteAppointmentsCascade(client, [options.appointmentId]);
    } else if (options.patientId) {
      const apptRes = await client.query('SELECT id FROM appointments WHERE patient_id = $1', [options.patientId]);
      const apptIds = apptRes.rows.map((r) => String(r.id));
      totalDeleted = await deleteAppointmentsCascade(client, apptIds);
    }

    await client.query('COMMIT');

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
    console.log(' [1] Purge ALL Appointments (100% System-Wide Flush)');
    console.log(' [2] Purge Appointments by User Account (Select User -> Flush All or Purge Single)');
    console.log(' [3] Purge Appointments by Patient Profile (Select Patient Profile)');
    console.log(' [b] Back to Main Menu\n');

    const choice = await askSafeQuestion(rl, 'Enter selection [1-3 or b]: ');
    if (!choice || choice.toLowerCase() === 'b' || choice.toLowerCase() === 'back') break;

    if (choice === '1') {
      const insp = await inspectAllAppointments(pool);
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

    if (choice === '2') {
      const users = await fetchUsersWithAppointments(pool);
      renderUsersTable(users);
      if (users.length === 0) continue;

      const targetInput = await askSafeQuestion(rl, '\nSelect User (row #, UUID, or email): ');
      if (!targetInput || targetInput.toLowerCase() === 'c') continue;

      let targetUserId = targetInput;
      let targetUserName = '';
      const num = parseInt(targetInput, 10);
      if (!isNaN(num) && num >= 1 && num <= users.length) {
        targetUserId = users[num - 1].userId;
        targetUserName = users[num - 1].name;
      } else {
        const found = users.find(
          (u) => u.userId.toLowerCase() === targetInput.toLowerCase() || u.email.toLowerCase() === targetInput.toLowerCase(),
        );
        if (found) {
          targetUserId = found.userId;
          targetUserName = found.name;
        }
      }

      const userAppts = await fetchAppointmentsForUser(pool, targetUserId);
      if (userAppts.length === 0) {
        console.log(`[INFO] No appointments found for user ${targetUserId}.`);
        continue;
      }

      printSection(`Appointments for User: ${targetUserName || targetUserId} (${userAppts.length} records)`);
      renderAppointmentsTable(userAppts);

      console.log('\nActions:');
      console.log(` [1] Flush ALL appointments for this User (${userAppts.length} records)`);
      console.log(' [2] Purge a single appointment (by row #)');
      console.log(' [c] Cancel / Back\n');

      const action = await askSafeQuestion(rl, 'Enter action [1-2 or c]: ');
      if (action === '1') {
        const confirmed = await confirmPurge(
          rl,
          `ALL appointments for user ${targetUserName || targetUserId}`,
          userAppts.length,
          'Tickets, status events, and call attempts will be wiped. Schedule slots will be restored.',
        );
        if (!confirmed) continue;

        const res = await executeAppointmentPurge(pool, redisClient, {
          isAll: false,
          userId: targetUserId,
        });
        if (res.success) {
          console.log(`\n[SUCCESS] Purged ${res.deletedCount} appointment(s) for user ${targetUserName}.`);
        } else {
          console.log(`\n[ERROR] Failed to purge: ${res.error}`);
        }
      } else if (action === '2') {
        const rowInput = await askSafeQuestion(rl, 'Enter appointment row # to purge: ');
        if (!rowInput) continue;
        const rowNum = parseInt(rowInput, 10);
        if (isNaN(rowNum) || rowNum < 1 || rowNum > userAppts.length) {
          console.log('[WARN] Invalid row number.');
          continue;
        }

        const targetAppt = userAppts[rowNum - 1];
        const confirmed = await confirmPurge(
          rl,
          `Appointment ${targetAppt.bookingCode} (${targetAppt.patientName})`,
          1,
        );
        if (!confirmed) continue;

        const res = await executeAppointmentPurge(pool, redisClient, {
          isAll: false,
          appointmentId: targetAppt.id,
        });
        if (res.success) {
          console.log(`\n[SUCCESS] Purged appointment ${targetAppt.bookingCode}.`);
        } else {
          console.log(`\n[ERROR] Failed to purge appointment: ${res.error}`);
        }
      }
      continue;
    }

    if (choice === '3') {
      const patients = await fetchPatientsWithAppointments(pool);
      renderPatientsTable(patients);
      if (patients.length === 0) continue;

      const targetInput = await askSafeQuestion(rl, '\nSelect Patient (row #, UUID, or email): ');
      if (!targetInput || targetInput.toLowerCase() === 'c') continue;

      let targetPatientId = targetInput;
      let targetPatientName = '';
      const num = parseInt(targetInput, 10);
      if (!isNaN(num) && num >= 1 && num <= patients.length) {
        targetPatientId = patients[num - 1].patientId;
        targetPatientName = patients[num - 1].name;
      }

      const confirmed = await confirmPurge(
        rl,
        `All appointments for patient ${targetPatientName || targetPatientId}`,
        1,
      );
      if (!confirmed) continue;

      const res = await executeAppointmentPurge(pool, redisClient, {
        isAll: false,
        patientId: targetPatientId,
      });
      if (res.success) {
        console.log(`\n[SUCCESS] Successfully purged ${res.deletedCount} appointment(s).`);
      } else {
        console.log(`\n[ERROR] Failed to purge: ${res.error}`);
      }
    }
  }
}
