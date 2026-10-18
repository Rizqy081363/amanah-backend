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

    const today = new Date();
    // Default period: Current Month (01 to last day of month)
    const year = today.getFullYear();
    const month = today.getMonth();
    const pad = (n: number) => n.toString().padStart(2, '0');

    const periodStart = `${year}-${pad(month + 1)}-01`;
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const periodEnd = `${year}-${pad(month + 1)}-${pad(lastDayOfMonth)}`;

    console.log(`\n--- [Step 1/4] Ensuring Rosters & Doctor Assignments ---`);
    await factory.ensureRostersAndAssignments();

    console.log(`\n--- [Step 2/4] Orchestrating Leave & Replacement Opportunities ---`);
    const leaveDay = `${year}-${pad(month + 1)}-07`;
    const { leaveId, opportunityId } = await factory.orchestrateLeaveAndReplacement(leaveDay);

    console.log(`\n--- [Step 3/4] Orchestrating Realistic Attendance Scenarios ---`);
    const regularDate = `${year}-${pad(month + 1)}-05`;
    const lateDate = `${year}-${pad(month + 1)}-06`;
    await factory.orchestrateAttendanceRecords({
      regularDate,
      lateDate,
      replacementDate: leaveDay,
      opportunityId,
    });

    console.log(`\n--- [Step 4/4] Executing Payroll Calculation Engine ---`);
    const { period, summaries } = await factory.orchestratePayrollCalculation(
      periodStart,
      periodEnd,
      `Payroll Periode ${periodStart} - ${periodEnd}`,
    );

    console.log(`\n================================================================`);
    console.log(` SEEDING & ENGINE ORCHESTRATION COMPLETED SUCCESSFULLY!`);
    console.log(`================================================================`);
    console.log(` Period ID    : ${period.id}`);
    console.log(` Period Name  : ${period.periodName}`);
    console.log(` Dates        : ${period.periodStart} s/d ${period.periodEnd}`);
    console.log(` Status       : ${period.status}`);
    console.log(` Total Payout : Rp ${Number(period.totalPayout).toLocaleString('id-ID')}`);
    console.log(` Summaries    : ${summaries.length} active employees computed\n`);

    console.log(`Sample Calculated Payroll Line Items:`);
    for (const s of summaries.slice(0, 3)) {
      console.log(` • [${s.staffType.toUpperCase()}] ${s.fullName}:`);
      console.log(`     - Base Scheduled  : Rp ${s.baseEarnings.toLocaleString('id-ID')} (${s.baseHours} hrs)`);
      console.log(`     - Leave Deductions: Rp ${s.leaveDeductions.toLocaleString('id-ID')}`);
      console.log(`     - Replacements    : Rp ${s.replacementAdditions.toLocaleString('id-ID')}`);
      console.log(`     = NET PAYOUT (THP): Rp ${s.netPayroll.toLocaleString('id-ID')}`);
      console.log(`     - Auditable Items : ${s.entries.length} payroll_entries`);
    }

  } catch (error) {
    console.error('\n[FATAL ERROR] Seeder failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runPayrollAttendanceSeeder();
