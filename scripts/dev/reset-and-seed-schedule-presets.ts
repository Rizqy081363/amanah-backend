#!/usr/bin/env bun
import { Pool } from 'pg';
import {
  createDbPool,
  getRedisClient,
  invalidateRedisTagsAndPrefixes,
} from './purge/db-connection';
import { printHeader, printSection } from './purge/purge-helpers';

interface ShiftSeedDef {
  code: string;
  label: string;
  codePrefix: string;
  startsAt: string;
  endsAt: string;
  sortOrder: number;
}

const PRESETS: Record<string, ShiftSeedDef[]> = {
  '2-shifts': [
    {
      code: 'pagi',
      label: 'Sesi Pagi',
      codePrefix: 'P',
      startsAt: '08:00:00',
      endsAt: '14:00:00',
      sortOrder: 1,
    },
    {
      code: 'sore',
      label: 'Sesi Sore',
      codePrefix: 'S',
      startsAt: '14:00:00',
      endsAt: '20:00:00',
      sortOrder: 2,
    },
  ],
  '3-shifts': [
    {
      code: 'pagi',
      label: 'Sesi Pagi',
      codePrefix: 'P',
      startsAt: '07:00:00',
      endsAt: '14:00:00',
      sortOrder: 1,
    },
    {
      code: 'siang',
      label: 'Sesi Siang',
      codePrefix: 'S',
      startsAt: '14:00:00',
      endsAt: '21:00:00',
      sortOrder: 2,
    },
    {
      code: 'malam',
      label: 'Sesi Malam',
      codePrefix: 'M',
      startsAt: '21:00:00',
      endsAt: '24:00:00',
      sortOrder: 3,
    },
  ],
  '4-shifts': [
    {
      code: 'dini_hari',
      label: 'Sesi Dini Hari',
      codePrefix: 'DH',
      startsAt: '00:30:00',
      endsAt: '04:30:00',
      sortOrder: 1,
    },
    {
      code: 'pagi',
      label: 'Sesi Pagi',
      codePrefix: 'P',
      startsAt: '06:00:00',
      endsAt: '12:00:00',
      sortOrder: 2,
    },
    {
      code: 'siang',
      label: 'Sesi Siang',
      codePrefix: 'S',
      startsAt: '14:30:00',
      endsAt: '18:00:00',
      sortOrder: 3,
    },
    {
      code: 'malam',
      label: 'Sesi Malam',
      codePrefix: 'M',
      startsAt: '18:00:00',
      endsAt: '24:00:00',
      sortOrder: 4,
    },
  ],
  custom: [
    {
      code: 'pagi_buta',
      label: 'Sesi Pagi Buta',
      codePrefix: 'PB',
      startsAt: '04:00:00',
      endsAt: '08:00:00',
      sortOrder: 1,
    },
    {
      code: 'layanan_senja',
      label: 'Layanan Senja',
      codePrefix: 'LS',
      startsAt: '16:00:00',
      endsAt: '21:00:00',
      sortOrder: 2,
    },
  ],
};

