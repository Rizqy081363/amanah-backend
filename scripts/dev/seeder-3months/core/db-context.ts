import type { PoolClient } from 'pg';
import {
  createDbPool,
  getRedisClient,
  invalidateRedisTagsAndPrefixes,
} from '../../purge/db-connection';
import type {
  DbContext,
  MasterRole,
  MasterClinicService,
  MasterClinicRoom,
  MasterSessionDef,
  MasterRelationshipType,
  MasterBloodType,
  MasterMedicalSpecialty,
  MasterClinicUnit,
  MasterServiceCategory,
} from '../types';

export async function initDbContext(): Promise<DbContext> {
  const pool = createDbPool();
  const redis = await getRedisClient();
  const client = await pool.connect();

  try {
    // 0. Ensure Canonical Clinical Sessions Exist
    await ensureSessionDefinitionsAndSchedule(client);

    // 1. Load Roles
    const rolesRes = await client.query<MasterRole>(
      'SELECT id, code, name, audience FROM roles WHERE is_active = true;'
    );
    const roles = new Map<string, MasterRole>();
    for (const r of rolesRes.rows) {
      roles.set(r.code, r);
    }

    // 2. Load Clinic Services
    const servicesRes = await client.query<MasterClinicService>(
      'SELECT id, code, name, code_prefix, service_category_id FROM clinic_services WHERE is_active = true;'
    );
    const services = new Map<string, MasterClinicService>();
    for (const s of servicesRes.rows) {
      services.set(s.code, s);
    }

    // 3. Load Clinic Rooms
    const roomsRes = await client.query<MasterClinicRoom>(
      'SELECT id, code, name, unit_id FROM clinic_rooms WHERE is_active = true;'
    );
    const rooms = new Map<string, MasterClinicRoom>();
    for (const rm of roomsRes.rows) {
      rooms.set(rm.code, rm);
    }

    // 4. Load Session Definitions
    const sessionsRes = await client.query<MasterSessionDef>(
      'SELECT id, code, code_prefix, label, default_starts_at, default_ends_at FROM session_def WHERE is_active = true;'
    );
    const sessions = new Map<string, MasterSessionDef>();
    for (const ss of sessionsRes.rows) {
      sessions.set(ss.code, ss);
    }

    // 5. Load Patient Relationship Types
    const relRes = await client.query<MasterRelationshipType>(
      'SELECT id, code, name FROM patient_relationship_types WHERE is_active = true;'
    );
    const relationshipTypes = new Map<string, MasterRelationshipType>();
    for (const rl of relRes.rows) {
      relationshipTypes.set(rl.code, rl);
    }

    // 6. Load Blood Types
    const bloodRes = await client.query<MasterBloodType>(
      'SELECT id, code FROM blood_types;'
    );
    const bloodTypes = new Map<string, MasterBloodType>();
    for (const bt of bloodRes.rows) {
      bloodTypes.set(bt.code, bt);
    }

    // 7. Load Specialties
    const specRes = await client.query<MasterMedicalSpecialty>(
      'SELECT id, code, name FROM medical_specialties;'
    );
    const specialties = new Map<string, MasterMedicalSpecialty>();
    for (const sp of specRes.rows) {
      specialties.set(sp.code, sp);
    }

    // 8. Load Units
    const unitsRes = await client.query<MasterClinicUnit>(
      'SELECT id, code, name FROM clinic_units WHERE is_active = true;'
    );
    const units = new Map<string, MasterClinicUnit>();
    for (const un of unitsRes.rows) {
      units.set(un.code, un);
    }

    // 9. Load Service Categories
    const catRes = await client.query<MasterServiceCategory>(
      'SELECT id, code, name FROM service_categories;'
    );
    const serviceCategories = new Map<string, MasterServiceCategory>();
    for (const cat of catRes.rows) {
      serviceCategories.set(cat.code, cat);
    }

    return {
      pool,
      redis,
      roles,
      services,
      rooms,
      sessions,
      relationshipTypes,
      bloodTypes,
      specialties,
      units,
      serviceCategories,
    };
  } finally {
    client.release();
  }
}

