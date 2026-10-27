import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  sessionSchedules,
  staffRosters,
} from '../../../../database/schema';
import { StaffRosterEntity } from '../../domain/entities/staff-roster.entity';
import { StaffRosterRepository } from '../../domain/repositories/staff-roster.repository';

@Injectable()
export class StaffRosterDrizzleRepository implements StaffRosterRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapRecordToEntity(r: any): StaffRosterEntity {
    return {
      id: r.id,
      staffProfileId: r.staffProfileId,
      sessionId: r.sessionId,
      dow: r.dow,
      isActive: r.isActive,
      notes: r.notes || null,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
      session: r.sessionDef
        ? {
            id: r.sessionDef.id,
            name: r.sessionDef.code,
            startTime: r.sessionDef.defaultStartsAt,
            endTime: r.sessionDef.defaultEndsAt,
          }
        : undefined,
      day: r.masterDay
        ? {
            dow: r.masterDay.dow,
            code: r.masterDay.code,
            nameId: r.masterDay.nameId,
            nameEn: r.masterDay.nameEn,
          }
        : undefined,
    };
  }

  async findByStaffProfileId(
    staffProfileId: string,
  ): Promise<StaffRosterEntity[]> {
    const records = await this.db.query.staffRosters.findMany({
      where: eq(staffRosters.staffProfileId, staffProfileId),
      with: {
        sessionDef: true,
        masterDay: true,
      },
    });

    if (records.length > 0) {
      return records.map((r) => ({
        ...this.mapRecordToEntity(r),
        isOverride: true,
      }));
    }

    // Default: Fallback to clinic's master weekly operational template (session_schedule)
    const masterSchedule = await this.db.query.sessionSchedules.findMany({
      where: eq(sessionSchedules.isActive, true),
      with: {
        sessionDef: true,
        masterDay: true,
      },
    });

    return masterSchedule.map((s) => ({
      id: `template-${s.sessionId}-${s.dow}`,
      staffProfileId,
      sessionId: s.sessionId,
      dow: s.dow,
      isActive: s.isActive,
      notes: null,
      isOverride: false,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
      session: s.sessionDef
        ? {
            id: s.sessionDef.id,
            name: s.sessionDef.code,
            startTime: s.startsAt || s.sessionDef.defaultStartsAt,
            endTime: s.endsAt || s.sessionDef.defaultEndsAt,
          }
        : undefined,
      day: s.masterDay
        ? {
            dow: s.masterDay.dow,
            code: s.masterDay.code,
            nameId: s.masterDay.nameId,
            nameEn: s.masterDay.nameEn,
          }
        : undefined,
    }));
  }

  async assign(data: {
    staffProfileId: string;
    sessionId: string;
    dow: number;
    notes?: string;
  }): Promise<StaffRosterEntity> {
    const existing = await this.db.query.staffRosters.findFirst({
      where: and(
        eq(staffRosters.staffProfileId, data.staffProfileId),
        eq(staffRosters.sessionId, data.sessionId),
        eq(staffRosters.dow, data.dow),
      ),
    });

    if (existing) {
      const [updated] = await this.db
        .update(staffRosters)
        .set({
          isActive: true,
          notes: data.notes || existing.notes,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(staffRosters.id, existing.id))
        .returning();

      return {
        ...this.mapRecordToEntity(updated),
        isOverride: true,
      };
    }

    const [created] = await this.db
      .insert(staffRosters)
      .values({
        staffProfileId: data.staffProfileId,
        sessionId: data.sessionId,
        dow: data.dow,
        isActive: true,
        notes: data.notes || null,
      })
      .returning();

    return {
      ...this.mapRecordToEntity(created),
      isOverride: true,
    };
  }

  async bulkReplace(
    staffProfileId: string,
    items: Array<{ sessionId: string; dow: number; notes?: string }>,
  ): Promise<StaffRosterEntity[]> {
    return this.db.transaction(async (tx) => {
      // 1. Remove current roster for this staff
      await tx
        .delete(staffRosters)
        .where(eq(staffRosters.staffProfileId, staffProfileId));

      // 2. Insert new assignments
      if (items.length > 0) {
        await tx.insert(staffRosters).values(
          items.map((item) => ({
            staffProfileId,
            sessionId: item.sessionId,
            dow: item.dow,
            isActive: true,
            notes: item.notes || null,
          })),
        );
      }

      // 3. Return full roster with relations
      const records = await tx.query.staffRosters.findMany({
        where: eq(staffRosters.staffProfileId, staffProfileId),
        with: {
          sessionDef: true,
          masterDay: true,
        },
      });

      return records.map((r) => ({
        ...this.mapRecordToEntity(r),
        isOverride: true,
      }));
    });
  }

  async remove(id: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(staffRosters)
      .where(eq(staffRosters.id, id))
      .returning();
    return Boolean(deleted);
  }

  async removeByProfileSessionDow(
    staffProfileId: string,
    sessionId: string,
    dow: number,
  ): Promise<boolean> {
    const [deleted] = await this.db
      .delete(staffRosters)
      .where(
        and(
          eq(staffRosters.staffProfileId, staffProfileId),
          eq(staffRosters.sessionId, sessionId),
          eq(staffRosters.dow, dow),
        ),
      )
      .returning();
    return Boolean(deleted);
  }

  async deleteByStaffProfileId(staffProfileId: string): Promise<number> {
    const deleted = await this.db
      .delete(staffRosters)
      .where(eq(staffRosters.staffProfileId, staffProfileId))
      .returning();
    return deleted.length;
  }
}
