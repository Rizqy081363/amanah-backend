#!/usr/bin/env bun
import { createDbPool, getRedisClient, invalidateRedisTagsAndPrefixes } from './purge/db-connection';

async function main() {
  console.log('================================================================================');
  console.log('  AMANAH HEALTHCARE — DATABASE CLEAN RESET (COLD-START FOUNDATION)');
  console.log('================================================================================');

  const pool = createDbPool();
  const redis = await getRedisClient();
  const client = await pool.connect();

  try {
    console.log('[1/3] Flushing operational tables, users, and legacy roles via TRUNCATE CASCADE...');
    await client.query('BEGIN');

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
        compensation_rates,
        role_permissions, 
        roles, 
        permissions,
        users
      CASCADE;
    `);

    await client.query('COMMIT');
    console.log('      [✓] All operational tables and users truncated cleanly.');

    console.log('[2/3] Flushing Redis cache across all domains...');
    if (redis) {
      await redis.flushall();
      console.log('      [✓] Redis flushall complete.');
    } else {
      console.log('      [-] Redis not connected (skipped).');
    }

    console.log('[3/3] Database is now 100% clean and ready for DDL migration.');
    console.log('================================================================================');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('      [!] Clean reset failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    if (redis) redis.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
