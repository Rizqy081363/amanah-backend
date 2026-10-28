import type * as readline from 'node:readline/promises';
import { Pool, type PoolClient } from 'pg';
import type Redis from 'ioredis';
import { invalidateRedisTagsAndPrefixes } from './db-connection';
import {
  printSection,
  padRight,
  askSafeQuestion,
  confirmPurge,
} from './purge-helpers';
import { resolveStaff } from './attendance-purge.service';

export interface LeaveRequestSummary {
  id: string;
  fullName: string;
  email: string;
  requestType: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  status: string;
  sessionsCount: number;
  replacementCount: number;
}

export async function fetchLeaveRequestsSummary(
  pool: Pool,
  search?: string,
): Promise<LeaveRequestSummary[]> {
  let whereClause = '';
  const params: unknown[] = [];

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClause = `
      AND (
        LOWER(sp.full_name) LIKE $1
        OR LOWER(u.email::text) LIKE $1
        OR LOWER(COALESCE(sp.staff_code, '')) LIKE $1
        OR lr.id::text LIKE $1
      )
    `;
  }

  const query = `
    SELECT 
      lr.id,
      sp.full_name,
      COALESCE(u.email::text, '-') AS email,
      lr.request_type::text AS request_type,
      lr.start_date::text AS start_date,
      lr.end_date::text AS end_date,
      lr.duration_days,
      lr.status::text AS status,
      COUNT(DISTINCT lrs.id)::int AS sessions_count,
      COUNT(DISTINCT ro.id)::int AS replacement_count
    FROM staff_leave_requests lr
    JOIN staff_profiles sp ON lr.staff_profile_id = sp.id
    JOIN users u ON sp.user_id = u.id
    LEFT JOIN leave_request_sessions lrs ON lrs.leave_request_id = lr.id
    LEFT JOIN replacement_opportunities ro ON ro.leave_request_id = lr.id
    WHERE 1=1 ${whereClause}
    GROUP BY lr.id, sp.full_name, u.email, lr.request_type, lr.start_date, lr.end_date, lr.duration_days, lr.status
    ORDER BY lr.start_date DESC, lr.created_at DESC;
  `;

  const res = await pool.query(query, params);
  return res.rows.map((r) => ({
    id: String(r.id),
    fullName: String(r.full_name),
    email: String(r.email),
    requestType: String(r.request_type),
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    durationDays: Number(r.duration_days || 1),
    status: String(r.status),
    sessionsCount: Number(r.sessions_count || 0),
    replacementCount: Number(r.replacement_count || 0),
  }));
}

export function renderLeavesTable(leaves: LeaveRequestSummary[]): void {
  if (leaves.length === 0) {
    console.log('\n[INFO] No leave requests found in database.\n');
    return;
  }

  console.log('\n---------------------------------------------------------------------------------------------------------------------------------');
  console.log(`| ${padRight('Staff Name', 22)} | ${padRight('Type', 16)} | ${padRight('Start', 10)} | ${padRight('End', 10)} | ${padRight('Days', 5)} | ${padRight('Status', 10)} | ${padRight('Sessions', 8)} | ${padRight('Reps', 5)} | ${padRight('Leave ID', 18)} |`);
  console.log('---------------------------------------------------------------------------------------------------------------------------------');
  for (const l of leaves) {
    console.log(
      `| ${padRight(l.fullName, 22)} | ${padRight(l.requestType, 16)} | ${padRight(l.startDate, 10)} | ${padRight(l.endDate, 10)} | ${padRight(String(l.durationDays), 5)} | ${padRight(l.status, 10)} | ${padRight(String(l.sessionsCount), 8)} | ${padRight(String(l.replacementCount), 5)} | ${padRight(l.id.slice(0, 16) + '..', 18)} |`,
    );
  }
  console.log('---------------------------------------------------------------------------------------------------------------------------------\n');
}

