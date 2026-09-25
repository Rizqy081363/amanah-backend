import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  practitionerLeavePeriods,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
  practitioners,
} from '../../../../../../database/schema';
import { DEFAULT_TARGET_QUOTA } from '../../../../domain/constants/schedule.constants';
import {
  AdminScheduleStatusRequest,
  SchedulePersistenceStatus,
  toAdminDayStatusResponseLabel,
  toAdminScheduleStatusRequest,
  toDaySessionPersistenceStatus,
} from '../../../../domain/schedule-status';
import type { CreateAdminDoctorSessionDto } from '../../../../presentation/dto/create-admin-doctor-session.dto';
import type { UpdateAdminDoctorScheduleDto } from '../../../../presentation/dto/update-admin-doctor-schedule.dto';
import type { UpdateAdminDoctorSessionDto } from '../../../../presentation/dto/update-admin-doctor-session.dto';
import { ScheduleConflictQuery } from '../../queries/schedule-conflict.query';
import { PractitionerResolver } from '../../resolvers/practitioner.resolver';
import { RoomResolver } from '../../resolvers/room.resolver';
import { DrizzleAdminDoctorScheduleDetailQuery } from './drizzle-admin-doctor-schedule-detail.query';
import { DrizzleAdminSessionMutationRepository } from './drizzle-admin-session-mutation.repository';

