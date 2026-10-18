import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
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
  ) {}

  private mapLeavePolicy(r: any): LeavePolicyEntity {
    return {
      id: r.id,
      approvalRequired: Boolean(r.approvalRequired),
      limitMode: r.limitMode,
      monthlyLimit: Number(r.monthlyLimit),
      quotaCountingPolicy: r.quotaCountingPolicy,
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
      category: r.category,
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
      >
    >,
    updatedBy: string,
  ): Promise<LeavePolicyEntity> {
    const current = await this.getActiveLeavePolicy();

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
        updatedBy: updatedBy || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(leavePolicies.id, current.id))
      .returning();

    return this.mapLeavePolicy(updated);
  }

  async getActiveCompensationRates(): Promise<CompensationRateEntity[]> {
    const records = await this.db
      .select()
      .from(compensationRates)
      .where(eq(compensationRates.isActive, true))
      .orderBy(compensationRates.category);

    return records.map((r) => this.mapCompensationRate(r));
  }

  async updateCompensationRates(
    rates: Array<{
      category: 'doctor' | 'midwife' | 'worker';
      hourlyRate: number;
      overtimeHourlyRate: number;
      notes?: string;
    }>,
    updatedBy: string,
  ): Promise<CompensationRateEntity[]> {
    for (const rate of rates) {
      const [existing] = await this.db
        .select({ id: compensationRates.id })
        .from(compensationRates)
        .where(
          and(
            eq(compensationRates.category, rate.category),
            eq(compensationRates.isActive, true),
          ),
        )
        .limit(1);

      if (existing) {
        await this.db
          .update(compensationRates)
          .set({
            hourlyRate: rate.hourlyRate.toString(),
            overtimeHourlyRate: rate.overtimeHourlyRate.toString(),
            notes: rate.notes || null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(compensationRates.id, existing.id));
      } else {
        await this.db.insert(compensationRates).values({
          category: rate.category,
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
}
