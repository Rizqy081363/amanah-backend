import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { staffLeaveRequests } from '../../../../database/schema';
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
          : r.status === 'cancelled'
            ? 'DIBATALKAN'
            : 'MENUNGGU_KONFIRMASI';

    return {
      id: r.id,
      staffId: r.staffProfileId,
      startDate: r.startDate,
      endDate: r.endDate,
      reason: r.reason,
      type: r.requestType,
      substituteStaffId: r.substitutePractitionerId || null,
      documentUrl: null,
      status: statusName,
      approvedBy: r.reviewedBy || null,
      approvalNotes: r.reviewerNotes || null,
      cancelledAt: r.cancelledAt ? new Date(r.cancelledAt) : null,
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
      | 'cancelledAt'
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

    let reqType: any = 'other';
    if (data.type) {
      const lower = data.type.toLowerCase();
      if (lower.includes('annual') || lower.includes('tahunan')) {
        reqType = 'annual_leave';
      } else if (lower.includes('sick') || lower.includes('sakit')) {
        reqType = 'sick_leave';
      } else if (lower.includes('seminar')) {
        reqType = 'seminar_symposium';
      } else if (lower.includes('family') || lower.includes('keluarga')) {
        reqType = 'family_matter';
      } else if (lower.includes('external') || lower.includes('tugas')) {
        reqType = 'external_assignment';
      } else {
        reqType = 'other';
      }
    }

    const [record] = await this.db
      .insert(staffLeaveRequests)
      .values({
        staffProfileId: data.staffId,
        requestType: reqType,
        startDate: data.startDate,
        endDate: data.endDate,
        durationDays,
        reason: data.reason,
        substitutePractitionerId: data.substituteStaffId || null,
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

  async findById(id: string): Promise<LeaveEntity | null> {
    const records = await this.db.query.staffLeaveRequests.findMany({
      where: eq(staffLeaveRequests.id, id),
      limit: 1,
    });
    if (!records.length) return null;
    return this.mapRecordToEntity(records[0]);
  }

  async cancel(id: string, staffId: string): Promise<LeaveEntity | null> {
    const records = await this.db.query.staffLeaveRequests.findMany({
      where: eq(staffLeaveRequests.id, id),
      limit: 1,
    });

    if (!records.length) {
      return null;
    }

    const record = records[0];
    if (record.staffProfileId !== staffId) {
      throw new ForbiddenException(
        'Anda tidak memiliki izin membatalkan pengajuan cuti ini',
      );
    }

    if (record.status !== 'pending') {
      throw new BadRequestException(
        'Hanya pengajuan cuti berstatus pending yang dapat dibatalkan',
      );
    }

    const [updated] = await this.db
      .update(staffLeaveRequests)
      .set({
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(staffLeaveRequests.id, id))
      .returning();

    return updated ? this.mapRecordToEntity(updated) : null;
  }
}
