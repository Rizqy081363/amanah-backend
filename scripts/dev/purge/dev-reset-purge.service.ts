import type * as readline from 'node:readline/promises';
import { Pool, type PoolClient } from 'pg';
import type Redis from 'ioredis';
import { invalidateRedisTagsAndPrefixes } from './db-connection';
import { printSection, confirmPurge } from './purge-helpers';

export async function executeNuclearDevReset(
  pool: Pool,
  redisClient: Redis | null,
): Promise<{
  success: boolean;
  purgedCounts: {
    payrollEntries: number;
    payrollPeriods: number;
    attendance: number;
    qrSessions: number;
    leaves: number;
    replacements: number;
  };
  error?: string;
}> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Delete all payroll entries & periods
    const peRes = await client.query('DELETE FROM payroll_entries;');
    const ppRes = await client.query('DELETE FROM payroll_periods;');

    // 2. Unlink & delete attendance records
    await client.query(`
      UPDATE staff_attendance_records 
      SET leave_request_id = NULL, replacement_opportunity_id = NULL, qr_session_id = NULL;
    `);
    const attRes = await client.query('DELETE FROM staff_attendance_records;');
    const qrRes = await client.query('DELETE FROM attendance_qr_sessions;');

    // 3. Delete leave requests (DB FK cascades to sessions & replacement opps)
    const lrRes = await client.query('DELETE FROM staff_leave_requests;');

    // 4. Clean any remaining standalone replacement opportunities
    const repRes = await client.query('DELETE FROM replacement_opportunities;');

    await client.query('COMMIT');

    // 5. Invalidate Redis caches across all these operational domains
    await invalidateRedisTagsAndPrefixes(
      redisClient,
      ['attendance', 'presence', 'leave', 'replacement', 'payroll', 'roster'],
      ['*attendance*', '*presence*', '*leave*', '*replacement*', '*payroll*', '*roster*'],
    );

    return {
      success: true,
      purgedCounts: {
        payrollEntries: peRes.rowCount ?? 0,
        payrollPeriods: ppRes.rowCount ?? 0,
        attendance: attRes.rowCount ?? 0,
        qrSessions: qrRes.rowCount ?? 0,
        leaves: lrRes.rowCount ?? 0,
        replacements: repRes.rowCount ?? 0,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    return {
      success: false,
      purgedCounts: {
        payrollEntries: 0,
        payrollPeriods: 0,
        attendance: 0,
        qrSessions: 0,
        leaves: 0,
        replacements: 0,
      },
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    client.release();
  }
}

export async function runNuclearResetInteractive(
  pool: Pool,
  redisClient: Redis | null,
  rl: readline.Interface,
): Promise<void> {
  printSection('NUCLEAR DEVELOPMENT DATA RESET');
  console.log('This will cascade-flush all operational test records across:');
  console.log(' - Staff Attendance Records & QR Sessions');
  console.log(' - Staff Leave Requests & Leave Sessions');
  console.log(' - Doctor Replacement Opportunities & Claims');
  console.log(' - Payroll Periods & Calculated Payroll Entries');
  console.log('Permanent master data (users, staff profiles, clinics, rooms) will be preserved.\n');

  const confirmed = await confirmPurge(
    rl,
    'NUCLEAR DEV RESET (Attendance + Leaves + Replacements + Payroll)',
    999,
    'DANGER: All daily operational logs will be permanently deleted.',
  );
  if (!confirmed) {
    console.log('[INFO] Nuclear reset aborted.');
    return;
  }

  console.log('\n[INFO] Executing transactional nuclear reset...');
  const res = await executeNuclearDevReset(pool, redisClient);
  if (res.success) {
    console.log('\n[SUCCESS] Nuclear Dev Reset completed successfully!');
    console.log(` - Attendance Records Purged : ${res.purgedCounts.attendance}`);
    console.log(` - QR Kiosk Sessions Purged  : ${res.purgedCounts.qrSessions}`);
    console.log(` - Leave Requests Purged     : ${res.purgedCounts.leaves}`);
    console.log(` - Replacements Purged       : ${res.purgedCounts.replacements}`);
    console.log(` - Payroll Periods Purged    : ${res.purgedCounts.payrollPeriods}`);
    console.log(` - Payroll Entries Purged    : ${res.purgedCounts.payrollEntries}\n`);
  } else {
    console.error(`\n[ERROR] Nuclear reset failed: ${res.error}\n`);
  }
}
