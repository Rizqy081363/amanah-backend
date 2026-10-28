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
import { resolveStaff } from './attendance-purge.service';

export interface PayrollPeriodSummary {
  id: string;
  periodName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalPayout: number;
  entryCount: number;
  calculatedAt: string | null;
}

export async function fetchPayrollPeriodsSummary(
  pool: Pool,
): Promise<PayrollPeriodSummary[]> {
  const query = `
    SELECT 
      p.id,
      p.period_name,
      p.period_start::text,
      p.period_end::text,
      p.status,
      p.total_payout::float AS total_payout,
      COUNT(e.id)::int AS entry_count,
      to_char(p.calculated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') AS calculated_at
    FROM payroll_periods p
    LEFT JOIN payroll_entries e ON e.payroll_period_id = p.id
    GROUP BY p.id, p.period_name, p.period_start, p.period_end, p.status, p.total_payout, p.calculated_at
    ORDER BY p.period_start DESC;
  `;

  const res = await pool.query(query);
  return res.rows.map((r) => ({
    id: String(r.id),
    periodName: String(r.period_name),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    status: String(r.status),
    totalPayout: Number(r.total_payout || 0),
    entryCount: Number(r.entry_count || 0),
    calculatedAt: r.calculated_at ? String(r.calculated_at) : null,
  }));
}

export function renderPayrollPeriodsTable(periods: PayrollPeriodSummary[]): void {
  if (periods.length === 0) {
    console.log('\n[INFO] No payroll periods found in database.\n');
    return;
  }

  console.log('\n------------------------------------------------------------------------------------------------------------------------');
  console.log(`| ${padRight('Period Name', 22)} | ${padRight('Start', 10)} | ${padRight('End', 10)} | ${padRight('Status', 12)} | ${padRight('Entries', 8)} | ${padRight('Total Payout', 18)} | ${padRight('Period ID', 36)} |`);
  console.log('------------------------------------------------------------------------------------------------------------------------');
  for (const p of periods) {
    const formattedPayout = `Rp ${p.totalPayout.toLocaleString('id-ID')}`;
    console.log(
      `| ${padRight(p.periodName, 22)} | ${padRight(p.periodStart, 10)} | ${padRight(p.periodEnd, 10)} | ${padRight(p.status, 12)} | ${padRight(String(p.entryCount), 8)} | ${padRight(formattedPayout, 18)} | ${padRight(p.id, 36)} |`,
    );
  }
  console.log('------------------------------------------------------------------------------------------------------------------------\n');
}

