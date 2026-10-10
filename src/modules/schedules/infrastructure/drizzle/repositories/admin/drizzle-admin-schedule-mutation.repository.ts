import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicClosures,
  practitionerScheduleSessions,
  practitioners,
  queueTickets,
  shiftExceptions,
} from '@database/schema';
import {
  AdminScheduleStatusRequest,
  SchedulePersistenceStatus,
  toAdminDayStatusResponseLabel,
  toAdminScheduleStatusRequest,
  toDaySessionPersistenceStatus,
} from '@modules/schedules/domain/schedule-status';
import { ScheduleConflictQuery } from '@modules/schedules/infrastructure/drizzle/queries/schedule-conflict.query';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import { RoomResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/room.resolver';
import type { CreateAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/create-admin-doctor-session.dto';
import type { UpdateAdminDoctorScheduleDto } from '@modules/schedules/presentation/dto/update-admin-doctor-schedule.dto';
import type { UpdateAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/update-admin-doctor-session.dto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
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

    // 1. Cuti override via shiftExceptions
    if (body.is_cuti !== undefined) {
      if (body.is_cuti) {
        const existingLeave = await this.db.query.shiftExceptions.findFirst({
          where: and(
            eq(shiftExceptions.doctorId, practitionerId),
            eq(shiftExceptions.serviceDate, targetDate),
            eq(shiftExceptions.type, 'leave'),
          ),
        });

        if (existingLeave) {
          await this.db
            .update(shiftExceptions)
            .set({
              note: body.cuti_reason || 'Cuti Dokter',
              updatedAt: new Date().toISOString(),
            })
            .where(eq(shiftExceptions.id, existingLeave.id));
        } else {
          await this.db.insert(shiftExceptions).values({
            doctorId: practitionerId,
            serviceDate: targetDate,
            type: 'leave',
            note: body.cuti_reason || 'Cuti Dokter',
          });
        }
      } else {
        await this.db
          .delete(shiftExceptions)
          .where(
            and(
              eq(shiftExceptions.doctorId, practitionerId),
              eq(shiftExceptions.serviceDate, targetDate),
              eq(shiftExceptions.type, 'leave'),
            ),
          );
      }

      await this.db
        .update(practitionerScheduleSessions)
        .set({
          status: body.is_cuti
            ? SchedulePersistenceStatus.CLOSED
            : SchedulePersistenceStatus.OPEN,
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

      await this.db
        .update(practitionerScheduleSessions)
        .set(updateValues)
        .where(
          and(
            eq(practitionerScheduleSessions.practitionerId, practitionerId),
            eq(practitionerScheduleSessions.scheduleDate, targetDate),
          ),
        );

      if (requestedStatus === AdminScheduleStatusRequest.OPEN) {
        await this.db
          .delete(shiftExceptions)
          .where(
            and(
              eq(shiftExceptions.doctorId, practitionerId),
              eq(shiftExceptions.serviceDate, targetDate),
              eq(shiftExceptions.type, 'leave'),
            ),
          );
      }
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

    if (isClosed) {
      const existingLeave = await this.db.query.shiftExceptions.findFirst({
        where: and(
          eq(shiftExceptions.doctorId, practitionerId),
          eq(shiftExceptions.serviceDate, date),
          eq(shiftExceptions.type, 'leave'),
        ),
      });

      if (existingLeave) {
        await this.db
          .update(shiftExceptions)
          .set({
            note: notes || 'Jadwal ditutup operasional oleh admin klinik.',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(shiftExceptions.id, existingLeave.id));
      } else {
        await this.db.insert(shiftExceptions).values({
          doctorId: practitionerId,
          serviceDate: date,
          type: 'leave',
          note: notes || 'Jadwal ditutup operasional oleh admin klinik.',
        });
      }
    } else {
      await this.db
        .delete(shiftExceptions)
        .where(
          and(
            eq(shiftExceptions.doctorId, practitionerId),
            eq(shiftExceptions.serviceDate, date),
            eq(shiftExceptions.type, 'leave'),
          ),
        );
    }

    const sessionStatus = toDaySessionPersistenceStatus(requestedStatus);
    const updateValues: Record<string, any> = {
      status: sessionStatus,
      updatedAt: new Date().toISOString(),
    };

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

    // 2. Soft-cancel unserved appointments and protect checked_in patients if day is closed
    let cancelledAppointmentsCount = 0;
    if (isClosed) {
      // Record clinic closure
      await this.db.insert(clinicClosures).values({
        scope: 'doctor',
        doctorId: practitionerId,
        startsAt: `${date}T00:00:00.000Z`,
        endsAt: `${date}T23:59:59.999Z`,
        inputKind: 'day',
        reason: notes || 'Jadwal praktik dokter ditutup operasional oleh admin klinik.',
      });

      // Update associated queue tickets to carried over
      await this.db
        .update(queueTickets)
        .set({
          carriedOver: true,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(queueTickets.doctorId, practitionerId),
            eq(queueTickets.queueDate, date),
          ),
        );

      // Only unserved appointments ('booked', 'waiting') are soft-cancelled.
      // Checked-in patients ('checked_in') are preserved for staff decision per Rule R15.
      const unservedAppts = await this.db.query.appointments.findMany({
        where: and(
          eq(appointments.practitionerId, practitionerId),
          eq(appointments.scheduledDate, date),
          inArray(appointments.status, ['booked', 'waiting']),
        ),
      });

      cancelledAppointmentsCount = unservedAppts.length;
      if (unservedAppts.length > 0) {
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
              inArray(appointments.status, ['booked', 'waiting']),
            ),
          );
      }
    }

    return {
      success: true,
      message: isClosed
        ? 'Jadwal hari berhasil ditutup dan seluruh sesi dinonaktifkan (pasien menunggu dialihkan / dicatat, pasien hadir dilindungi)'
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
