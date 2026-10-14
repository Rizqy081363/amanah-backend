import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicClosures,
  clinicRooms,
  doctorAssignments,
  queueTickets,
  sessionDefs,
  shiftExceptions,
} from '@database/schema';
import { resolveCanonicalShift } from '@modules/schedules/domain/constants/schedule-shift.constants';
import {
  AdminScheduleStatusRequest,
  toAdminScheduleStatusRequest,
} from '@modules/schedules/domain/schedule-status';
import { ScheduleConflictQuery } from '@modules/schedules/infrastructure/drizzle/queries/schedule-conflict.query';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import { RoomResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/room.resolver';
import type { CreateAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/create-admin-doctor-session.dto';
import type { UpdateAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/update-admin-doctor-session.dto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { and, eq, inArray, sql } from 'drizzle-orm';

@Injectable()
export class DrizzleAdminSessionMutationRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly roomResolver: RoomResolver,
    private readonly conflictQuery: ScheduleConflictQuery,
  ) {}

  async createAdminDoctorSession(
    id: string,
    body: CreateAdminDoctorSessionDto,
  ): Promise<any> {
    const practitioner = await this.practitionerResolver.resolve(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }
    const practitionerId = practitioner.id;

    let roomId: string | null = null;
    if (body.ruang) {
      roomId = await this.roomResolver.resolveByNameOrId(body.ruang);
    }
    if (!roomId) {
      roomId = practitioner.defaultRoomId || null;
    }
    if (!roomId) {
      const defaultRoom = await this.db.query.clinicRooms.findFirst({
        where: eq(clinicRooms.isActive, true),
      });
      if (defaultRoom) roomId = defaultRoom.id;
    }

    const startTimeFormatted =
      body.jam_mulai.length === 5 ? `${body.jam_mulai}:00` : body.jam_mulai;
    const endTimeFormatted =
      body.jam_selesai.length === 5
        ? `${body.jam_selesai}:00`
        : body.jam_selesai;

    await this.conflictQuery.checkConflicts(
      practitionerId,
      body.schedule_date,
      startTimeFormatted,
      endTimeFormatted,
      roomId,
    );

    const { shift, label } = resolveCanonicalShift({ session: body.nama_sesi });

    const requestedStatus = toAdminScheduleStatusRequest(
      body.status_sesi ?? AdminScheduleStatusRequest.OPEN,
    );
    if (!requestedStatus) {
      throw new BadRequestException({
        code: 'INVALID_SESSION_STATUS',
        message: 'status_sesi must use canonical values only: OPEN or CLOSED.',
        metadata: { status_sesi: body.status_sesi },
      });
    }

    const sessionDef =
      (await this.db.query.sessionDefs.findFirst({
        where: eq(sessionDefs.code, shift),
      })) || (await this.db.query.sessionDefs.findFirst());

    const exceptionType =
      requestedStatus === AdminScheduleStatusRequest.CLOSED ? 'leave' : 'extra';

    const [createdException] = await this.db
      .insert(shiftExceptions)
      .values({
        doctorId: practitionerId,
        serviceDate: body.schedule_date,
        sessionId: sessionDef?.id || null,
        type: exceptionType,
        note: body.nama_sesi,
      })
      .returning();

    const sessionData = {
      id: createdException.id,
      practitionerId,
      scheduleDate: body.schedule_date,
      sessionLabel: label,
      sessionShift: shift,
      startTime: startTimeFormatted,
      endTime: endTimeFormatted,
      roomId,
      status: requestedStatus,
      createdAt: createdException.createdAt,
      updatedAt: createdException.updatedAt,
    };

    return {
      success: true,
      message: 'Sesi jadwal berhasil ditambahkan',
      data: sessionData,
    };
  }

  async deleteAdminDoctorSession(id: string, sessionId: string): Promise<any> {
    throw new ForbiddenException({
      code: 'ADMIN_SCHEDULE_DELETION_PROHIBITED',
      message:
        'Admin tidak diizinkan menghapus sesi jadwal dokter demi integritas data dan riwayat rekam medis klinis. Silakan nonaktifkan sesi dengan status CLOSED atau lakukan Reschedule.',
    });
  }

  async updateAdminDoctorSession(
    id: string,
    sessionId: string,
    body: UpdateAdminDoctorSessionDto,
  ): Promise<any> {
    const practitioner = await this.practitionerResolver.resolve(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }

    let targetDate = new Date().toISOString().slice(0, 10);
    let targetSessionDefId: string | null = null;
    let existingStartTime = '08:00:00';
    let existingEndTime = '12:00:00';
    let roomId: string | null = null;

    if ((body as any)?.date) {
      targetDate = (body as any).date;
    }

    if (sessionId.startsWith('roster-')) {
      const daId = sessionId.slice(7, 43);
      const rosterDate = sessionId.slice(44);
      if (rosterDate && !(body as any)?.date) {
        targetDate = rosterDate;
      }
      if (!isUUID(daId)) {
        throw new NotFoundException(
          `Format ID roster sesi ${sessionId} tidak valid`,
        );
      }
      const da = await this.db.query.doctorAssignments.findFirst({
        where: and(
          eq(doctorAssignments.id, daId),
          eq(doctorAssignments.doctorId, practitioner.id),
        ),
        with: { sessionDef: true },
      });
      if (!da) {
        throw new NotFoundException(
          `Sesi jadwal dengan ID ${sessionId} tidak ditemukan untuk dokter ini`,
        );
      }
      targetSessionDefId = da.sessionId;
      existingStartTime = da.sessionDef?.defaultStartsAt || '08:00:00';
      existingEndTime = da.sessionDef?.defaultEndsAt || '12:00:00';
      roomId = da.preferredRoomId;
    } else if (isUUID(sessionId)) {
      const da = await this.db.query.doctorAssignments.findFirst({
        where: and(
          eq(doctorAssignments.id, sessionId),
          eq(doctorAssignments.doctorId, practitioner.id),
        ),
        with: { sessionDef: true },
      });
      if (da) {
        targetSessionDefId = da.sessionId;
        existingStartTime = da.sessionDef?.defaultStartsAt || '08:00:00';
        existingEndTime = da.sessionDef?.defaultEndsAt || '12:00:00';
        roomId = da.preferredRoomId;
      } else {
        const ex = await this.db.query.shiftExceptions.findFirst({
          where: and(
            eq(shiftExceptions.id, sessionId),
            eq(shiftExceptions.doctorId, practitioner.id),
          ),
          with: { sessionDef: true },
        });
        if (ex) {
          targetDate = ex.serviceDate;
          targetSessionDefId = ex.sessionId;
          existingStartTime = ex.sessionDef?.defaultStartsAt || '08:00:00';
          existingEndTime = ex.sessionDef?.defaultEndsAt || '12:00:00';
        } else {
          const sDef = await this.db.query.sessionDefs.findFirst({
            where: eq(sessionDefs.id, sessionId),
          });
          if (sDef) {
            targetSessionDefId = sDef.id;
            existingStartTime = sDef.defaultStartsAt || '08:00:00';
            existingEndTime = sDef.defaultEndsAt || '12:00:00';
          } else {
            throw new NotFoundException(
              `Sesi jadwal dengan ID ${sessionId} tidak ditemukan untuk dokter ini`,
            );
          }
        }
      }
    } else {
      throw new NotFoundException(`Format ID sesi ${sessionId} tidak valid`);
    }

    const startTimeFormatted = body.jam_mulai
      ? body.jam_mulai.length === 5
        ? `${body.jam_mulai}:00`
        : body.jam_mulai
      : existingStartTime;
    const endTimeFormatted = body.jam_selesai
      ? body.jam_selesai.length === 5
        ? `${body.jam_selesai}:00`
        : body.jam_selesai
      : existingEndTime;

    if (body.ruang) {
      roomId = await this.roomResolver.resolveByNameOrId(body.ruang);
    }

    if (body.jam_mulai || body.jam_selesai || body.ruang) {
      await this.conflictQuery.checkConflicts(
        practitioner.id,
        targetDate,
        startTimeFormatted,
        endTimeFormatted,
        roomId,
        sessionId,
      );
    }

    let resolvedStatus = AdminScheduleStatusRequest.OPEN;
    if (body.status_sesi) {
      const requestedStatus = toAdminScheduleStatusRequest(body.status_sesi);
      if (!requestedStatus) {
        throw new BadRequestException({
          code: 'INVALID_SESSION_STATUS',
          message:
            'status_sesi must use canonical values only: OPEN or CLOSED.',
          metadata: { status_sesi: body.status_sesi },
        });
      }
      resolvedStatus = requestedStatus;

      if (requestedStatus === AdminScheduleStatusRequest.CLOSED) {
        const existingLeave = await this.db.query.shiftExceptions.findFirst({
          where: and(
            eq(shiftExceptions.doctorId, practitioner.id),
            eq(shiftExceptions.serviceDate, targetDate),
            eq(shiftExceptions.type, 'leave'),
            targetSessionDefId
              ? eq(shiftExceptions.sessionId, targetSessionDefId)
              : sql`TRUE`,
          ),
        });

        if (!existingLeave) {
          await this.db.insert(shiftExceptions).values({
            doctorId: practitioner.id,
            serviceDate: targetDate,
            sessionId: targetSessionDefId,
            type: 'leave',
            note: 'Sesi jadwal ditutup oleh admin klinik.',
          });
        }

        const sTime =
          startTimeFormatted.length === 5
            ? `${startTimeFormatted}:00`
            : startTimeFormatted;
        const eTime =
          endTimeFormatted.length === 5
            ? `${endTimeFormatted}:00`
            : endTimeFormatted;
        const sessionStart = new Date(`${targetDate}T${sTime}Z`);
        const sessionEnd = new Date(`${targetDate}T${eTime}Z`);

        await this.db.insert(clinicClosures).values({
          scope: 'doctor',
          doctorId: practitioner.id,
          startsAt: sessionStart.toISOString(),
          endsAt: sessionEnd.toISOString(),
          inputKind: 'session',
          reason: 'Sesi jadwal ditutup oleh admin klinik.',
        });

        if (targetSessionDefId) {
          await this.db
            .update(queueTickets)
            .set({
              carriedOver: true,
              updatedAt: new Date().toISOString(),
            })
            .where(
              and(
                eq(queueTickets.sessionId, targetSessionDefId),
                eq(queueTickets.queueDate, targetDate),
              ),
            );
        }

        await this.db
          .update(appointments)
          .set({
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelReason:
              'Sesi jadwal praktik dokter ditutup operasional oleh admin klinik.',
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(appointments.practitionerId, practitioner.id),
              eq(appointments.scheduledDate, targetDate),
              inArray(appointments.status, ['booked', 'waiting']),
            ),
          );
      } else if (requestedStatus === AdminScheduleStatusRequest.OPEN) {
        await this.db
          .delete(shiftExceptions)
          .where(
            and(
              eq(shiftExceptions.doctorId, practitioner.id),
              eq(shiftExceptions.serviceDate, targetDate),
              eq(shiftExceptions.type, 'leave'),
              targetSessionDefId
                ? eq(shiftExceptions.sessionId, targetSessionDefId)
                : sql`TRUE`,
            ),
          );
      }
    }

    return {
      success: true,
      message: 'Sesi jadwal berhasil diperbarui',
      data: {
        id: sessionId,
        practitionerId: practitioner.id,
        scheduleDate: targetDate,
        startTime: startTimeFormatted,
        endTime: endTimeFormatted,
        roomId,
        status: resolvedStatus,
      },
    };
  }
}