export async function executePurgeAllLeaves(
  pool: Pool,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    // Unlink attendance records before deleting leaves
    await client.query('UPDATE staff_attendance_records SET leave_request_id = NULL WHERE leave_request_id IS NOT NULL;');
    // Delete all leave requests (DB FK cascades to sessions & replacement opps; trigger cascades to payroll_entries)
    const deleteRes = await client.query('DELETE FROM staff_leave_requests;');
    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(
      redisClient,
      ['leave', 'replacement', 'payroll', 'roster'],
      ['*leave*', '*replacement*', '*payroll*', '*roster*'],
    );
    return { success: true, deletedCount: deleteRes.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function executePurgeTodayLeaves(
  pool: Pool,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const deleteRes = await client.query(`
      DELETE FROM staff_leave_requests 
      WHERE CURRENT_DATE >= start_date AND CURRENT_DATE <= end_date;
    `);
    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(
      redisClient,
      ['leave', 'replacement', 'payroll', 'roster'],
      ['*leave*', '*replacement*', '*payroll*', '*roster*'],
    );
    return { success: true, deletedCount: deleteRes.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function executePurgeLeavesForStaff(
  pool: Pool,
  staffProfileId: string,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    // Unlink attendance records for this staff leave
    await client.query(
      `UPDATE staff_attendance_records 
       SET leave_request_id = NULL 
       WHERE leave_request_id IN (SELECT id FROM staff_leave_requests WHERE staff_profile_id = $1);`,
      [staffProfileId],
    );
    const deleteRes = await client.query(
      'DELETE FROM staff_leave_requests WHERE staff_profile_id = $1;',
      [staffProfileId],
    );
    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(
      redisClient,
      ['leave', 'replacement', 'payroll', 'roster'],
      ['*leave*', '*replacement*', '*payroll*', '*roster*'],
    );
    return { success: true, deletedCount: deleteRes.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function runLeavePurgeInteractive(
  pool: Pool,
  redisClient: Redis | null,
  rl: readline.Interface,
): Promise<void> {
  while (true) {
    printSection('LEAVE & CUTI DATA PURGE MENU');
    console.log('Select leave purge action:');
    console.log(' [1] Flush ALL Leave Requests (Hapus 100% permohonan cuti, sesi & potongan gaji)');
    console.log(' [2] Flush Today\'s Active Leaves (Hapus cuti yang sedang aktif hari ini)');
    console.log(' [3] Flush Leave Requests by Staff Profile (Hapus riwayat cuti staf tertentu)');
    console.log(' [4] Inspect Leave Requests Directory (Lihat daftar permohonan cuti)');
    console.log(' [b] Back to Main Menu\n');

    const choice = await askSafeQuestion(rl, 'Enter choice [1-4 or b]: ');
    if (!choice || choice.toLowerCase() === 'b' || choice.toLowerCase() === 'back') {
      break;
    }

    if (choice === '1') {
      const leaves = await fetchLeaveRequestsSummary(pool);
      renderLeavesTable(leaves);
      if (leaves.length === 0) continue;

      const confirmed = await confirmPurge(
        rl,
        'ALL Staff Leave Requests (100% System Flush)',
        leaves.length,
        'Cascades automatically: Leave sessions, replacement opportunities, and leave deduction payroll entries will be permanently removed.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log('\n[INFO] Executing transactional purge for all leave requests...');
      const res = await executePurgeAllLeaves(pool, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} leave request(s) and all cascaded relations.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
      }
    } else if (choice === '2') {
      const checkRes = await pool.query(
        'SELECT count(*)::int FROM staff_leave_requests WHERE CURRENT_DATE >= start_date AND CURRENT_DATE <= end_date;',
      );
      const count = Number(checkRes.rows[0]?.count ?? 0);

      if (count === 0) {
        console.log('[INFO] No active leaves for today (CURRENT_DATE).');
        continue;
      }

      const confirmed = await confirmPurge(
        rl,
        'Today\'s Active Leaves',
        count,
        'Staff who are currently marked on leave today will be unblocked and restored to normal status.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log('\n[INFO] Purging today\'s leaves...');
      const res = await executePurgeTodayLeaves(pool, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} today's leave request(s).`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
      }
    } else if (choice === '3') {
      const search = await askSafeQuestion(rl, 'Enter Staff email, name, staff code, or UUID: ');
      if (!search) continue;

      const staff = await resolveStaff(pool, search);
      if (!staff) {
        console.log(`[WARN] Staff not found matching: "${search}"`);
        continue;
      }

      const countRes = await pool.query(
        'SELECT count(*)::int FROM staff_leave_requests WHERE staff_profile_id = $1;',
        [staff.staffProfileId],
      );
      const count = Number(countRes.rows[0]?.count ?? 0);

      console.log(`\nTarget Staff : ${staff.fullName} (${staff.email})`);
      console.log(`Staff Code   : ${staff.staffCode}`);
      console.log(`Leave Count  : ${count} request(s)\n`);

      if (count === 0) {
        console.log('[INFO] No leave requests found for this staff.');
        continue;
      }

      const confirmed = await confirmPurge(
        rl,
        `Leave Requests for ${staff.fullName} (${staff.email})`,
        count,
        'All leave requests for this staff and their cascaded sessions and deductions will be removed.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log(`\n[INFO] Purging leave requests for ${staff.fullName}...`);
      const res = await executePurgeLeavesForStaff(pool, staff.staffProfileId, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} leave request(s) for ${staff.fullName}.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
      }
    } else if (choice === '4') {
      const leaves = await fetchLeaveRequestsSummary(pool);
      renderLeavesTable(leaves);
    } else {
      console.log('[WARN] Invalid choice. Please enter 1-4 or b.');
    }
  }
}