export async function flushAllScheduleData(pool: Pool): Promise<{
  deletedHistory: number;
  deletedAssignments: number;
  deletedRosters: number;
  deletedExceptions: number;
  deletedCounters: number;
  deletedSchedules: number;
  deletedSessionDefs: number;
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Delete doctor schedule status history
    const histRes = await client.query('DELETE FROM doctor_schedule_status_history;');
    // 2. Delete doctor assignments
    const assignRes = await client.query('DELETE FROM doctor_assignment;');
    // 3. Delete staff rosters
    const rosterRes = await client.query('DELETE FROM staff_roster;');
    // 4. Delete shift exceptions
    const exRes = await client.query('DELETE FROM shift_exception;');
    // 5. Delete queue counters
    const counterRes = await client.query('DELETE FROM queue_counter;');
    // 6. Delete weekly schedule templates
    const schedRes = await client.query('DELETE FROM session_schedule;');
    // 7. Delete session definitions
    const defRes = await client.query('DELETE FROM session_def;');

    await client.query('COMMIT');

    return {
      deletedHistory: histRes.rowCount ?? 0,
      deletedAssignments: assignRes.rowCount ?? 0,
      deletedRosters: rosterRes.rowCount ?? 0,
      deletedExceptions: exRes.rowCount ?? 0,
      deletedCounters: counterRes.rowCount ?? 0,
      deletedSchedules: schedRes.rowCount ?? 0,
      deletedSessionDefs: defRes.rowCount ?? 0,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function seedSchedulePreset(
  pool: Pool,
  presetName: string,
): Promise<{ insertedDefs: number; insertedSchedules: number }> {
  const defs = PRESETS[presetName];
  if (!defs) {
    throw new Error(
      `Unknown preset '${presetName}'. Available presets: ${Object.keys(PRESETS).join(', ')}`,
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Flush existing schedule data
    await client.query('DELETE FROM doctor_schedule_status_history;');
    await client.query('DELETE FROM doctor_assignment;');
    await client.query('DELETE FROM staff_roster;');
    await client.query('DELETE FROM shift_exception;');
    await client.query('DELETE FROM queue_counter;');
    await client.query('DELETE FROM session_schedule;');
    await client.query('DELETE FROM session_def;');

    // 2. Insert new session definitions
    const sessionIds: { id: string; startsAt: string; endsAt: string }[] = [];
    for (const d of defs) {
      const res = await client.query(
        `INSERT INTO session_def (code, label, label_key, code_prefix, sort_order, is_active, default_starts_at, default_ends_at)
         VALUES ($1, $2, $3, $4, $5, true, $6, $7)
         RETURNING id;`,
        [d.code, d.label, `session.${d.code}`, d.codePrefix, d.sortOrder, d.startsAt, d.endsAt],
      );
      sessionIds.push({
        id: res.rows[0].id,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
      });
    }

    // 3. Query active master days (dow 0..6)
    const daysRes = await client.query(
      `SELECT dow FROM master_day WHERE is_active = true ORDER BY dow ASC;`,
    );
    const activeDows: number[] = daysRes.rows.map((r) => r.dow);

    // 4. Populate weekly template matrix (session_schedule)
    let insertedSchedules = 0;
    for (const dow of activeDows) {
      for (const s of sessionIds) {
        await client.query(
          `INSERT INTO session_schedule (dow, session_id, starts_at, ends_at, is_active)
           VALUES ($1, $2, $3, $4, true);`,
          [dow, s.id, s.startsAt, s.endsAt],
        );
        insertedSchedules++;
      }
    }

    await client.query('COMMIT');

    return {
      insertedDefs: sessionIds.length,
      insertedSchedules,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const pool = createDbPool();
  const redisClient = await getRedisClient();

  try {
    printHeader('SCHEDULE POLICY DYNAMIC RESET & PRESET SEEDER');

    const empty = args.includes('--empty') || args.includes('--cold-start');
    const presetArg = args.find((a) => a.startsWith('--preset='))?.split('=')[1] ??
      (args.includes('--preset') ? args[args.indexOf('--preset') + 1] : null);

    if (empty) {
      console.log('[ACTION] Flushing ALL schedule sessions, rosters, assignments & session definitions...');
      const res = await flushAllScheduleData(pool);
      await invalidateRedisTagsAndPrefixes(
        redisClient,
        ['schedule', 'schedule:list', 'schedule:detail', 'schedule:ref', 'schedule:doctor-profile'],
        ['*schedule*', '*booking*'],
      );

      printSection('Cold-Start Result');
      console.log(` - Doctor Assignments Deleted : ${res.deletedAssignments}`);
      console.log(` - Status History Deleted     : ${res.deletedHistory}`);
      console.log(` - Staff Rosters Deleted       : ${res.deletedRosters}`);
      console.log(` - Weekly Templates Deleted   : ${res.deletedSchedules}`);
      console.log(` - Shift Definitions Deleted  : ${res.deletedSessionDefs}`);
      console.log('\n[STATE] Database is now 100% COLD-START (session_def is empty).\n');
      return;
    }

    if (presetArg) {
      console.log(`[ACTION] Applying Schedule Preset: '${presetArg}'...`);
      const res = await seedSchedulePreset(pool, presetArg);
      await invalidateRedisTagsAndPrefixes(
        redisClient,
        ['schedule', 'schedule:list', 'schedule:detail', 'schedule:ref', 'schedule:doctor-profile'],
        ['*schedule*', '*booking*'],
      );

      printSection('Preset Application Result');
      console.log(` - Shift Definitions Seeded   : ${res.insertedDefs}`);
      console.log(` - Weekly Schedule Matrix Rows: ${res.insertedSchedules}`);
      console.log(`\n[SUCCESS] Applied preset '${presetArg}' successfully.\n`);
      return;
    }

    console.log(`Usage:
  bun ./scripts/dev/reset-and-seed-schedule-presets.ts --empty
  bun ./scripts/dev/reset-and-seed-schedule-presets.ts --preset 2-shifts
  bun ./scripts/dev/reset-and-seed-schedule-presets.ts --preset 3-shifts
  bun ./scripts/dev/reset-and-seed-schedule-presets.ts --preset 4-shifts
  bun ./scripts/dev/reset-and-seed-schedule-presets.ts --preset custom
`);
  } finally {
    await pool.end();
    if (redisClient) {
      await redisClient.quit();
    }
  }
}

main().catch((err) => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});
