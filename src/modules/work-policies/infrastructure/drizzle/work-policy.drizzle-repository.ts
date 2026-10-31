import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, not } from 'drizzle-orm';
import { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { clinicSettings } from '../../../../database/schema';
import {
  compensationRates,
  leavePolicies,
} from '../../../../database/schema/leave-payroll.schema';
import { CompensationRateEntity } from '../../domain/entities/compensation-rate.entity';
import { LeavePolicyEntity } from '../../domain/entities/leave-policy.entity';
import { WorkPolicyRepository } from '../../domain/repositories/work-policy.repository';

@Injectable()
export class WorkPolicyDrizzleRepository implements WorkPolicyRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly clinicConfigService: ClinicConfigService,
  ) {}

  private mapLeavePolicy(r: any): LeavePolicyEntity {
    return {
      id: r.id,
      approvalRequired: Boolean(r.approvalRequired),
      limitMode: r.limitMode,
      monthlyLimit: Number(r.monthlyLimit),
      quotaCountingPolicy: r.quotaCountingPolicy,
      periodPolicy: r.periodPolicy || 'non_overlapping',
      isActive: Boolean(r.isActive),
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo || null,
      updatedBy: r.updatedBy || null,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  private mapCompensationRate(r: any): CompensationRateEntity {
    return {
      id: r.id,
      roleId: r.roleId,
      roleCode: r.role?.code || null,
      roleName: r.role?.name || null,
      roleTier: r.role?.tier || null,
      roleIsClinical: r.role?.isClinical ?? null,
      hourlyRate: Number(r.hourlyRate),
      overtimeHourlyRate: Number(r.overtimeHourlyRate),
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo || null,
      isActive: Boolean(r.isActive),
      notes: r.notes || null,
      createdBy: r.createdBy || null,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async getActiveLeavePolicy(): Promise<LeavePolicyEntity> {
    const [policy] = await this.db
      .select()
      .from(leavePolicies)
      .where(eq(leavePolicies.isActive, true))
      .orderBy(desc(leavePolicies.effectiveFrom))
      .limit(1);

    if (!policy) {
      // Default fallback if table was cleared
      const [inserted] = await this.db
        .insert(leavePolicies)
        .values({
          approvalRequired: true,
          limitMode: 'monthly_limit',
          monthlyLimit: 3,
          quotaCountingPolicy: 'per_request',
          isActive: true,
        })
        .returning();
      return this.mapLeavePolicy(inserted);
    }

    return this.mapLeavePolicy(policy);
  }

  async updateLeavePolicy(
    data: Partial<
      Pick<
        LeavePolicyEntity,
        | 'approvalRequired'
        | 'limitMode'
        | 'monthlyLimit'
        | 'quotaCountingPolicy'
        | 'periodPolicy'
      >
    >,
    updatedBy: string,
  ): Promise<LeavePolicyEntity> {
    const current = await this.getActiveLeavePolicy();
    const periodPolicy = data.periodPolicy ?? current.periodPolicy;
    const now = new Date().toISOString();

    const [updated] = await this.db
      .update(leavePolicies)
      .set({
        approvalRequired:
          data.approvalRequired !== undefined
            ? data.approvalRequired
            : current.approvalRequired,
        limitMode: data.limitMode ?? current.limitMode,
        monthlyLimit:
          data.monthlyLimit !== undefined
            ? data.monthlyLimit
            : current.monthlyLimit,
        quotaCountingPolicy:
          data.quotaCountingPolicy ?? current.quotaCountingPolicy,
        periodPolicy,
        updatedBy: updatedBy || null,
        updatedAt: now,
      })
      .where(eq(leavePolicies.id, current.id))
      .returning();

    // Mirror to clinic_setting for unified configuration access
    await this.db
      .insert(clinicSettings)
      .values({
        key: 'leave.period_policy',
        scopeType: 'global',
        value: periodPolicy,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: clinicSettings.key,
        set: {
          value: periodPolicy,
          updatedAt: now,
        },
      });

    this.clinicConfigService.invalidateCache();

    return this.mapLeavePolicy(updated);
  }

  async getActiveCompensationRates(): Promise<CompensationRateEntity[]> {
    const records = await this.db.query.compensationRates.findMany({
      where: eq(compensationRates.isActive, true),
      with: {
        role: true,
      },
    });

    return records.map((r) => this.mapCompensationRate(r));
  }

  async updateCompensationRates(
    rates: Array<{
      roleId: string;
      hourlyRate: number;
      overtimeHourlyRate: number;
      notes?: string;
    }>,
    updatedBy: string,
  ): Promise<CompensationRateEntity[]> {
    const incomingRoleIds = new Set(rates.map((r) => r.roleId));
    const now = new Date().toISOString();

    // 1. Deactivate any active rates that were removed from the incoming configuration
    if (incomingRoleIds.size > 0) {
      await this.db
        .update(compensationRates)
        .set({
          isActive: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(compensationRates.isActive, true),
            not(inArray(compensationRates.roleId, Array.from(incomingRoleIds))),
          ),
        );
    } else {
      await this.db
        .update(compensationRates)
        .set({
          isActive: false,
          updatedAt: now,
        })
        .where(eq(compensationRates.isActive, true));
    }

    // 2. Upsert active rates
    for (const rate of rates) {
      const [existing] = await this.db
        .select({ id: compensationRates.id })
        .from(compensationRates)
        .where(eq(compensationRates.roleId, rate.roleId))
        .limit(1);

      if (existing) {
        await this.db
          .update(compensationRates)
          .set({
            hourlyRate: rate.hourlyRate.toString(),
            overtimeHourlyRate: rate.overtimeHourlyRate.toString(),
            notes: rate.notes || null,
            isActive: true,
            updatedAt: now,
          })
          .where(eq(compensationRates.id, existing.id));
      } else {
        await this.db.insert(compensationRates).values({
          roleId: rate.roleId,
          hourlyRate: rate.hourlyRate.toString(),
          overtimeHourlyRate: rate.overtimeHourlyRate.toString(),
          notes: rate.notes || null,
          createdBy: updatedBy || null,
          isActive: true,
        });
      }
    }

    return this.getActiveCompensationRates();
  }

  async getAttendanceTiming(): Promise<{
    minBillableShiftMinutes: number;
    roundingIncrementMinutes: number;
  }> {
    const config = await this.clinicConfigService.getAttendanceConfig();
    return {
      minBillableShiftMinutes: config.minBillableShiftMinutes,
      roundingIncrementMinutes: config.roundingIncrementMinutes,
    };
  }

  async updateAttendanceTiming(
    data: {
      minBillableShiftMinutes: number;
      roundingIncrementMinutes: number;
    },
    _updatedBy: string,
  ): Promise<{
    minBillableShiftMinutes: number;
    roundingIncrementMinutes: number;
  }> {
    const now = new Date().toISOString();

    await this.db
      .insert(clinicSettings)
      .values({
        key: 'attendance.min_billable_shift_minutes',
        scopeType: 'global',
        value: data.minBillableShiftMinutes,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: clinicSettings.key,
        set: {
          value: data.minBillableShiftMinutes,
          updatedAt: now,
        },
      });

    await this.db
      .insert(clinicSettings)
      .values({
        key: 'attendance.rounding_increment_minutes',
        scopeType: 'global',
        value: data.roundingIncrementMinutes,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: clinicSettings.key,
        set: {
          value: data.roundingIncrementMinutes,
          updatedAt: now,
        },
      });

    this.clinicConfigService.invalidateCache();

    return {
      minBillableShiftMinutes: data.minBillableShiftMinutes,
      roundingIncrementMinutes: data.roundingIncrementMinutes,
    };
  }
}
