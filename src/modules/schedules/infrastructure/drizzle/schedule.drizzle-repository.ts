import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  practitionerScheduleSessions,
  practitioners,
} from '../../../../database/schema';
import { ScheduleEntity } from '../../domain/entities/schedule.entity';
import { ScheduleRepository } from '../../domain/repositories/schedule.repository';

@Injectable()
export class ScheduleDrizzleRepository implements ScheduleRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapRecordToEntity(r: any): ScheduleEntity {
    const shift = r.sessionShift;
    const sessionName =
      shift === 'afternoon' ? 'SIANG' : shift === 'night' ? 'MALAM' : 'PAGI';

    return {
      id: r.id,
      staffId: r.practitioner?.staffProfileId || r.practitionerId,
      dayOfWeek: null,
      specificDate: r.scheduleDate,
      session: sessionName,
      isAvailable: r.status === 'open',
      notes: r.notes || null,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async create(
    data: Omit<ScheduleEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ScheduleEntity> {
    const shift: 'morning' | 'afternoon' | 'night' =
      data.session === 'SIANG'
        ? 'afternoon'
        : data.session === 'MALAM'
          ? 'night'
          : 'morning';

    // Lookup practitioner by staffId (could be staffProfileId or practitionerId)
    let practitioner = await this.db.query.practitioners.findFirst({
      where: or(
        eq(practitioners.id, data.staffId),
        eq(practitioners.staffProfileId, data.staffId),
      ),
    });

    if (!practitioner) {
      practitioner = await this.db.query.practitioners.findFirst();
    }

    const targetDate =
      data.specificDate || new Date().toISOString().split('T')[0];

    const [record] = await this.db
      .insert(practitionerScheduleSessions)
      .values({
        practitionerId: practitioner ? practitioner.id : data.staffId,
        scheduleDate: targetDate,
        sessionLabel: data.session,
        sessionShift: shift,
        startTime: shift === 'afternoon' ? '13:00' : '08:00',
        endTime: shift === 'afternoon' ? '17:00' : '12:00',
        capacity: 20,
        availableSlots: 20,
        status: data.isAvailable ? 'open' : 'closed',
        notes: data.notes || null,
      })
      .returning();

    return this.mapRecordToEntity(record);
  }

  async findByStaffId(staffId: string): Promise<ScheduleEntity[]> {
    const practitioner = await this.db.query.practitioners.findFirst({
      where: or(
        eq(practitioners.id, staffId),
        eq(practitioners.staffProfileId, staffId),
      ),
    });

    const targetId = practitioner ? practitioner.id : staffId;
    const records = await this.db.query.practitionerScheduleSessions.findMany({
      where: eq(practitionerScheduleSessions.practitionerId, targetId),
      with: {
        practitioner: true,
      },
    });

    return records.map((r) => this.mapRecordToEntity(r));
  }

  async findByPoliAndDate(poliklinikId: string, date: string): Promise<any[]> {
    const sessions = await this.db.query.practitionerScheduleSessions.findMany({
      where: and(
        eq(practitionerScheduleSessions.scheduleDate, date),
        eq(practitionerScheduleSessions.status, 'open'),
      ),
      with: {
        practitioner: {
          with: {
            staffProfile: true,
          },
        },
        clinicRoom: true,
      },
    });

    return sessions
      .filter((s) => {
        if (!poliklinikId) return true;
        return (
          s.clinicRoom?.unitId === poliklinikId ||
          s.practitioner?.staffProfile?.primaryUnitId === poliklinikId
        );
      })
      .map((s) => ({
        id: s.id,
        staffId: s.practitioner?.staffProfileId || s.practitionerId,
        staffName: s.practitioner?.staffProfile?.fullName || 'Dokter Amanah',
        profession:
          s.practitioner?.staffProfile?.positionTitle || 'Dokter Umum',
        dayOfWeek: null,
        specificDate: s.scheduleDate,
        session:
          s.sessionShift === 'afternoon'
            ? 'SIANG'
            : s.sessionShift === 'night'
              ? 'MALAM'
              : 'PAGI',
        isAvailable: s.status === 'open',
        notes: s.notes,
      }));
  }

  async toggleAvailability(
    id: string,
    isAvailable: boolean,
  ): Promise<ScheduleEntity | null> {
    const [record] = await this.db
      .update(practitionerScheduleSessions)
      .set({
        status: isAvailable ? 'open' : 'closed',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(practitionerScheduleSessions.id, id))
      .returning();

    return record ? this.mapRecordToEntity(record) : null;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db
      .delete(practitionerScheduleSessions)
      .where(eq(practitionerScheduleSessions.id, id))
      .returning();

    return res.length > 0;
  }
}