export async function executePurgeAllPayrollEntries(
  pool: Pool,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const deleteRes = await client.query('DELETE FROM payroll_entries;');
    await client.query("UPDATE payroll_periods SET total_payout = 0.00, status = 'draft';");
    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(redisClient, ['payroll'], ['*payroll*']);
    return { success: true, deletedCount: deleteRes.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function executePurgeAllPayrollPeriodsAndEntries(
  pool: Pool,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const countRes = await client.query('SELECT count(*)::int FROM payroll_periods;');
    const totalPeriods = Number(countRes.rows[0].count);
    // Explicit delete ensures ON DELETE CASCADE removes payroll_entries cleanly
    await client.query('DELETE FROM payroll_periods;');
    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(redisClient, ['payroll'], ['*payroll*']);
    return { success: true, deletedCount: totalPeriods };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function executePurgePayrollForStaff(
  pool: Pool,
  staffProfileId: string,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const deleteRes = await client.query(
      'DELETE FROM payroll_entries WHERE staff_profile_id = $1;',
      [staffProfileId],
    );
    // Recalculate total_payout on affected periods
    await client.query(`
      UPDATE payroll_periods p
      SET total_payout = COALESCE(sub.new_total, 0.00)
      FROM (
        SELECT payroll_period_id, SUM(amount) as new_total
        FROM payroll_entries
        GROUP BY payroll_period_id
      ) sub
      WHERE p.id = sub.payroll_period_id;
    `);
    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(redisClient, ['payroll'], ['*payroll*']);
    return { success: true, deletedCount: deleteRes.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function executePurgePayrollPeriodById(
  pool: Pool,
  periodId: string,
  redisClient: Redis | null,
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const deleteRes = await client.query('DELETE FROM payroll_periods WHERE id = $1;', [periodId]);
    await client.query('COMMIT');
    await invalidateRedisTagsAndPrefixes(redisClient, ['payroll'], ['*payroll*']);
    return { success: true, deletedCount: deleteRes.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, deletedCount: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function runPayrollPurgeInteractive(
  pool: Pool,
  redisClient: Redis | null,
  rl: readline.Interface,
): Promise<void> {
  while (true) {
    printSection('PAYROLL DATA PURGE MENU');
    console.log('Select payroll purge action:');
    console.log(' [1] Flush ALL Payroll Entries (Kosongkan seluruh rincian entri gaji, periode kembali ke draft)');
    console.log(' [2] Flush ALL Payroll Periods & Entries (Hapus seluruh periode & rincian gaji)');
    console.log(' [3] Flush Payroll Entries by Staff (Hapus entri gaji khusus staf tertentu)');
    console.log(' [4] Flush Specific Payroll Period by ID (Hapus satu periode penggajian)');
    console.log(' [5] Inspect Payroll Periods Directory (Lihat daftar periode & entri)');
    console.log(' [b] Back to Main Menu\n');

    const choice = await askSafeQuestion(rl, 'Enter choice [1-5 or b]: ');
    if (!choice || choice.toLowerCase() === 'b' || choice.toLowerCase() === 'back') {
      break;
    }

    if (choice === '1') {
      const countRes = await pool.query('SELECT count(*)::int FROM payroll_entries;');
      const count = Number(countRes.rows[0]?.count ?? 0);

      if (count === 0) {
        console.log('[INFO] No payroll entries found. Table is already empty.');
        continue;
      }

      const confirmed = await confirmPurge(
        rl,
        'ALL Payroll Entries (System-Wide)',
        count,
        'Payroll periods will remain but will be reset to draft with Rp 0 total payout.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log('\n[INFO] Executing transactional purge for payroll entries...');
      const res = await executePurgeAllPayrollEntries(pool, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} payroll entry/entries.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
      }
    } else if (choice === '2') {
      const periods = await fetchPayrollPeriodsSummary(pool);
      renderPayrollPeriodsTable(periods);
      if (periods.length === 0) continue;

      const confirmed = await confirmPurge(
        rl,
        'ALL Payroll Periods and All Dependent Entries (100% Flush)',
        periods.length,
        'DANGER: All payroll history, calculated periods, and payslip entries will be permanently deleted.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log('\n[INFO] Executing transactional purge for all payroll periods...');
      const res = await executePurgeAllPayrollPeriodsAndEntries(pool, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} payroll period(s) and all cascaded entries.`);
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
        'SELECT count(*)::int FROM payroll_entries WHERE staff_profile_id = $1;',
        [staff.staffProfileId],
      );
      const count = Number(countRes.rows[0]?.count ?? 0);

      console.log(`\nTarget Staff : ${staff.fullName} (${staff.email})`);
      console.log(`Staff Code   : ${staff.staffCode}`);
      console.log(`Entries Count: ${count} record(s)\n`);

      if (count === 0) {
        console.log('[INFO] No payroll entries found for this staff.');
        continue;
      }

      const confirmed = await confirmPurge(
        rl,
        `Payroll Entries for ${staff.fullName} (${staff.email})`,
        count,
        'Only entries belonging to this staff will be removed.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log(`\n[INFO] Purging payroll entries for ${staff.fullName}...`);
      const res = await executePurgePayrollForStaff(pool, staff.staffProfileId, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} payroll entry/entries for ${staff.fullName}.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
      }
    } else if (choice === '4') {
      const periods = await fetchPayrollPeriodsSummary(pool);
      renderPayrollPeriodsTable(periods);
      if (periods.length === 0) continue;

      const periodId = await askSafeQuestion(rl, 'Enter Payroll Period UUID: ');
      if (!periodId || !isUuid(periodId)) {
        console.log('[WARN] Invalid or missing UUID.');
        continue;
      }

      const confirmed = await confirmPurge(
        rl,
        `Payroll Period [${periodId}] and its entries`,
        1,
        'Cascades to all payroll entries within this period.',
      );
      if (!confirmed) {
        console.log('[INFO] Purge aborted.');
        continue;
      }

      console.log(`\n[INFO] Purging payroll period ${periodId}...`);
      const res = await executePurgePayrollPeriodById(pool, periodId, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged payroll period.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
      }
    } else if (choice === '5') {
      const periods = await fetchPayrollPeriodsSummary(pool);
      renderPayrollPeriodsTable(periods);
    } else {
      console.log('[WARN] Invalid choice. Please enter 1-5 or b.');
    }
  }
}
