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

export interface ReplacementSummary {
  id: string;
  workDate: string;
  originalStaffName: string;
  claimedByStaffName: string | null;
  status: string;
  sessionName: string;
  claimedAt: string | null;
}

export async function fetchReplacementsSummary(
  pool: Pool,
  search?: string,
): Promise<ReplacementSummary[]> {
  let whereClause = '';
  const params: unknown[] = [];

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClause = `
      AND (
        LOWER(orig_sp.full_name) LIKE $1
        OR LOWER(COALESCE(claim_sp.full_name, '')) LIKE $1
        OR ro.id::text LIKE $1
      )
    `;
  }

  const query = `
    SELECT 
      ro.id,
      ro.work_date::text AS work_date,
      orig_sp.full_name AS original_staff_name,
      claim_sp.full_name AS claimed_by_staff_name,
      ro.status,
      COALESCE(sd.session_name, '-') AS session_name,
      to_char(ro.claimed_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') AS claimed_at
    FROM replacement_opportunities ro
    JOIN staff_profiles orig_sp ON ro.original_staff_profile_id = orig_sp.id
    LEFT JOIN staff_profiles claim_sp ON ro.claimed_by_staff_profile_id = claim_sp.id
    LEFT JOIN session_def sd ON ro.session_id = sd.id
    WHERE 1=1 ${whereClause}
    ORDER BY ro.work_date DESC, ro.created_at DESC;
  `;

  const res = await pool.query(query, params);
  return res.rows.map((r) => ({
    id: String(r.id),
    workDate: String(r.work_date),
    originalStaffName: String(r.original_staff_name),
    claimedByStaffName: r.claimed_by_staff_name ? String(r.claimed_by_staff_name) : null,
    status: String(r.status),
    sessionName: String(r.session_name),
    claimedAt: r.claimed_at ? String(r.claimed_at) : null,
  }));
}

export function renderReplacementsTable(reps: ReplacementSummary[]): void {
  if (reps.length === 0) {
    console.log('\n[INFO] No replacement opportunities found in database.\n');
    return;
  }

  console.log('\n---------------------------------------------------------------------------------------------------------------------------------');
  console.log(`| ${padRight('Work Date', 10)} | ${padRight('Original Staff', 20)} | ${padRight('Claimed By', 20)} | ${padRight('Session', 14)} | ${padRight('Status', 10)} | ${padRight('Claimed At', 16)} | ${padRight('Replacement ID', 18)} |`);
  console.log('---------------------------------------------------------------------------------------------------------------------------------');
  for (const r of reps) {
    console.log(
      `| ${padRight(r.workDate, 10)} | ${padRight(r.originalStaffName, 20)} | ${padRight(r.claimedByStaffName ?? '-', 20)} | ${padRight(r.sessionName, 14)} | ${padRight(r.status, 10)} | ${padRight(r.claimedAt ?? '-', 16)} | ${padRight(r.id.slice(0, 16) + '..', 18)} |`,
    );
  }
  console.log('---------------------------------------------------------------------------------------------------------------------------------\n');
}

