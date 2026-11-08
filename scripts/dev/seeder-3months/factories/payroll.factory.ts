import type { PoolClient } from 'pg';
import type { DbContext, CreatedStaff } from '../types';
import { generate3PayrollPeriods } from '../core/calendar-timeline';

export async function seedPayroll(
  client: PoolClient,
  ctx: DbContext,
  staffList: CreatedStaff[]
): Promise<number> {
  const adminUser = staffList.find((s) => s.roleCode === 'admin')?.userId;
  const periods = generate3PayrollPeriods(new Date());
  let totalEntriesCreated = 0;

  for (const period of periods) {
    // 1. Insert payroll_periods
    const periodRes = await client.query(
      `
      INSERT INTO payroll_periods (
        period_name, period_start, period_end, status, total_payout,
        calculated_at, calculated_by, rule_version, notes, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, 0.00, $5, $6, 'v1.0', 'Kalkulasi payroll bulanan terverifikasi', NOW(), NOW())
      RETURNING id;
      `,
      [
        period.name,
        period.start,
        period.end,
        period.status,
        `${period.end} 17:00:00+07`,
        adminUser || null,
      ]
    );
    const periodId = periodRes.rows[0].id;

    let periodTotalPayout = 0;

    // 2. Insert entries for each staff
    for (const staff of staffList) {
      // Determine hourly rate and scheduled hours
      let hourlyRate = 32000;
      if (staff.roleCode.includes('doctor')) {
        hourlyRate = staff.roleCode.includes('specialist') ? 95000 : 75000;
      } else if (staff.roleCode.includes('midwife')) {
        hourlyRate = 45000;
      } else if (staff.roleCode.includes('nurse')) {
        hourlyRate = 38000;
      }

      const scheduledHours = 176.0; // 22 workdays * 8 hours
      const baseAmount = scheduledHours * hourlyRate;
      periodTotalPayout += baseAmount;

      // Entry 1: Base Scheduled
      await client.query(
        `
        INSERT INTO payroll_entries (
          payroll_period_id, staff_profile_id, practitioner_id, entry_type, source_type,
          quantity_hours, hourly_rate, amount, description, created_at
        )
        VALUES ($1, $2, $3, 'base_scheduled', 'roster', $4, $5, $6, $7, NOW());
        `,
        [
          periodId,
          staff.staffProfileId,
          staff.practitionerId || null,
          scheduledHours,
          hourlyRate,
          baseAmount,
          `Honorarium Jam Kerja Terjadwal (${scheduledHours} Jam)`,
        ]
      );
      totalEntriesCreated++;

      // Entry 2: Occasional replacement / overtime incentive for clinical staff
      if (staff.practitionerId && (staff.staffCode === 'STF-DOK-001' || staff.staffCode === 'STF-BID-001')) {
        const replacementHours = 8.0;
        const replacementAmount = replacementHours * hourlyRate * 1.25;
        periodTotalPayout += replacementAmount;

        await client.query(
          `
          INSERT INTO payroll_entries (
            payroll_period_id, staff_profile_id, practitioner_id, entry_type, source_type,
            quantity_hours, hourly_rate, amount, description, created_at
          )
          VALUES ($1, $2, $3, 'replacement_addition', 'replacement_claim', $4, $5, $6, $7, NOW());
          `,
          [
            periodId,
            staff.staffProfileId,
            staff.practitionerId,
            replacementHours,
            hourlyRate * 1.25,
            replacementAmount,
            `Insentif Shift Dinas Pengganti (${replacementHours} Jam)`,
          ]
        );
        totalEntriesCreated++;
      }
    }

    // 3. Update total_payout in payroll_periods
    await client.query(
      `
      UPDATE payroll_periods
      SET total_payout = $1
      WHERE id = $2;
      `,
      [periodTotalPayout, periodId]
    );
  }

  return totalEntriesCreated;
}
