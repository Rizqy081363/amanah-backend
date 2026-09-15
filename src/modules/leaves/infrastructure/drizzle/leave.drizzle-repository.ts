import { Injectable, Inject } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { LeaveRepository } from '../../domain/repositories/leave.repository';
import { LeaveEntity } from '../../domain/entities/leave.entity';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { staffLeaves } from '../../../../database/schema';

@Injectable()
export class LeaveDrizzleRepository implements LeaveRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async create(
    data: Omit<LeaveEntity, 'id' | 'status' | 'approvedBy' | 'approvalNotes' | 'createdAt' | 'updatedAt'>,
  ): Promise<LeaveEntity> {
    const [record] = await this.db
      .insert(staffLeaves)
      .values({
        staffId: data.staffId,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
        documentUrl: data.documentUrl || null,
        status: 'MENUNGGU_KONFIRMASI',
      })
      .returning();

    return record as unknown as LeaveEntity;
  }

  async findByStaffId(staffId: string): Promise<LeaveEntity[]> {
    const records = await this.db.query.staffLeaves.findMany({
      where: eq(staffLeaves.staffId, staffId),
      orderBy: [desc(staffLeaves.createdAt)],
    });

    return records as unknown as LeaveEntity[];
  }

  async findAllPending(): Promise<any[]> {
    return this.db.query.staffLeaves.findMany({
      where: eq(staffLeaves.status, 'MENUNGGU_KONFIRMASI'),
      with: {
        staff: true,
      },
      orderBy: [desc(staffLeaves.createdAt)],
    });
  }

  async updateStatus(
    id: string,
    status: 'DISETUJUI' | 'DITOLAK',
    approvedBy: number,
    approvalNotes?: string,
  ): Promise<LeaveEntity | null> {
    const [updated] = await this.db
      .update(staffLeaves)
      .set({
        status,
        approvedBy,
        approvalNotes: approvalNotes || null,
        updatedAt: new Date(),
      })
      .where(eq(staffLeaves.id, id))
      .returning();

    return (updated as unknown as LeaveEntity) || null;
  }
}
