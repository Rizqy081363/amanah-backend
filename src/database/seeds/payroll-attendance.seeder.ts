import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as tables from '../schema/amanah.schema';
import * as relations from '../schema/amanah.relations';
import * as leaveTables from '../schema/leave-payroll.schema';
import * as leaveRelations from '../schema/leave-payroll.relations';
import * as queueTables from '../schema/queue-ticketing.schema';
import * as queueRelations from '../schema/queue-ticketing.relations';
import { PayrollAttendanceFactory } from './factories/payroll-attendance.factory';

const DEFAULT_POSTGRES_PORT = 5433;

function getDatabaseConfig() {
  const host = process.env.DATABASE_HOST || 'localhost';
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const port = parseInt(
    isLocal
      ? process.env.POSTGRES_HOST_PORT ||
          process.env.DATABASE_PORT ||
          String(DEFAULT_POSTGRES_PORT)
      : process.env.DATABASE_PORT || '5432',
    10,
  );
  const user = process.env.DATABASE_USERNAME || 'amanah';
  const password = process.env.DATABASE_PASSWORD || 'amanah_secret';
  const database = process.env.DATABASE_NAME || 'amanah_healthcare';

  return { host, port, user, password, database };
}

async function runPayrollAttendanceSeeder() {
  const dbConfig = getDatabaseConfig();
  console.log(`\n================================================================`);
  console.log(` PAYROLL & ATTENDANCE DOMAIN ENGINE SEEDER`);
  console.log(` Target: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  console.log(`================================================================\n`);

  const pool = new Pool(dbConfig);
  const db = drizzle(pool, {
    schema: {
      ...tables,
      ...relations,
      ...leaveTables,
      ...leaveRelations,
      ...queueTables,
      ...queueRelations,
    },
  });

  try {
    const factory = new PayrollAttendanceFactory(db as any);
    await factory.init();

    console.log(`\n--- [Step 1/5] Cleaning Obsolete Test Periods ---`);
    await db.delete(leaveTables.payrollPeriods);
    console.log(`  ✓ Cleared legacy payroll periods and cascaded entries.`);

    console.log(`\n--- [Step 2/5] Ensuring Rosters & Doctor Assignments ---`);
    await factory.ensureRostersAndAssignments();

    console.log(`\n--- [Step 3/5] Orchestrating Leave & Attendance Scenarios ---`);
    const leaveDay = `2026-10-07`;
    const { opportunityId } = await factory.orchestrateLeaveAndReplacement(leaveDay);

    await factory.orchestrateAttendanceRecords({
      regularDate: '2026-10-05',
      lateDate: '2026-10-06',
      replacementDate: leaveDay,
      opportunityId,
    });

    console.log(`  Orchestrating dr. Rizqy Wahyu 59 scenarios for September (Leave + Replacement)...`);
    await factory.orchestrateRizqySeptemberScenarios();

    await factory.orchestrateFullMonthlyAttendance();

    console.log(`\n--- [Step 4/5] Executing 3-Month Payroll Calculation Engine ---`);

    // 1. Agustus 2026 (Finalized)
    console.log(`\n [Month 1/3] Processing Agustus 2026...`);
    const augResult = await factory.orchestratePayrollCalculation(
      '2026-08-01',
      '2026-08-31',
      'Payroll Periode Agustus 2026',
    );
    await factory.finalizePeriod(augResult.period.id);
    console.log(`  ✓ Finalized Agustus 2026 (ID: ${augResult.period.id})`);

    // 2. September 2026 (Finalized, includes dr. Rizqy leaves & replacements)
    console.log(`\n [Month 2/3] Processing September 2026...`);
    const septResult = await factory.orchestratePayrollCalculation(
      '2026-09-01',
      '2026-09-30',
      'Payroll Periode September 2026',
    );
    await factory.finalizePeriod(septResult.period.id);
    console.log(`  ✓ Finalized September 2026 (ID: ${septResult.period.id})`);

    // 3. Oktober 2026 (Calculated / Active Ongoing Period)
    console.log(`\n [Month 3/3] Processing Oktober 2026 (Periode Berjalan)...`);
    const octResult = await factory.orchestratePayrollCalculation(
      '2026-10-01',
      '2026-10-31',
      'Payroll Periode Oktober 2026',
    );
    console.log(`  ✓ Calculated Oktober 2026 (ID: ${octResult.period.id}, status: calculated)`);

    console.log(`\n================================================================`);
    console.log(` SEEDING & 3-MONTH ENGINE ORCHESTRATION COMPLETED SUCCESSFULLY!`);
    console.log(`================================================================`);
    console.log(` Period 1 (Finalized) : ${augResult.period.periodName} (${augResult.period.periodStart} s/d ${augResult.period.periodEnd})`);
    console.log(` Period 2 (Finalized) : ${septResult.period.periodName} (${septResult.period.periodStart} s/d ${septResult.period.periodEnd})`);
    console.log(` Period 3 (Ongoing)   : ${octResult.period.periodName} (${octResult.period.periodStart} s/d ${octResult.period.periodEnd})\n`);

    const rizqySummarySept = septResult.summaries.find(
      (s: any) => s.email === 'rizqywahyu59@gmail.com',
    );
    if (rizqySummarySept) {
      console.log(`Sample dr. Rizqy Wahyu 59 (September 2026):`);
      console.log(` • Base Scheduled  : Rp ${rizqySummarySept.baseEarnings.toLocaleString('id-ID')} (${rizqySummarySept.baseHours} hrs)`);
      console.log(` • Leave Deductions: Rp ${rizqySummarySept.leaveDeductions.toLocaleString('id-ID')} (${rizqySummarySept.deductionHours || 0} hrs)`);
      console.log(` • Replacements    : Rp ${rizqySummarySept.replacementAdditions.toLocaleString('id-ID')} (${rizqySummarySept.additionHours || 0} hrs)`);
      console.log(` = NET PAYOUT (THP): Rp ${rizqySummarySept.netPayroll.toLocaleString('id-ID')}`);
      console.log(` • Entries Count   : ${rizqySummarySept.entries.length} items`);
    }

  } catch (error) {
    console.error('\n[FATAL ERROR] Seeder failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runPayrollAttendanceSeeder();