export async function ensureSessionDefinitionsAndSchedule(client: PoolClient): Promise<void> {
  // Ensure 'pagi' and 'sore' exist
  const defs = [
    { code: 'pagi', label: 'Sesi Pagi', codePrefix: 'P', startsAt: '08:00:00', endsAt: '14:00:00', sortOrder: 1 },
    { code: 'sore', label: 'Sesi Sore', codePrefix: 'S', startsAt: '14:00:00', endsAt: '20:00:00', sortOrder: 2 },
  ];

  for (const d of defs) {
    const res = await client.query<{ id: string }>(
      `
      INSERT INTO session_def (code, label, label_key, code_prefix, sort_order, is_active, default_starts_at, default_ends_at)
      VALUES ($1, $2, $3, $4, $5, true, $6, $7)
      ON CONFLICT (code) DO UPDATE
      SET label = EXCLUDED.label,
          code_prefix = EXCLUDED.code_prefix,
          default_starts_at = EXCLUDED.default_starts_at,
          default_ends_at = EXCLUDED.default_ends_at,
          is_active = true
      RETURNING id;
      `,
      [d.code, d.label, `session.${d.code}`, d.codePrefix, d.sortOrder, d.startsAt, d.endsAt]
    );
    const sessionId = res.rows[0].id;

    // Seed weekly session_schedule for Monday to Saturday (dow 1 to 6)
    for (let dow = 1; dow <= 6; dow++) {
      await client.query(
        `
        INSERT INTO session_schedule (session_id, dow, starts_at, ends_at, is_active)
        SELECT $1, $2, $3, $4, true
        WHERE NOT EXISTS (
          SELECT 1 FROM session_schedule WHERE session_id = $1 AND dow = $2
        );
        `,
        [sessionId, dow, d.startsAt, d.endsAt]
      );
    }
  }
}

export async function flushOperationalTables(client: PoolClient): Promise<void> {
  await client.query(`
    TRUNCATE TABLE 
      payroll_entries, 
      payroll_periods,
      staff_attendance_records, 
      attendance_qr_sessions,
      leave_request_sessions, 
      staff_leave_requests, 
      replacement_opportunities,
      appointment_call_attempts, 
      appointment_check_ins, 
      appointment_status_events, 
      appointments,
      queue_notification_outbox, 
      queue_tickets, 
      queue_counter,
      clinical_encounters, 
      medical_intake_submissions,
      doctor_assignment, 
      doctor_schedule_status_history, 
      shift_exception, 
      practitioners,
      staff_credentials, 
      staff_addresses, 
      staff_invitations, 
      staff_roster, 
      staff_profiles,
      patient_allergies, 
      patient_emergency_contacts, 
      patient_affiliations, 
      patient_addresses, 
      patient_profiles,
      notification_recipients, 
      notification_actions, 
      notifications,
      support_ticket_messages, 
      support_ticket_attachments, 
      support_tickets,
      messages, 
      conversation_participants, 
      conversations,
      user_roles, 
      user_devices, 
      user_data_export_jobs,
      auth_accounts, 
      auth_sessions, 
      auth_verifications, 
      auth_two_factors,
      "session", 
      "account", 
      "verification", 
      "user",
      users
    CASCADE;
  `);
}

export async function flushRedisCaches(redis: Redis | null): Promise<void> {
  if (!redis) return;
  await invalidateRedisTagsAndPrefixes(
    redis,
    ['roles', 'rbac', 'access-control', 'auth', 'schedule', 'queue', 'appointment', 'attendance'],
    ['roles', 'user', 'session', 'appointment', 'queue', 'attendance', 'payroll']
  );
  try {
    await redis.flushall();
  } catch {
    // ignore if redis flushall has permission restrictions
  }
}
