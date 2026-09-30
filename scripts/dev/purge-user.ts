#!/usr/bin/env bun
/**
 * Amanah Healthcare - Developer System Data Purge CLI Runner
 * 
 * Purpose:
 *   Comprehensive developer CLI tool for discovering, inspecting, and selectively
 *   purging database records across four key domains:
 *     1. User Purge (Cascade delete user account & profile)
 *     2. Appointment Purge (100% Flush ALL or Per-Patient Purge)
 *     3. Doctor Schedule Purge (Flush ALL or Per-Doctor Schedule Sessions)
 *     4. Doctor / Practitioner Purge (Flush ALL or Single Doctor Profile)
 * 
 * Design:
 *   - Plain ASCII terminal interface (No emojis)
 *   - Deep relational cascade safety with rollback on error
 *   - Automatic Redis cache invalidation
 *   - Modular service architecture (< 500 LOC per file)
 */

import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  createDbPool,
  getRedisClient,
  dbHost,
  dbPort,
  dbName,
  redisHost,
  redisPort,
} from './purge/db-connection';
import { printHeader, printSection, askSafeQuestion } from './purge/purge-helpers';
import {
  runUserPurgeInteractive,
  fetchAllUsers,
  renderUsersTable,
  inspectUserRecords,
  renderInspectionResult,
  executeUserPurge,
} from './purge/user-purge.service';
import { runAppointmentPurgeInteractive } from './purge/appointment-purge.service';
import { runSchedulePurgeInteractive } from './purge/schedule-purge.service';
import { runDoctorPurgeInteractive } from './purge/doctor-purge.service';

async function runMainMenu(): Promise<void> {
  const pool = createDbPool();
  const redisClient = await getRedisClient();
  const rl = readline.createInterface({ input, output });

  try {
    printHeader('SYSTEM DATA MANAGEMENT & PURGE RUNNER');
    console.log('Operating Environment : DEVELOPMENT');
    console.log(`Connected Database    : ${dbHost}:${dbPort} / ${dbName}`);
    console.log(`Connected Redis       : ${redisClient ? `${redisHost}:${redisPort} (READY)` : 'UNREACHABLE (SKIPPED)'}`);

    while (true) {
      printSection('Main Data Purge Menu');
      console.log('Select target domain:');
      console.log(' [1] User Purge (Inspect & delete user accounts + profiles)');
      console.log(' [2] Appointment Purge (Purge ALL appointments or by Patient/User)');
      console.log(' [3] Doctor Schedule Purge (Purge ALL schedules or by Doctor)');
      console.log(' [4] Doctor / Practitioner Purge (Purge ALL doctors or single Doctor profile)');
      console.log(' [q] Quit CLI\n');

      const choice = await askSafeQuestion(rl, 'Enter choice [1-4 or q]: ');
      if (!choice || choice.toLowerCase() === 'q' || choice.toLowerCase() === 'exit') {
        console.log('\n[INFO] Exiting CLI. No further actions taken.\n');
        break;
      }

      if (choice === '1') {
        await runUserPurgeInteractive(pool, redisClient, rl);
      } else if (choice === '2') {
        await runAppointmentPurgeInteractive(pool, redisClient, rl);
      } else if (choice === '3') {
        await runSchedulePurgeInteractive(pool, redisClient, rl);
      } else if (choice === '4') {
        await runDoctorPurgeInteractive(pool, redisClient, rl);
      } else {
        console.log('[WARN] Invalid choice. Please enter 1, 2, 3, 4, or q.');
      }
    }
  } finally {
    rl.close();
    await pool.end();
    if (redisClient) {
      await redisClient.quit();
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Amanah Healthcare - System Data Purge CLI

Usage:
  bun ./scripts/dev/purge-user.ts                     Launch interactive CLI mode
  bun ./scripts/dev/purge-user.ts --list              List all users
  bun ./scripts/dev/purge-user.ts --mobile            List mobile users only
  bun ./scripts/dev/purge-user.ts --email=<email>     Inspect & purge user by email
  bun ./scripts/dev/purge-user.ts --id=<uuid>         Inspect & purge user by UUID
  bun ./scripts/dev/purge-user.ts --appointments      Launch appointments purge menu
  bun ./scripts/dev/purge-user.ts --schedules         Launch schedules purge menu
  bun ./scripts/dev/purge-user.ts --doctors           Launch doctors purge menu

Options:
  --yes, -y       Skip confirmation prompt (for non-interactive batch runs)
  --help, -h      Show this help message
`);
    return;
  }

  const pool = createDbPool();
  const redisClient = await getRedisClient();

  try {
    if (args.includes('--list') || args.includes('-l')) {
      const users = await fetchAllUsers(pool);
      printHeader('USER DIRECTORY');
      renderUsersTable(users);
      return;
    }

    if (args.includes('--mobile') || args.includes('-m')) {
      const users = await fetchAllUsers(pool, { mobileOnly: true });
      printHeader('MOBILE USER DIRECTORY');
      renderUsersTable(users);
      return;
    }

    const emailArg = args.find((a) => a.startsWith('--email='))?.split('=')[1];
    const idArg = args.find((a) => a.startsWith('--id='))?.split('=')[1];
    const target = emailArg || idArg;

    if (target) {
      printHeader('TARGETED USER PURGE');
      const inspection = await inspectUserRecords(pool, target, redisClient);
      if (!inspection) {
        console.error(`[ERROR] User not found: ${target}`);
        process.exit(1);
      }
      renderInspectionResult(inspection);

      const skipConfirm = args.includes('--yes') || args.includes('-y');
      if (!skipConfirm) {
        const rl = readline.createInterface({ input, output });
        const confirm = (await rl.question('\nConfirm purge? [y/N]: ')).trim().toLowerCase();
        rl.close();
        if (confirm !== 'y') {
          console.log('[INFO] Purge aborted.');
          return;
        }
      }

      console.log('\n[INFO] Executing transactional purge...');
      const result = await executeUserPurge(pool, inspection, redisClient);
      if (result.success) {
        console.log(`[SUCCESS] Purged ${result.deletedRows} database rows for ${inspection.email}.`);
      } else {
        console.error(`[ERROR] Purge failed: ${result.error}`);
        process.exit(1);
      }
      return;
    }

    // Interactive menus
    if (args.includes('--appointments')) {
      const rl = readline.createInterface({ input, output });
      try {
        await runAppointmentPurgeInteractive(pool, redisClient, rl);
      } finally {
        rl.close();
      }
      return;
    }

    if (args.includes('--schedules')) {
      const rl = readline.createInterface({ input, output });
      try {
        await runSchedulePurgeInteractive(pool, redisClient, rl);
      } finally {
        rl.close();
      }
      return;
    }

    if (args.includes('--doctors')) {
      const rl = readline.createInterface({ input, output });
      try {
        await runDoctorPurgeInteractive(pool, redisClient, rl);
      } finally {
        rl.close();
      }
      return;
    }

    // Default: Run main menu
    await runMainMenu();
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
