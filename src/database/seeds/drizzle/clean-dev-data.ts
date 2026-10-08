import 'dotenv/config';
import { Pool, type PoolClient } from 'pg';

const DEFAULT_POSTGRES_HOST_PORT = 5433;
const DEFAULT_DATABASE_MAX_POOL_SIZE = 5;

const getDatabaseUrl = (): string => {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DATABASE_HOST || 'localhost';
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  const port = isLocalHost
    ? process.env.POSTGRES_HOST_PORT ||
      process.env.DATABASE_PORT ||
      String(DEFAULT_POSTGRES_HOST_PORT)
    : process.env.DATABASE_PORT || '5432';
  const username = process.env.DATABASE_USERNAME || 'amanah';
  const password = process.env.DATABASE_PASSWORD || 'amanah_secret';
  const database = process.env.DATABASE_NAME || 'amanah_healthcare';

  return `postgresql://${username}:${password}@${host}:${port}/${database}`;
};

export async function cleanOperationalDevData(client: PoolClient): Promise<void> {
  // Truncate/delete disposable operational records while strictly preserving
  // foundational configuration (clinic_setting, session_def, session_schedule,
  // service_categories, roles, permissions, users, master catalogs).
  await client.query(`
    UPDATE appointments SET schedule_session_id = NULL WHERE schedule_session_id IS NOT NULL;

    DELETE FROM appointment_call_attempts;
    DELETE FROM queue_tickets;
    DELETE FROM appointment_check_ins;
    DELETE FROM appointment_status_events;
    DELETE FROM medical_intake_submissions WHERE appointment_id IS NOT NULL;
    UPDATE clinical_encounters SET appointment_id = NULL WHERE appointment_id IS NOT NULL;
    UPDATE patient_timeline_events SET appointment_id = NULL WHERE appointment_id IS NOT NULL;
    DELETE FROM appointments;

    DELETE FROM clinic_closure;
    DELETE FROM practitioner_schedule_closures;
    DELETE FROM schedule_reschedule_events;
    DELETE FROM shift_exception;
    DELETE FROM extra_opening;
    DELETE FROM queue_counter;
    DELETE FROM ticket_event;
    DELETE FROM queue_notification_outbox;

    DELETE FROM practitioner_schedule_sessions;
    DELETE FROM practitioner_schedule_day_settings;
    DELETE FROM practitioner_leave_periods;
  `);
}

async function runStandalone(): Promise<void> {
  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: DEFAULT_DATABASE_MAX_POOL_SIZE,
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await cleanOperationalDevData(client);
    await client.query('COMMIT');
    console.log('[SUCCESS] Operational development test data cleaned safely.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ERROR] Failed to clean operational development data:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.main) {
  runStandalone();
}