@Injectable()
export class DrizzleAdminScheduleMutationRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly roomResolver: RoomResolver,
    conflictQuery: ScheduleConflictQuery,
    private readonly detailQuery: DrizzleAdminDoctorScheduleDetailQuery,
    private readonly sessionMutationRepo: DrizzleAdminSessionMutationRepository = new DrizzleAdminSessionMutationRepository(
      db,
      practitionerResolver,
      roomResolver,
      conflictQuery,
    ),
  ) {}

  async updateAdminDoctorSchedule(
    id: string,
    body: UpdateAdminDoctorScheduleDto,
  ): Promise<any> {
    const practitioner = await this.practitionerResolver.resolve(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }
    const practitionerId = practitioner.id;

    const targetDate =
      body.date || body.cuti_start || new Date().toISOString().slice(0, 10);

    // 0. Ruang Praktik resolution & persistence
    if (body.ruang_praktik) {
      const resolvedRoomId = await this.roomResolver.resolveByNameOrId(
        body.ruang_praktik,
      );

      if (resolvedRoomId) {
        await this.db
          .update(practitioners)
          .set({
            defaultRoomId: resolvedRoomId,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(practitioners.id, practitionerId));

        await this.db
          .update(practitionerScheduleSessions)
          .set({
            roomId: resolvedRoomId,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(practitionerScheduleSessions.practitionerId, practitionerId),
              eq(practitionerScheduleSessions.scheduleDate, targetDate),
            ),
          );
      }
    }

    // 1. Cuti override
    if (body.is_cuti !== undefined) {
      const existingSetting =
        await this.db.query.practitionerScheduleDaySettings.findFirst({
          where: and(
            eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
            eq(practitionerScheduleDaySettings.scheduleDate, targetDate),
          ),
        });

      if (existingSetting) {
        await this.db
          .update(practitionerScheduleDaySettings)
          .set({
            isLeave: body.is_cuti,
            leaveReason:
              body.cuti_reason || (body.is_cuti ? 'Cuti Dokter' : null),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(practitionerScheduleDaySettings.id, existingSetting.id));
      } else {
        await this.db.insert(practitionerScheduleDaySettings).values({
          practitionerId,
          scheduleDate: targetDate,
          targetQuota: body.kapasitas_per_hari || DEFAULT_TARGET_QUOTA,
          isLeave: body.is_cuti,
          leaveReason:
            body.cuti_reason || (body.is_cuti ? 'Cuti Dokter' : null),
        });
      }

      if (body.is_cuti && body.cuti_start && body.cuti_end) {
        await this.db.insert(practitionerLeavePeriods).values({
          practitionerId,
          startDate: body.cuti_start,
          endDate: body.cuti_end,
          reason: body.cuti_reason || 'Cuti Operasional',
        });
      }

      await this.db
        .update(practitionerScheduleSessions)
        .set({
          status: body.is_cuti
            ? SchedulePersistenceStatus.CLOSED
            : SchedulePersistenceStatus.OPEN,
          availableSlots: body.is_cuti ? 0 : sql`capacity`,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(practitionerScheduleSessions.practitionerId, practitionerId),
            eq(practitionerScheduleSessions.scheduleDate, targetDate),
          ),
        );
    }

    // 2. Schedule status override
    if (body.status_jadwal) {
      const requestedStatus = toAdminScheduleStatusRequest(body.status_jadwal);
      if (!requestedStatus) {
        throw new BadRequestException({
          code: 'INVALID_SCHEDULE_STATUS',
          message:
            'status_jadwal must use canonical values only: OPEN or CLOSED.',
          metadata: { status_jadwal: body.status_jadwal },
        });
      }
      const sessionStatus = toDaySessionPersistenceStatus(requestedStatus);

      const updateValues: Record<string, any> = {
        status: sessionStatus,
        updatedAt: new Date().toISOString(),
      };

      if (requestedStatus === AdminScheduleStatusRequest.CLOSED) {
        updateValues.availableSlots = 0;
      } else if (body.slot_tersedia !== undefined) {
        if (body.kapasitas_per_hari !== undefined) {
          updateValues.capacity = body.kapasitas_per_hari;
          updateValues.availableSlots = Math.min(
            body.slot_tersedia,
            body.kapasitas_per_hari,
          );
        } else {
          updateValues.availableSlots = sql`LEAST(${body.slot_tersedia}, capacity)`;
        }
      } else {
        updateValues.availableSlots = sql`capacity`;
      }

      await this.db
        .update(practitionerScheduleSessions)
        .set(updateValues)
        .where(
          and(
            eq(practitionerScheduleSessions.practitionerId, practitionerId),
            eq(practitionerScheduleSessions.scheduleDate, targetDate),
          ),
        );

      await this.db
        .update(practitionerScheduleDaySettings)
        .set({
          isLeave: false,
          leaveReason: null,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
            eq(practitionerScheduleDaySettings.scheduleDate, targetDate),
          ),
        );
    }

    // 3. Quota & slots override
    if (body.kapasitas_per_hari !== undefined) {
      await this.db
        .update(practitionerScheduleDaySettings)
        .set({
          targetQuota: body.kapasitas_per_hari,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
            eq(practitionerScheduleDaySettings.scheduleDate, targetDate),
          ),
        );
    }

    return this.detailQuery.execute(practitionerId, {
      date: targetDate,
    });
  }

  async updateAdminDayStatus(
    id: string,
    date: string,
    status: string,
    notes?: string,
  ): Promise<any> {
    const practitioner = await this.practitionerResolver.resolve(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }
    const practitionerId = practitioner.id;

    const requestedStatus = toAdminScheduleStatusRequest(status);
    if (!requestedStatus) {
      throw new BadRequestException({
        code: 'INVALID_SCHEDULE_STATUS',
        message: 'status must use canonical values only: OPEN or CLOSED.',
        metadata: { status },
      });
    }
    const isClosed = requestedStatus === AdminScheduleStatusRequest.CLOSED;

    const existingSetting =
      await this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          eq(practitionerScheduleDaySettings.scheduleDate, date),
        ),
      });

    const leaveReason = isClosed ? (notes ?? null) : null;

    if (existingSetting) {
      await this.db
        .update(practitionerScheduleDaySettings)
        .set({
          isLeave: false,
          leaveReason,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(practitionerScheduleDaySettings.id, existingSetting.id));
    } else {
      await this.db.insert(practitionerScheduleDaySettings).values({
        practitionerId,
        scheduleDate: date,
        targetQuota: DEFAULT_TARGET_QUOTA,
        isLeave: false,
        leaveReason,
      });
    }

    const sessionStatus = toDaySessionPersistenceStatus(requestedStatus);
    const updateValues: Record<string, any> = {
      status: sessionStatus,
      updatedAt: new Date().toISOString(),
    };
    if (isClosed) {
      updateValues.availableSlots = 0;
    } else {
      updateValues.availableSlots = sql`capacity`;
    }

    const updatedSessions = await this.db
      .update(practitionerScheduleSessions)
      .set(updateValues)
      .where(
        and(
          eq(practitionerScheduleSessions.practitionerId, practitionerId),
          eq(practitionerScheduleSessions.scheduleDate, date),
        ),
      )
      .returning();

    // 2. Soft-cancel active appointments if day is closed
    let cancelledAppointmentsCount = 0;
    if (isClosed) {
      const activeAppts = await this.db.query.appointments.findMany({
        where: and(
          eq(appointments.practitionerId, practitionerId),
          eq(appointments.scheduledDate, date),
          inArray(appointments.status, ['booked', 'checked_in', 'waiting']),
        ),
      });

      cancelledAppointmentsCount = activeAppts.length;
      if (activeAppts.length > 0) {
        const cancelReason = notes
          ? `[PENUTUPAN_JADWAL] ${notes}`
          : 'Jadwal praktik dokter ditutup operasional oleh admin klinik.';

        await this.db
          .update(appointments)
          .set({
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelReason,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(appointments.practitionerId, practitionerId),
              eq(appointments.scheduledDate, date),
              inArray(appointments.status, ['booked', 'checked_in', 'waiting']),
            ),
          );
      }
    }

    return {
      success: true,
      message: isClosed
        ? 'Jadwal hari berhasil ditutup dan seluruh sesi dinonaktifkan (pasien aktif dibatalkan secara soft delete)'
        : 'Jadwal hari berhasil dibuka kembali dan seluruh sesi diaktifkan',
      data: {
        date,
        status: toAdminDayStatusResponseLabel(requestedStatus),
        notes: notes || null,
        affectedSessionsCount: updatedSessions.length,
        cancelledAppointmentsCount,
      },
    };
  }

  async createAdminDoctorSession(
    id: string,
    body: CreateAdminDoctorSessionDto,
  ): Promise<any> {
    return this.sessionMutationRepo.createAdminDoctorSession(id, body);
  }

  async deleteAdminDoctorSession(id: string, sessionId: string): Promise<any> {
    return this.sessionMutationRepo.deleteAdminDoctorSession(id, sessionId);
  }

  async updateAdminDoctorSession(
    id: string,
    sessionId: string,
    body: UpdateAdminDoctorSessionDto,
  ): Promise<any> {
    return this.sessionMutationRepo.updateAdminDoctorSession(
      id,
      sessionId,
      body,
    );
  }
}
