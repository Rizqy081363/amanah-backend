#!/usr/bin/env bun
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
import { runAffiliationPurgeInteractive } from './purge/affiliation-purge.service';
import { runSchedulePurgeInteractive } from './purge/schedule-purge.service';
import { runDoctorPurgeInteractive } from './purge/doctor-purge.service';
import {
  runAttendancePurgeInteractive,
  executePurgeTodayAll,
  executePurgeTodayForStaff,
  resolveStaff,
} from './purge/attendance-purge.service';
import {
  runPayrollPurgeInteractive,
  executePurgeAllPayrollPeriodsAndEntries,
} from './purge/payroll-purge.service';
import {
  runLeavePurgeInteractive,
  executePurgeAllLeaves,
} from './purge/leave-purge.service';
import {
  runReplacementPurgeInteractive,
  executePurgeAllReplacements,
} from './purge/replacement-purge.service';
import {
  runNuclearResetInteractive,
  executeNuclearDevReset,
} from './purge/dev-reset-purge.service';

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
      console.log(' [2] Appointment Purge (Purge ALL appointments, by User account, or by Patient)');
      console.log(' [3] Patient Affiliation Purge (Inspect & purge affiliations by User, or 100% flush)');
      console.log(' [4] Doctor Schedule Purge (Purge ALL schedules or by Doctor)');
      console.log(' [5] Doctor / Practitioner Purge (Purge ALL doctors or single Doctor profile)');
      console.log(' [6] Attendance Purge (Flush today\'s attendance, by Staff/Doctor, or 100% flush)');
      console.log(' [7] Payroll Purge (Flush entries, periods, or staff payroll)');
      console.log(' [8] Leave / Cuti Purge (Flush all leaves, today leaves, or staff leaves)');
      console.log(' [9] Replacement Purge (Flush replacement opportunities & reset attendance links)');
      console.log(' [10] Nuclear Dev Reset (Cascade flush Attendance + Leave + Replacement + Payroll)');
      console.log(' [q] Quit CLI\n');

      const choice = await askSafeQuestion(rl, 'Enter choice [1-10 or q]: ');
      if (!choice || choice.toLowerCase() === 'q' || choice.toLowerCase() === 'exit') {
        console.log('\n[INFO] Exiting CLI. No further actions taken.\n');
        break;
      }

      if (choice === '1') {
        await runUserPurgeInteractive(pool, redisClient, rl);
      } else if (choice === '2') {
        await runAppointmentPurgeInteractive(pool, redisClient, rl);
      } else if (choice === '3') {
        await runAffiliationPurgeInteractive(pool, redisClient, rl);
      } else if (choice === '4') {
        await runSchedulePurgeInteractive(pool, redisClient, rl);
      } else if (choice === '5') {
        await runDoctorPurgeInteractive(pool, redisClient, rl);
      } else if (choice === '6') {
        await runAttendancePurgeInteractive(pool, redisClient, rl);
      } else if (choice === '7') {
        await runPayrollPurgeInteractive(pool, redisClient, rl);
      } else if (choice === '8') {
        await runLeavePurgeInteractive(pool, redisClient, rl);
      } else if (choice === '9') {
        await runReplacementPurgeInteractive(pool, redisClient, rl);
      } else if (choice === '10') {
        await runNuclearResetInteractive(pool, redisClient, rl);
      } else {
        console.log('[WARN] Invalid choice. Please enter 1-10 or q.');
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
  bun ./scripts/dev/purge-user.ts --affiliations      Launch patient affiliations purge menu
  bun ./scripts/dev/purge-user.ts --schedules         Launch schedules purge menu
  bun ./scripts/dev/purge-user.ts --doctors           Launch doctors purge menu
  bun ./scripts/dev/purge-user.ts --attendance        Launch attendance purge menu
  bun ./scripts/dev/purge-user.ts --attendance-today  Flush all today's attendance records
  bun ./scripts/dev/purge-user.ts --attendance-user=<email_or_uuid> Flush attendance for staff
  bun ./scripts/dev/purge-user.ts --payroll           Launch payroll purge menu
  bun ./scripts/dev/purge-user.ts --payroll-flush-all 100% Flush all payroll periods and entries
  bun ./scripts/dev/purge-user.ts --leave             Launch leave/cuti purge menu
  bun ./scripts/dev/purge-user.ts --leave-flush-all   100% Flush all leave requests and cascaded deductions
  bun ./scripts/dev/purge-user.ts --replacement       Launch replacement purge menu
  bun ./scripts/dev/purge-user.ts --replacement-flush-all 100% Flush all replacement opportunities
  bun ./scripts/dev/purge-user.ts --nuclear-reset     100% Flush attendance, leaves, replacements, and payroll

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

    if (args.includes('--appointments')) {
      const rl = readline.createInterface({ input, output });
      try {
        await runAppointmentPurgeInteractive(pool, redisClient, rl);
      } finally {
        rl.close();
      }
      return;
    }

    if (args.includes('--affiliations')) {
      const rl = readline.createInterface({ input, output });
      try {
        await runAffiliationPurgeInteractive(pool, redisClient, rl);
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

    if (args.includes('--attendance')) {
      const rl = readline.createInterface({ input, output });
      try {
        await runAttendancePurgeInteractive(pool, redisClient, rl);
      } finally {
        rl.close();
      }
      return;
    }

    if (args.includes('--attendance-today')) {
      const skipConfirm = args.includes('--yes') || args.includes('-y');
      if (!skipConfirm) {
        const rl = readline.createInterface({ input, output });
        const confirm = (await rl.question('\nFlush ALL today\'s attendance records (CURRENT_DATE)? [y/N]: ')).trim().toLowerCase();
        rl.close();
        if (confirm !== 'y') {
          console.log('[INFO] Purge aborted.');
          return;
        }
      }
      console.log('\n[INFO] Flushing all attendance records for today...');
      const res = await executePurgeTodayAll(pool, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} attendance record(s) for today.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
        process.exit(1);
      }
      return;
    }

    const attendanceUserArg = args.find((a) => a.startsWith('--attendance-user='))?.split('=')[1];
    if (attendanceUserArg) {
      const staff = await resolveStaff(pool, attendanceUserArg);
      if (!staff) {
        console.error(`[ERROR] Staff not found: ${attendanceUserArg}`);
        process.exit(1);
      }
      const skipConfirm = args.includes('--yes') || args.includes('-y');
      if (!skipConfirm) {
        const rl = readline.createInterface({ input, output });
        const confirm = (await rl.question(`\nFlush today's attendance for ${staff.fullName} (${staff.email})? [y/N]: `)).trim().toLowerCase();
        rl.close();
        if (confirm !== 'y') {
          console.log('[INFO] Purge aborted.');
          return;
        }
      }
      console.log(`\n[INFO] Flushing today's attendance for ${staff.fullName}...`);
      const res = await executePurgeTodayForStaff(pool, staff.staffProfileId, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} attendance record(s) for ${staff.fullName}.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
        process.exit(1);
      }
      return;
    }

    if (args.includes('--payroll')) {
      const rl = readline.createInterface({ input, output });
      try {
        await runPayrollPurgeInteractive(pool, redisClient, rl);
      } finally {
        rl.close();
      }
      return;
    }

    if (args.includes('--payroll-flush-all')) {
      const skipConfirm = args.includes('--yes') || args.includes('-y');
      if (!skipConfirm) {
        const rl = readline.createInterface({ input, output });
        const confirm = (await rl.question('\nFlush ALL payroll periods & entries? [y/N]: ')).trim().toLowerCase();
        rl.close();
        if (confirm !== 'y') {
          console.log('[INFO] Purge aborted.');
          return;
        }
      }
      console.log('\n[INFO] Flushing all payroll periods & entries...');
      const res = await executePurgeAllPayrollPeriodsAndEntries(pool, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} payroll period(s) and all cascaded entries.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
        process.exit(1);
      }
      return;
    }

    if (args.includes('--leave')) {
      const rl = readline.createInterface({ input, output });
      try {
        await runLeavePurgeInteractive(pool, redisClient, rl);
      } finally {
        rl.close();
      }
      return;
    }

    if (args.includes('--leave-flush-all')) {
      const skipConfirm = args.includes('--yes') || args.includes('-y');
      if (!skipConfirm) {
        const rl = readline.createInterface({ input, output });
        const confirm = (await rl.question('\nFlush ALL staff leave requests & cascaded deductions? [y/N]: ')).trim().toLowerCase();
        rl.close();
        if (confirm !== 'y') {
          console.log('[INFO] Purge aborted.');
          return;
        }
      }
      console.log('\n[INFO] Flushing all staff leave requests...');
      const res = await executePurgeAllLeaves(pool, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} leave request(s).`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
        process.exit(1);
      }
      return;
    }

    if (args.includes('--replacement')) {
      const rl = readline.createInterface({ input, output });
      try {
        await runReplacementPurgeInteractive(pool, redisClient, rl);
      } finally {
        rl.close();
      }
      return;
    }

    if (args.includes('--replacement-flush-all')) {
      const skipConfirm = args.includes('--yes') || args.includes('-y');
      if (!skipConfirm) {
        const rl = readline.createInterface({ input, output });
        const confirm = (await rl.question('\nFlush ALL replacement opportunities? [y/N]: ')).trim().toLowerCase();
        rl.close();
        if (confirm !== 'y') {
          console.log('[INFO] Purge aborted.');
          return;
        }
      }
      console.log('\n[INFO] Flushing all replacement opportunities...');
      const res = await executePurgeAllReplacements(pool, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Purged ${res.deletedCount} replacement opportunity/opportunities.`);
      } else {
        console.error(`[ERROR] Purge failed: ${res.error}`);
        process.exit(1);
      }
      return;
    }

    if (args.includes('--nuclear-reset')) {
      const skipConfirm = args.includes('--yes') || args.includes('-y');
      if (!skipConfirm) {
        const rl = readline.createInterface({ input, output });
        const confirm = (await rl.question('\nExecute NUCLEAR DEV RESET (flush attendance, leaves, replacements, payroll)? [y/N]: ')).trim().toLowerCase();
        rl.close();
        if (confirm !== 'y') {
          console.log('[INFO] Nuclear reset aborted.');
          return;
        }
      }
      console.log('\n[INFO] Executing transactional nuclear reset...');
      const res = await executeNuclearDevReset(pool, redisClient);
      if (res.success) {
        console.log(`[SUCCESS] Nuclear Dev Reset completed!`);
        console.log(` - Attendance Records Purged : ${res.purgedCounts.attendance}`);
        console.log(` - QR Kiosk Sessions Purged  : ${res.purgedCounts.qrSessions}`);
        console.log(` - Leave Requests Purged     : ${res.purgedCounts.leaves}`);
        console.log(` - Replacements Purged       : ${res.purgedCounts.replacements}`);
        console.log(` - Payroll Periods Purged    : ${res.purgedCounts.payrollPeriods}`);
        console.log(` - Payroll Entries Purged    : ${res.purgedCounts.payrollEntries}`);
      } else {
        console.error(`[ERROR] Nuclear reset failed: ${res.error}`);
        process.exit(1);
      }
      return;
    }

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
