import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { ScheduleRepository } from '../../domain/repositories/schedule.repository';
import { ScheduleEntity } from '../../domain/entities/schedule.entity';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { staffSchedules, staffs } from '../../../../database/schema';

@Injectable()
export class ScheduleDrizzleRepository implements ScheduleRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async create(
    data: Omit<ScheduleEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ScheduleEntity> {
    const [record] = await this.db
      .insert(staffSchedules)
      .values({
        staffId: data.staffId,
        dayOfWeek: data.dayOfWeek ?? null,
        specificDate: data.specificDate ?? null,
        session: data.session,
        isAvailable: data.isAvailable ?? true,
        notes: data.notes ?? null,
      })
      .returning();

    return record as unknown as ScheduleEntity;
  }

  async findByStaffId(staffId: string): Promise<ScheduleEntity[]> {
    const records = await this.db.query.staffSchedules.findMany({
      where: eq(staffSchedules.staffId, staffId),
    });

    return records as unknown as ScheduleEntity[];
  }

  async findByPoliAndDate(poliklinikId: string, date: string): Promise<any[]> {
    return this.db
      .select({
        id: staffSchedules.id,
        staffId: staffSchedules.staffId,
        staffName: staffs.fullName,
        profession: staffs.profession,
        dayOfWeek: staffSchedules.dayOfWeek,
        specificDate: staffSchedules.specificDate,
        session: staffSchedules.session,
        isAvailable: staffSchedules.isAvailable,
        notes: staffSchedules.notes,
      })
      .from(staffSchedules)
      .innerJoin(staffs, eq(staffSchedules.staffId, staffs.id))
      .where(
        and(
          eq(staffs.poliklinikId, poliklinikId),
          eq(staffSchedules.isAvailable, true),
        ),
      );
  }

  async toggleAvailability(
    id: string,
    isAvailable: boolean,
  ): Promise<ScheduleEntity | null> {
    const [record] = await this.db
      .update(staffSchedules)
      .set({
        isAvailable,
        updatedAt: new Date(),
      })
      .where(eq(staffSchedules.id, id))
      .returning();

    return (record as unknown as ScheduleEntity) || null;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db
      .delete(staffSchedules)
      .where(eq(staffSchedules.id, id))
      .returning();

    return res.length > 0;
  }
}
