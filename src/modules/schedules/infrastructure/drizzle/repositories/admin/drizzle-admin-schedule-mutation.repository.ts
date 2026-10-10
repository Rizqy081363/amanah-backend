import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicClosures,
  doctorAssignments,
  practitioners,
  queueTickets,
  shiftExceptions,
} from '@database/schema';
import {
  AdminScheduleStatusRequest,
  toAdminDayStatusResponseLabel,
  toAdminScheduleStatusRequest,
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
import { and, eq, inArray, or, sql } from 'drizzle-orm';
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
      body.date || body.leave_start || new Date().toISOString().slice(0, 10);

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
          .update(doctorAssignments)
          .set({
            preferredRoomId: resolvedRoomId,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(doctorAssignments.doctorId, practitionerId));
      }
    }

    // 1. Leave override via shiftExceptions
    const isOnLeave = body.is_on_leave;
    if (isOnLeave !== undefined) {
      if (isOnLeave) {
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
              note: body.leave_reason || 'Dokter Cuti',
              updatedAt: new Date().toISOString(),
            })
            .where(eq(shiftExceptions.id, existingLeave.id));
        } else {
          await this.db.insert(shiftExceptions).values({
            doctorId: practitionerId,
            serviceDate: targetDate,
            type: 'leave',
            note: body.leave_reason || 'Dokter Cuti',
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
    }

    // 2. Schedule status override via shiftExceptions
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

      if (requestedStatus === AdminScheduleStatusRequest.CLOSED) {
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
              note: 'Jadwal ditutup oleh admin klinik.',
              updatedAt: new Date().toISOString(),
            })
            .where(eq(shiftExceptions.id, existingLeave.id));
        } else {
          await this.db.insert(shiftExceptions).values({
            doctorId: practitionerId,
            serviceDate: targetDate,
            type: 'leave',
            note: 'Jadwal ditutup oleh admin klinik.',
          });
        }
      } else if (requestedStatus === AdminScheduleStatusRequest.OPEN) {
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

    const targetDow = new Date(date).getDay();
    const affectedAssignments = await this.db.query.doctorAssignments.findMany({
      where: and(
        eq(doctorAssignments.doctorId, practitionerId),
        eq(doctorAssignments.isActive, true),
        or(
          eq(doctorAssignments.dow, targetDow),
          sql`${doctorAssignments.dow} IS NULL`,
        ),
      ),
    });

    // 2. Soft-cancel unserved appointments and protect checked_in patients if day is closed
    let cancelledAppointmentsCount = 0;
    if (isClosed) {
      const startDate = new Date(`${date}T00:00:00.000Z`);
      const nextDayDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

      // Record clinic closure
      await this.db.insert(clinicClosures).values({
        scope: 'doctor',
        doctorId: practitionerId,
        startsAt: startDate.toISOString(),
        endsAt: nextDayDate.toISOString(),
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
        affectedSessionsCount: affectedAssignments.length,
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
