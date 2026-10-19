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

export interface StaffAttendanceSummary {
  staffProfileId: string;
  userId: string;
  fullName: string;
  email: string;
  staffCode: string;
  totalRecords: number;
  todayRecords: number;
}

export interface TodayAttendanceItem {
  id: string;
  attendanceDate: string;
  shift: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  fullName: string;
  email: string;
  staffCode: string;
  recordedMethod: string;
}

export interface AttendancePurgeInspection {
  mode: 'TODAY_ALL' | 'TODAY_STAFF' | 'ALL_STAFF' | 'ALL_SYSTEM' | 'QR_SESSIONS';
  staffProfileId?: string;
  fullName?: string;
  email?: string;
  staffCode?: string;
  todayRecordsCount: number;
  totalRecordsCount: number;
  qrSessionsCount?: number;
}

export async function fetchStaffWithAttendance(
  pool: Pool,
  search?: string,
): Promise<StaffAttendanceSummary[]> {
  let whereClause = '';
  const params: unknown[] = [];

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClause = `
      AND (
        LOWER(sp.full_name) LIKE $1
        OR LOWER(u.email::text) LIKE $1
        OR LOWER(COALESCE(sp.staff_code, '')) LIKE $1
        OR sp.id::text LIKE $1
        OR u.id::text LIKE $1
      )
    `;
  }

  const query = `
    SELECT 
      sp.id AS staff_profile_id,
      sp.user_id,
      sp.full_name,
      COALESCE(u.email::text, '-') AS email,
      COALESCE(sp.staff_code, '-') AS staff_code,
      COUNT(r.id)::int AS total_records,
      COUNT(CASE WHEN r.attendance_date = CURRENT_DATE THEN 1 END)::int AS today_records
    FROM staff_profiles sp
    JOIN users u ON sp.user_id = u.id
    JOIN staff_attendance_records r ON r.staff_profile_id = sp.id
    WHERE 1=1 ${whereClause}
    GROUP BY sp.id, sp.user_id, sp.full_name, u.email, sp.staff_code
    ORDER BY today_records DESC, total_records DESC, sp.full_name ASC;
  `;

  const res = await pool.query(query, params);
  return res.rows.map((r) => ({
    staffProfileId: String(r.staff_profile_id),
    userId: String(r.user_id),
    fullName: String(r.full_name),
    email: String(r.email),
    staffCode: String(r.staff_code),
    totalRecords: Number(r.total_records),
    todayRecords: Number(r.today_records),
  }));
}

export async function fetchTodayAttendanceRecords(
  pool: Pool,
): Promise<TodayAttendanceItem[]> {
  const query = `
    SELECT 
      r.id,
      r.attendance_date::text AS attendance_date,
      r.shift::text AS shift,
      r.status::text AS status,
      to_char(r.check_in_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS') AS check_in_time,
      to_char(r.check_out_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS') AS check_out_time,
      sp.full_name,
      COALESCE(u.email::text, '-') AS email,
      COALESCE(sp.staff_code, '-') AS staff_code,
      r.recorded_method::text AS recorded_method
    FROM staff_attendance_records r
    JOIN staff_profiles sp ON r.staff_profile_id = sp.id
    JOIN users u ON sp.user_id = u.id
    WHERE r.attendance_date = CURRENT_DATE
    ORDER BY r.check_in_at DESC NULLS LAST, sp.full_name ASC;
  `;

  const res = await pool.query(query);
  return res.rows.map((r) => ({
    id: String(r.id),
    attendanceDate: String(r.attendance_date),
    shift: String(r.shift),
    status: String(r.status),
    checkInAt: r.check_in_time ? String(r.check_in_time) : null,
    checkOutAt: r.check_out_time ? String(r.check_out_time) : null,
    fullName: String(r.full_name),
    email: String(r.email),
    staffCode: String(r.staff_code),
    recordedMethod: String(r.recorded_method),
  }));
}

export function renderTodayAttendanceTable(records: TodayAttendanceItem[]): void {
  if (records.length === 0) {
    console.log('\n[INFO] No attendance records found for today (CURRENT_DATE).\n');
    return;
  }

  console.log('\n------------------------------------------------------------------------------------------------------------------------');
  console.log(`| ${padRight('Staff Name', 24)} | ${padRight('Email', 30)} | ${padRight('Shift', 10)} | ${padRight('Status', 10)} | ${padRight('Check-In', 10)} | ${padRight('Check-Out', 10)} |`);
  console.log('------------------------------------------------------------------------------------------------------------------------');
  for (const r of records) {
    console.log(
      `| ${padRight(r.fullName, 24)} | ${padRight(r.email, 30)} | ${padRight(r.shift, 10)} | ${padRight(r.status, 10)} | ${padRight(r.checkInAt ?? '-', 10)} | ${padRight(r.checkOutAt ?? '-', 10)} |`,
    );
  }
  console.log('------------------------------------------------------------------------------------------------------------------------\n');
}

