import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  clinicRooms,
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
      staffName:
        r.practitioner?.staffProfile?.fullName ||
        r.practitioner?.name ||
        'Dokter Amanah',
      profession: r.practitioner?.staffProfile?.positionTitle || 'Dokter Umum',
      poliklinikId:
        r.clinicRoom?.unitId ||
        r.practitioner?.staffProfile?.primaryUnitId ||
        null,
      dayOfWeek: null,
      specificDate: r.scheduleDate,
      session: sessionName,
      startTime: r.startTime,
      endTime: r.endTime,
      capacity: r.capacity || 20,
      availableSlots: r.availableSlots || 20,
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

    let roomId: string | null = null;
    if (data.poliklinikId) {
      const room = await this.db.query.clinicRooms.findFirst({
        where: eq(clinicRooms.unitId, data.poliklinikId),
      });
      if (room) roomId = room.id;
    }

    const targetDate =
      data.specificDate || new Date().toISOString().split('T')[0];

    const defaultStartTime =
      data.startTime ||
      (shift === 'afternoon' ? '13:00' : shift === 'night' ? '18:00' : '08:00');
    const defaultEndTime =
      data.endTime ||
      (shift === 'afternoon' ? '17:00' : shift === 'night' ? '21:00' : '12:00');

    const capacity = data.capacity || 20;

    const [record] = await this.db
      .insert(practitionerScheduleSessions)
      .values({
        practitionerId: practitioner ? practitioner.id : data.staffId,
        roomId: roomId || null,
        scheduleDate: targetDate,
        sessionLabel: data.session,
        sessionShift: shift,
        startTime: defaultStartTime,
        endTime: defaultEndTime,
        capacity,
        availableSlots: capacity,
        status: data.isAvailable ? 'open' : 'closed',
        notes: data.notes || null,
      })
      .returning();

    return this.findById(record.id) as Promise<ScheduleEntity>;
  }

  async findById(id: string): Promise<ScheduleEntity | null> {
    const record = await this.db.query.practitionerScheduleSessions.findFirst({
      where: eq(practitionerScheduleSessions.id, id),
      with: {
        practitioner: {
          with: {
            staffProfile: true,
          },
        },
        clinicRoom: true,
      },
    });

    return record ? this.mapRecordToEntity(record) : null;
  }

  async findAll(
    limit = 20,
    offset = 0,
    filters?: {
      poliklinikId?: string;
      staffId?: string;
      date?: string;
    },
  ): Promise<ScheduleEntity[]> {
    const conditions: any[] = [];
    if (filters?.date) {
      conditions.push(
        eq(practitionerScheduleSessions.scheduleDate, filters.date),
      );
    }

    const records = await this.db.query.practitionerScheduleSessions.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      limit,
      offset,
      with: {
        practitioner: {
          with: {
            staffProfile: true,
          },
        },
        clinicRoom: true,
      },
    });

    let result = records.map((r) => this.mapRecordToEntity(r));

    if (filters?.poliklinikId) {
      result = result.filter((s) => s.poliklinikId === filters.poliklinikId);
    }
    if (filters?.staffId) {
      result = result.filter((s) => s.staffId === filters.staffId);
    }

    return result;
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
        practitioner: {
          with: {
            staffProfile: true,
          },
        },
        clinicRoom: true,
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
        startTime: s.startTime,
        endTime: s.endTime,
        capacity: s.capacity,
        availableSlots: s.availableSlots,
        isAvailable: s.status === 'open',
        notes: s.notes,
      }));
  }

  async update(
    id: string,
    data: Partial<ScheduleEntity>,
  ): Promise<ScheduleEntity | null> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.session) {
      const shift =
        data.session === 'SIANG'
          ? 'afternoon'
          : data.session === 'MALAM'
            ? 'night'
            : 'morning';
      updateValues.sessionLabel = data.session;
      updateValues.sessionShift = shift;
    }
    if (data.startTime !== undefined) updateValues.startTime = data.startTime;
    if (data.endTime !== undefined) updateValues.endTime = data.endTime;
    if (data.capacity !== undefined) updateValues.capacity = data.capacity;
    if (data.isAvailable !== undefined) {
      updateValues.status = data.isAvailable ? 'open' : 'closed';
    }
    if (data.notes !== undefined) updateValues.notes = data.notes;

    const [updated] = await this.db
      .update(practitionerScheduleSessions)
      .set(updateValues)
      .where(eq(practitionerScheduleSessions.id, id))
      .returning();

    return updated ? this.findById(updated.id) : null;
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

    return record ? this.findById(record.id) : null;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db
      .delete(practitionerScheduleSessions)
      .where(eq(practitionerScheduleSessions.id, id))
      .returning();

    return res.length > 0;
  }
}
