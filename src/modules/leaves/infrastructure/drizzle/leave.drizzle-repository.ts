import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { staffLeaveRequests, staffProfiles } from '../../../../database/schema';
import { LeaveEntity } from '../../domain/entities/leave.entity';
import { LeaveRepository } from '../../domain/repositories/leave.repository';

@Injectable()
export class LeaveDrizzleRepository implements LeaveRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapRecordToEntity(r: any): LeaveEntity {
    const statusName =
      r.status === 'approved'
        ? 'DISETUJUI'
        : r.status === 'rejected'
          ? 'DITOLAK'
          : 'MENUNGGU_KONFIRMASI';

    return {
      id: r.id,
      staffId: r.staffProfileId,
      startDate: r.startDate,
      endDate: r.endDate,
      reason: r.reason,
      documentUrl: null,
      status: statusName,
      approvedBy: r.reviewedBy || null,
      approvalNotes: r.reviewerNotes || null,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async create(
    data: Omit<
      LeaveEntity,
      | 'id'
      | 'status'
      | 'approvedBy'
      | 'approvalNotes'
      | 'createdAt'
      | 'updatedAt'
    >,
  ): Promise<LeaveEntity> {
    const start = new Date(data.startDate).getTime();
    const end = new Date(data.endDate).getTime();
    const durationDays = Math.max(
      1,
      Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1,
    );

    const [record] = await this.db
      .insert(staffLeaveRequests)
      .values({
        staffProfileId: data.staffId,
        requestType: 'other',
        startDate: data.startDate,
        endDate: data.endDate,
        durationDays,
        reason: data.reason,
        status: 'pending',
      })
      .returning();

    return this.mapRecordToEntity(record);
  }

  async findByStaffId(staffId: string): Promise<LeaveEntity[]> {
    const records = await this.db.query.staffLeaveRequests.findMany({
      where: eq(staffLeaveRequests.staffProfileId, staffId),
      orderBy: [desc(staffLeaveRequests.createdAt)],
    });

    return records.map((r) => this.mapRecordToEntity(r));
  }

  async findAllPending(): Promise<any[]> {
    const records = await this.db.query.staffLeaveRequests.findMany({
      where: eq(staffLeaveRequests.status, 'pending'),
      with: {
        staffProfile: true,
      },
      orderBy: [desc(staffLeaveRequests.createdAt)],
    });

    return records.map((r) => ({
      ...this.mapRecordToEntity(r),
      staff: r.staffProfile
        ? {
            id: r.staffProfile.id,
            fullName: r.staffProfile.fullName,
            profession: r.staffProfile.positionTitle,
            idCardNumber: r.staffProfile.staffCode,
          }
        : null,
    }));
  }

  async updateStatus(
    id: string,
    status: 'DISETUJUI' | 'DITOLAK',
    approvedBy: string,
    approvalNotes?: string,
  ): Promise<LeaveEntity | null> {
    const dbStatus = status === 'DISETUJUI' ? 'approved' : 'rejected';

    const [updated] = await this.db
      .update(staffLeaveRequests)
      .set({
        status: dbStatus,
        reviewedBy: approvedBy || null,
        reviewerNotes: approvalNotes || null,
        reviewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(staffLeaveRequests.id, id))
      .returning();

    return updated ? this.mapRecordToEntity(updated) : null;
  }
}