export async function executePurgeAllReplacements(
  pool: Pool,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    // Unlink attendance records and reset replacement flag
    await client.query(`
      UPDATE staff_attendance_records 
      SET is_replacement = false, replacement_opportunity_id = NULL 
      WHERE replacement_opportunity_id IS NOT NULL;
    `);
    const deleteRes = await client.query('DELETE FROM replacement_opportunities;');
    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(
      redisClient,
      ['replacement', 'attendance', 'roster', 'payroll'],
      ['*replacement*', '*attendance*', '*roster*', '*payroll*'],
    );
    return { success: true, deletedCount: deleteRes.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function executePurgeOpenReplacements(
  pool: Pool,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const deleteRes = await client.query("DELETE FROM replacement_opportunities WHERE status = 'open';");
    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(
      redisClient,
      ['replacement', 'roster'],
      ['*replacement*', '*roster*'],
    );
    return { success: true, deletedCount: deleteRes.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function executePurgeReplacementsForStaff(
  pool: Pool,
  staffProfileId: string,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    // Unlink attendance records referencing opportunities of this staff
    await client.query(`
      UPDATE staff_attendance_records 
      SET is_replacement = false, replacement_opportunity_id = NULL 
      WHERE replacement_opportunity_id IN (
        SELECT id FROM replacement_opportunities 
        WHERE original_staff_profile_id = $1 OR claimed_by_staff_profile_id = $1
      );
    `, [staffProfileId]);

    const deleteRes = await client.query(`
      DELETE FROM replacement_opportunities 
      WHERE original_staff_profile_id = $1 OR claimed_by_staff_profile_id = $1;
    `, [staffProfileId]);

    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(
      redisClient,
      ['replacement', 'attendance', 'roster', 'payroll'],
      ['*replacement*', '*attendance*', '*roster*', '*payroll*'],
    );
    return { success: true, deletedCount: deleteRes.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function runReplacementPurgeInteractive(
  pool: Pool,
  redisClient: Redis | null,
  rl: readline.Interface,
): Promise<void> {
  while (true) {
    printSection('REPLACEMENT (DINAS PENGGANTI) PURGE MENU');
    console.log('Select replacement purge action:');
    console.log(' [1] Flush ALL Replacement Opportunities (Hapus 100% tiket peluang dinas pengganti)');
    console.log(' [2] Flush Open / Unclaimed Replacements (Hapus peluang tiket yang belum diklaim)');
    console.log(' [3] Flush Replacements by Staff Profile (Hapus dinas pengganti milik/klaim staf tertentu)');
    console.log(' [4] Inspect Replacement Opportunities Directory (Lihat daftar tiket pengganti)');
    console.log(' [b] Back to Main Menu\n');

    const choice = await askSafeQuestion(rl, 'Enter choice [1-4 or b]: ');
    if (!choice || choice.toLowerCase() === 'b' || choice.toLowerCase() === 'back') {
      break;
    }

    if (choice === '1') {
      const reps = await fetchReplacementsSummary(pool);
      renderReplacementsTable(reps);
      if (reps.length === 0) continue;

      const confirmed = await confirmPurge(
        rl,
        'ALL Replacement Opportunities (100% System Flush)',
        reps.length,
        'Attendance records referencing these replacements will have is_replacement reset to false.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log('\n[INFO] Executing transactional purge for all replacement opportunities...');
      const res = await executePurgeAllReplacements(pool, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} replacement opportunity/opportunities.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
      }
    } else if (choice === '2') {
      const countRes = await pool.query("SELECT count(*)::int FROM replacement_opportunities WHERE status = 'open';");
      const count = Number(countRes.rows[0]?.count ?? 0);

      if (count === 0) {
        console.log('[INFO] No open/unclaimed replacement opportunities found.');
        continue;
      }

      const confirmed = await confirmPurge(
        rl,
        'Open (Unclaimed) Replacement Opportunities',
        count,
        'Removes unassigned replacement tickets from the marketplace.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log('\n[INFO] Purging open replacement opportunities...');
      const res = await executePurgeOpenReplacements(pool, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} open replacement opportunity/opportunities.`);
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
        'SELECT count(*)::int FROM replacement_opportunities WHERE original_staff_profile_id = $1 OR claimed_by_staff_profile_id = $1;',
        [staff.staffProfileId],
      );
      const count = Number(countRes.rows[0]?.count ?? 0);

      console.log(`\nTarget Staff      : ${staff.fullName} (${staff.email})`);
      console.log(`Staff Code        : ${staff.staffCode}`);
      console.log(`Replacement Count : ${count} record(s)\n`);

      if (count === 0) {
        console.log('[INFO] No replacement records found for this staff.');
        continue;
      }

      const confirmed = await confirmPurge(
        rl,
        `Replacements for ${staff.fullName} (${staff.email})`,
        count,
        'All original and claimed replacements for this staff will be removed.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log(`\n[INFO] Purging replacements for ${staff.fullName}...`);
      const res = await executePurgeReplacementsForStaff(pool, staff.staffProfileId, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} replacement record(s) for ${staff.fullName}.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
      }
    } else if (choice === '4') {
      const reps = await fetchReplacementsSummary(pool);
      renderReplacementsTable(reps);
    } else {
      console.log('[WARN] Invalid choice. Please enter 1-4 or b.');
    }
  }
}