export function renderStaffAttendanceTable(staffList: StaffAttendanceSummary[]): void {
  if (staffList.length === 0) {
    console.log('\n[INFO] No staff attendance records found.\n');
    return;
  }

  console.log('\n----------------------------------------------------------------------------------------------------');
  console.log(`| ${padRight('Staff Name', 24)} | ${padRight('Email', 32)} | ${padRight('Code', 12)} | ${padRight('Today', 8)} | ${padRight('Total', 8)} |`);
  console.log('----------------------------------------------------------------------------------------------------');
  for (const s of staffList) {
    console.log(
      `| ${padRight(s.fullName, 24)} | ${padRight(s.email, 32)} | ${padRight(s.staffCode, 12)} | ${padRight(String(s.todayRecords), 8)} | ${padRight(String(s.totalRecords), 8)} |`,
    );
  }
  console.log('----------------------------------------------------------------------------------------------------\n');
}

export async function resolveStaff(
  pool: Pool,
  identifier: string,
): Promise<{ staffProfileId: string; fullName: string; email: string; staffCode: string } | null> {
  const targetIsUuid = isUuid(identifier);
  const query = targetIsUuid
    ? `
      SELECT sp.id AS staff_profile_id, sp.full_name, COALESCE(u.email::text, '-') AS email, COALESCE(sp.staff_code, '-') AS staff_code
      FROM staff_profiles sp
      JOIN users u ON sp.user_id = u.id
      WHERE sp.id = $1::uuid OR sp.user_id = $1::uuid
      LIMIT 1;
    `
    : `
      SELECT sp.id AS staff_profile_id, sp.full_name, COALESCE(u.email::text, '-') AS email, COALESCE(sp.staff_code, '-') AS staff_code
      FROM staff_profiles sp
      JOIN users u ON sp.user_id = u.id
      WHERE LOWER(u.email::text) = LOWER($1)
         OR LOWER(sp.staff_code) = LOWER($1)
         OR LOWER(sp.full_name) LIKE LOWER($2)
      LIMIT 1;
    `;

  const params = targetIsUuid ? [identifier.trim()] : [identifier.trim(), `%${identifier.trim()}%`];
  const res = await pool.query(query, params);
  if (res.rows.length === 0) return null;

  return {
    staffProfileId: String(res.rows[0].staff_profile_id),
    fullName: String(res.rows[0].full_name),
    email: String(res.rows[0].email),
    staffCode: String(res.rows[0].staff_code),
  };
}

