import 'dotenv/config';
import { Pool } from 'pg';

const getDatabaseUrl = (): string => {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DATABASE_HOST || 'localhost';
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  const port = isLocalHost
    ? process.env.POSTGRES_HOST_PORT || process.env.DATABASE_PORT || '5433'
    : process.env.DATABASE_PORT || '5432';
  const username = process.env.DATABASE_USERNAME || 'amanah';
  const password = process.env.DATABASE_PASSWORD || 'amanah_secret';
  const database = process.env.DATABASE_NAME || 'amanah_healthcare';

  return `postgresql://${username}:${password}@${host}:${port}/${database}`;
};

export async function runNotificationLifecycleSeed(): Promise<void> {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const client = await pool.connect();

  console.log(
    '--- Starting Notification Lifecycle & Patient History Validation Seed ---',
  );

  try {
    await client.query('BEGIN');

    // 1. Resolve Patient, Practitioner, and Service fixtures
    const patientRes = await client.query<{
      id: string;
      user_id: string;
      full_name: string;
    }>(
      `SELECT id, user_id, full_name FROM patient_profiles WHERE user_id IS NOT NULL LIMIT 1`,
    );

    if (patientRes.rows.length === 0) {
      throw new Error(
        'No patient profile found with user_id in database. Run main seed first.',
      );
    }
    const patient = patientRes.rows[0];

    const pracRes = await client.query<{ id: string; service_id: string }>(
      `SELECT pr.id, s.id as service_id 
       FROM practitioners pr 
       CROSS JOIN clinic_services s 
       WHERE s.is_active = true 
       LIMIT 1`,
    );

    if (pracRes.rows.length === 0) {
      throw new Error('No practitioner or clinic service found.');
    }
    const { id: practitionerId, service_id: serviceId } = pracRes.rows[0];

    const staffUserRes = await client.query<{ id: string }>(
      `SELECT u.id FROM users u 
       JOIN user_roles ur ON ur.user_id = u.id 
       JOIN roles r ON r.id = ur.role_id 
       WHERE r.code IN ('admin', 'staff_doctor') 
       LIMIT 1`,
    );
    const staffUserId = staffUserRes.rows[0]?.id || patient.user_id;

    // 2. Scenario 1: Completed Appointment (1 Call Attempt - Responded)
    const apt1Res = await client.query<{ id: string }>(
      `INSERT INTO appointments (
         booking_code, patient_id, practitioner_id, service_id,
         status, scheduled_date, scheduled_start_time, complaint,
         completed_at, updated_at
       ) VALUES (
         'BK-VAL-COMP-01', $1, $2, $3,
         'completed', CURRENT_DATE - 2, '09:00:00', 'Keluhan demam dan flu ringan',
         NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'
       )
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [patient.id, practitionerId, serviceId],
    );

    let apt1Id = apt1Res.rows[0]?.id;
    if (!apt1Id) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM appointments WHERE booking_code = 'BK-VAL-COMP-01'`,
      );
      apt1Id = existing.rows[0].id;
    }

    // Queue ticket for Apt 1
    const ticket1Res = await client.query<{ id: string }>(
      `INSERT INTO queue_tickets (
         appointment_id, service_id, queue_date, queue_number, status, completed_at
       ) VALUES ($1, $2, CURRENT_DATE - 2, 'A-901', 'completed', NOW() - INTERVAL '2 days')
       ON CONFLICT (appointment_id) DO UPDATE SET status = 'completed'
       RETURNING id`,
      [apt1Id, serviceId],
    );
    const ticket1Id = ticket1Res.rows[0]?.id;

    // Call attempt 1 (Responded)
    await client.query(
      `INSERT INTO appointment_call_attempts (
         appointment_id, queue_ticket_id, attempt_number, status, called_by, responded_at, notes
       ) VALUES ($1, $2, 1, 'responded', $3, NOW() - INTERVAL '2 days', 'Pasien langsung masuk ke ruang periksa')
       ON CONFLICT DO NOTHING`,
      [apt1Id, ticket1Id, staffUserId],
    );

    // Completed Notification record
    await client.query(
      `INSERT INTO notifications (
         category, title, body, is_urgent, idempotency_key, source_type, source_id
       ) VALUES (
         'clinical', 'Pemeriksaan Selesai',
         'Konsultasi dan pemeriksaan medis di Poli Umum telah selesai. Terima kasih telah mempercayakan layanan kesehatan Anda di Klinik Amanah.',
         false, 'val-comp-01:' || $1 || ':appointment.completed.v1', 'appointment', $2
       )
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [patient.user_id, apt1Id],
    );

    // 3. Scenario 2: 3-Attempt No-Show Terminal Appointment
    const apt2Res = await client.query<{ id: string }>(
      `INSERT INTO appointments (
         booking_code, patient_id, practitioner_id, service_id,
         status, scheduled_date, scheduled_start_time, complaint,
         updated_at
       ) VALUES (
         'BK-VAL-NOSHOW-02', $1, $2, $3,
         'no_show', CURRENT_DATE - 1, '10:00:00', 'Kontrol rutin tekanan darah',
         NOW() - INTERVAL '1 day'
       )
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [patient.id, practitionerId, serviceId],
    );

    let apt2Id = apt2Res.rows[0]?.id;
    if (!apt2Id) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM appointments WHERE booking_code = 'BK-VAL-NOSHOW-02'`,
      );
      apt2Id = existing.rows[0].id;
    }

    const ticket2Res = await client.query<{ id: string }>(
      `INSERT INTO queue_tickets (
         appointment_id, service_id, queue_date, queue_number, status
       ) VALUES ($1, $2, CURRENT_DATE - 1, 'A-902', 'skipped')
       ON CONFLICT (appointment_id) DO UPDATE SET status = 'skipped'
       RETURNING id`,
      [apt2Id, serviceId],
    );
    const ticket2Id = ticket2Res.rows[0]?.id;

    // 3 call attempts:
    // Attempt 1: no_response
    await client.query(
      `INSERT INTO appointment_call_attempts (
         appointment_id, queue_ticket_id, attempt_number, status, called_by, notes
       ) VALUES ($1, $2, 1, 'no_response', $3, 'Panggilan 1: Pasien belum hadir di ruang tunggu')
       ON CONFLICT DO NOTHING`,
      [apt2Id, ticket2Id, staffUserId],
    );

    // Attempt 2: no_response
    await client.query(
      `INSERT INTO appointment_call_attempts (
         appointment_id, queue_ticket_id, attempt_number, status, called_by, notes
       ) VALUES ($1, $2, 2, 'no_response', $3, 'Panggilan 2: Antrean digeser 3 posisi')
       ON CONFLICT DO NOTHING`,
      [apt2Id, ticket2Id, staffUserId],
    );

    // Attempt 3: no_response -> terminal no_show
    await client.query(
      `INSERT INTO appointment_call_attempts (
         appointment_id, queue_ticket_id, attempt_number, status, called_by, notes
       ) VALUES ($1, $2, 3, 'no_response', $3, 'Panggilan 3: Batas maksimum panggilan tercapai, ditandai no_show')
       ON CONFLICT DO NOTHING`,
      [apt2Id, ticket2Id, staffUserId],
    );

    // No-show notification
    await client.query(
      `INSERT INTO notifications (
         category, title, body, is_urgent, idempotency_key, source_type, source_id
       ) VALUES (
         'appointment', 'Janji Temu Dibatalkan (Tidak Hadir)',
         'Anda tidak hadir setelah 3 kali pemanggilan. Janji temu untuk Poli Umum ditandai Tidak Hadir (No-Show). Silakan lakukan pendaftaran ulang jika masih membutuhkan pelayanan.',
         true, 'val-noshow-02:' || $1 || ':appointment.no_show.v1', 'appointment', $2
       )
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [patient.user_id, apt2Id],
    );

    // 4. Scenario 3: Cancelled Appointment
    const apt3Res = await client.query<{ id: string }>(
      `INSERT INTO appointments (
         booking_code, patient_id, practitioner_id, service_id,
         status, scheduled_date, scheduled_start_time, complaint,
         cancelled_at, cancel_reason, updated_at
       ) VALUES (
         'BK-VAL-CANCEL-03', $1, $2, $3,
         'cancelled', CURRENT_DATE - 3, '14:00:00', 'Konsultasi tumbuh kembang anak',
         NOW() - INTERVAL '3 days', 'Pasien berhalangan hadir karena dinas luar kota',
         NOW() - INTERVAL '3 days'
       )
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [patient.id, practitionerId, serviceId],
    );

    let apt3Id = apt3Res.rows[0]?.id;
    if (!apt3Id) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM appointments WHERE booking_code = 'BK-VAL-CANCEL-03'`,
      );
      apt3Id = existing.rows[0].id;
    }

    await client.query(
      `INSERT INTO queue_tickets (
         appointment_id, service_id, queue_date, queue_number, status
       ) VALUES ($1, $2, CURRENT_DATE - 3, 'A-903', 'cancelled')
       ON CONFLICT (appointment_id) DO UPDATE SET status = 'cancelled'`,
      [apt3Id, serviceId],
    );

    await client.query('COMMIT');

    console.log('✅ Validation Seeding Completed Successfully:');
    console.log(`   - Patient: ${patient.full_name} (${patient.user_id})`);
    console.log(
      `   - Appointment 1 (Completed): ${apt1Id} (BK-VAL-COMP-01, 1 attempt)`,
    );
    console.log(
      `   - Appointment 2 (No-Show):   ${apt2Id} (BK-VAL-NOSHOW-02, 3 attempts)`,
    );
    console.log(`   - Appointment 3 (Cancelled): ${apt3Id} (BK-VAL-CANCEL-03)`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Validation Seed Failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Execute if run directly
if (
  typeof process !== 'undefined' &&
  process.argv[1]?.includes('notification-lifecycle.seed')
) {
  runNotificationLifecycleSeed().catch(() => process.exit(1));
}
