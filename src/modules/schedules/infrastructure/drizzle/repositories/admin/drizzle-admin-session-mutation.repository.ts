import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import { clinicRooms, practitionerScheduleSessions } from '@database/schema';
import {
  AdminScheduleStatusRequest,
  SchedulePersistenceStatus,
  toAdminScheduleStatusRequest,
  toDaySessionPersistenceStatus,
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
import { and, eq, sql } from 'drizzle-orm';

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

    const nameLower = body.nama_sesi.toLowerCase();
    const shift: 'morning' | 'afternoon' | 'night' | 'early_morning' =
      nameLower.includes('siang') || nameLower.includes('sore')
        ? 'afternoon'
        : nameLower.includes('malam')
          ? 'night'
          : nameLower.includes('dini')
            ? 'early_morning'
            : 'morning';

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
    const status = toDaySessionPersistenceStatus(requestedStatus);

    const capacity = body.kuota_pasien;
    const availableSlots =
      status === SchedulePersistenceStatus.CLOSED
        ? 0
        : body.slot_tersedia !== undefined
          ? body.slot_tersedia
          : capacity;

    const [session] = await this.db
      .insert(practitionerScheduleSessions)
      .values({
        practitionerId,
        scheduleDate: body.schedule_date,
        sessionLabel: body.nama_sesi,
        sessionShift: shift,
        startTime: startTimeFormatted,
        endTime: endTimeFormatted,
        capacity,
        availableSlots,
        roomId,
        status,
      })
      .returning();

    return {
      success: true,
      message: 'Sesi jadwal berhasil ditambahkan',
      data: session,
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

    const existingSession =
      await this.db.query.practitionerScheduleSessions.findFirst({
        where: and(
          eq(practitionerScheduleSessions.id, sessionId),
          eq(practitionerScheduleSessions.practitionerId, practitioner.id),
        ),
      });

    if (!existingSession) {
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan untuk dokter ini`,
      );
    }

    const startTimeFormatted = body.jam_mulai
      ? body.jam_mulai.length === 5
        ? `${body.jam_mulai}:00`
        : body.jam_mulai
      : existingSession.startTime;
    const endTimeFormatted = body.jam_selesai
      ? body.jam_selesai.length === 5
        ? `${body.jam_selesai}:00`
        : body.jam_selesai
      : existingSession.endTime;

    let roomId = existingSession.roomId;
    if (body.ruang) {
      roomId = await this.roomResolver.resolveByNameOrId(body.ruang);
    }

    if (body.jam_mulai || body.jam_selesai || body.ruang) {
      await this.conflictQuery.checkConflicts(
        practitioner.id,
        existingSession.scheduleDate,
        startTimeFormatted,
        endTimeFormatted,
        roomId,
        sessionId,
      );
    }

    const updateValues: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.nama_sesi) {
      updateValues.sessionLabel = body.nama_sesi;
      const nameLower = body.nama_sesi.toLowerCase();
      const shift: 'morning' | 'afternoon' | 'night' | 'early_morning' =
        nameLower.includes('siang') || nameLower.includes('sore')
          ? 'afternoon'
          : nameLower.includes('malam')
            ? 'night'
            : nameLower.includes('dini')
              ? 'early_morning'
              : 'morning';
      updateValues.sessionShift = shift;
    }

    if (body.jam_mulai) updateValues.startTime = startTimeFormatted;
    if (body.jam_selesai) updateValues.endTime = endTimeFormatted;
    if (body.ruang) updateValues.roomId = roomId;

    if (body.kuota_pasien !== undefined) {
      updateValues.capacity = body.kuota_pasien;
    }

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
      const status = toDaySessionPersistenceStatus(requestedStatus);
      updateValues.status = status;
      if (status === SchedulePersistenceStatus.CLOSED) {
        updateValues.availableSlots = 0;
      } else if (
        body.slot_tersedia === undefined &&
        (existingSession.availableSlots === 0 ||
          existingSession.availableSlots === null)
      ) {
        updateValues.availableSlots = sql`capacity`;
      }
    }

    if (body.slot_tersedia !== undefined) {
      updateValues.availableSlots = body.slot_tersedia;
    }

    const [updated] = await this.db
      .update(practitionerScheduleSessions)
      .set(updateValues)
      .where(eq(practitionerScheduleSessions.id, sessionId))
      .returning();

    return {
      success: true,
      message: 'Sesi jadwal berhasil diperbarui',
      data: updated,
    };
  }
}