export async function executePurgeTodayAll(
  pool: Pool,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const deleteRes = await client.query(
      'DELETE FROM staff_attendance_records WHERE attendance_date = CURRENT_DATE;',
    );
    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(redisClient, ['attendance', 'presence'], ['*attendance*', '*presence*']);
    return { success: true, deletedCount: deleteRes.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function executePurgeTodayForStaff(
  pool: Pool,
  staffProfileId: string,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const deleteRes = await client.query(
      'DELETE FROM staff_attendance_records WHERE staff_profile_id = $1 AND attendance_date = CURRENT_DATE;',
      [staffProfileId],
    );
    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(redisClient, ['attendance', 'presence'], ['*attendance*', '*presence*']);
    return { success: true, deletedCount: deleteRes.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function executePurgeAllForStaff(
  pool: Pool,
  staffProfileId: string,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const deleteRes = await client.query(
      'DELETE FROM staff_attendance_records WHERE staff_profile_id = $1;',
      [staffProfileId],
    );
    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(redisClient, ['attendance', 'presence'], ['*attendance*', '*presence*']);
    return { success: true, deletedCount: deleteRes.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function executePurgeAllSystemWide(
  pool: Pool,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const countRes = await client.query('SELECT count(*)::int FROM staff_attendance_records;');
    const totalCount = Number(countRes.rows[0].count);
    await client.query('TRUNCATE TABLE staff_attendance_records CASCADE;');
    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(redisClient, ['attendance', 'presence'], ['*attendance*', '*presence*']);
    return { success: true, deletedCount: totalCount };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function executePurgeQrSessions(
  pool: Pool,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE staff_attendance_records SET qr_session_id = NULL WHERE qr_session_id IS NOT NULL;');
    const deleteRes = await client.query('DELETE FROM attendance_qr_sessions;');
    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(redisClient, ['attendance', 'presence'], ['*attendance*', '*presence*']);
    return { success: true, deletedCount: deleteRes.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function runAttendancePurgeInteractive(
  pool: Pool,
  redisClient: Redis | null,
  rl: readline.Interface,
): Promise<void> {
  while (true) {
    printSection('ATTENDANCE DATA PURGE MENU');
    console.log('Select attendance purge action:');
    console.log(' [1] Flush ALL Today\'s Attendance (Hapus seluruh presensi hari ini)');
    console.log(' [2] Flush Today\'s Attendance by Staff / Doctor (Hapus presensi hari ini khusus akun)');
    console.log(' [3] Flush ALL Attendance History for Specific Staff (Hapus riwayat presensi staf)');
    console.log(' [4] Flush 100% Attendance Records System-Wide (Hapus total seluruh presensi)');
    console.log(' [5] Inspect Today\'s Attendance Directory (Lihat daftar presensi hari ini)');
    console.log(' [6] Flush Active/Expired QR Kiosk Sessions (Bersihkan sesi QR attendance)');
    console.log(' [b] Back to Main Menu\n');

    const choice = await askSafeQuestion(rl, 'Enter choice [1-6 or b]: ');
    if (!choice || choice.toLowerCase() === 'b' || choice.toLowerCase() === 'back') {
      break;
    }

    if (choice === '1') {
      const todayRecords = await fetchTodayAttendanceRecords(pool);
      renderTodayAttendanceTable(todayRecords);
      if (todayRecords.length === 0) continue;

      const confirmed = await confirmPurge(
        rl,
        'ALL Today\'s Attendance Records (CURRENT_DATE)',
        todayRecords.length,
        'All staff will be able to perform check-in again today.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log('\n[INFO] Executing transactional purge for today\'s attendance...');
      const res = await executePurgeTodayAll(pool, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} attendance record(s) for today.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
      }
    } else if (choice === '2') {
      const search = await askSafeQuestion(rl, 'Enter Staff email, name, staff code, or UUID: ');
      if (!search) continue;

      const staff = await resolveStaff(pool, search);
      if (!staff) {
        console.log(`[WARN] Staff not found matching: "${search}"`);
        continue;
      }

      const checkRes = await pool.query(
        'SELECT count(*)::int FROM staff_attendance_records WHERE staff_profile_id = $1 AND attendance_date = CURRENT_DATE;',
        [staff.staffProfileId],
      );
      const count = Number(checkRes.rows[0]?.count ?? 0);

      console.log(`\nTarget Staff : ${staff.fullName} (${staff.email})`);
      console.log(`Staff Code   : ${staff.staffCode}`);
      console.log(`Today Count  : ${count} record(s)\n`);

      if (count === 0) {
        console.log('[INFO] No attendance record logged for this staff today. Nothing to purge.');
        continue;
      }

      const confirmed = await confirmPurge(
        rl,
        `Today's Attendance for ${staff.fullName} (${staff.email})`,
        count,
        'Staff will be able to perform check-in again immediately today.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log('\n[INFO] Purging today\'s attendance for staff...');
      const res = await executePurgeTodayForStaff(pool, staff.staffProfileId, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} attendance record(s) for ${staff.fullName}.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
      }
    } else if (choice === '3') {
      const staffList = await fetchStaffWithAttendance(pool);
      renderStaffAttendanceTable(staffList);

      const search = await askSafeQuestion(rl, 'Enter Staff email, name, staff code, or UUID: ');
      if (!search) continue;

      const staff = await resolveStaff(pool, search);
      if (!staff) {
        console.log(`[WARN] Staff not found matching: "${search}"`);
        continue;
      }

      const checkRes = await pool.query(
        'SELECT count(*)::int FROM staff_attendance_records WHERE staff_profile_id = $1;',
        [staff.staffProfileId],
      );
      const totalCount = Number(checkRes.rows[0]?.count ?? 0);

      console.log(`\nTarget Staff : ${staff.fullName} (${staff.email})`);
      console.log(`Total Count  : ${totalCount} record(s) across all dates\n`);

      if (totalCount === 0) {
        console.log('[INFO] No attendance records found for this staff.');
        continue;
      }

      const confirmed = await confirmPurge(
        rl,
        `ALL Attendance History for ${staff.fullName} (${staff.email})`,
        totalCount,
        'All historical attendance entries for this staff will be permanently deleted.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log('\n[INFO] Purging all attendance history for staff...');
      const res = await executePurgeAllForStaff(pool, staff.staffProfileId, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} record(s) for ${staff.fullName}.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
      }
    } else if (choice === '4') {
      const countRes = await pool.query('SELECT count(*)::int FROM staff_attendance_records;');
      const totalCount = Number(countRes.rows[0]?.count ?? 0);

      const confirmed = await confirmPurge(
        rl,
        'SYSTEM-WIDE 100% ATTENDANCE RECORDS (TRUNCATE)',
        totalCount,
        'DANGER: This will delete ALL attendance records for all staff in the database.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log('\n[INFO] Executing system-wide attendance purge...');
      const res = await executePurgeAllSystemWide(pool, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} attendance record(s) system-wide.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
      }
    } else if (choice === '5') {
      const todayRecords = await fetchTodayAttendanceRecords(pool);
      renderTodayAttendanceTable(todayRecords);
    } else if (choice === '6') {
      const qrRes = await pool.query('SELECT count(*)::int FROM attendance_qr_sessions;');
      const qrCount = Number(qrRes.rows[0]?.count ?? 0);

      const confirmed = await confirmPurge(
        rl,
        'ALL Rotating QR Kiosk Sessions',
        qrCount,
        'Active QR codes displayed on kiosks will expire immediately.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log('\n[INFO] Purging QR sessions...');
      const res = await executePurgeQrSessions(pool, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} QR session(s).`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
      }
    } else {
      console.log('[WARN] Invalid choice. Please enter 1-6 or b.');
    }
  }
}
