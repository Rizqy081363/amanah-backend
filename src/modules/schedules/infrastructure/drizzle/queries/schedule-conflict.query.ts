import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import { clinicClosures, shiftExceptions } from '@database/schema';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';

const toClockSeconds = (time: string): string =>
  time.length === 5 ? `${time}:00` : time;

@Injectable()
export class ScheduleConflictQuery {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async checkConflicts(
    practitionerId: string,
    scheduleDate: string,
    startTime: string,
    endTime: string,
    roomId?: string | null,
    _excludeSessionId?: string,
  ): Promise<void> {
    const formattedStart = toClockSeconds(startTime);
    const formattedEnd = toClockSeconds(endTime);

    if (formattedStart >= formattedEnd) {
      throw new ConflictException({
        code: 'INVALID_TIME_RANGE',
        message: 'Jam mulai harus lebih awal daripada jam selesai.',
      });
    }

    // 1. Check if practitioner has a recorded leave on target date
    const activeLeave = await this.db.query.shiftExceptions.findFirst({
      where: and(
        eq(shiftExceptions.doctorId, practitionerId),
        eq(shiftExceptions.serviceDate, scheduleDate),
        eq(shiftExceptions.type, 'leave'),
      ),
    });

    if (activeLeave) {
      throw new ConflictException({
        code: 'PRACTITIONER_ON_LEAVE',
        message: `Dokter tercatat sedang cuti pada tanggal ${scheduleDate}.`,
        metadata: {
          scheduleDate,
          reason: activeLeave.note || 'Cuti Dokter',
        },
      });
    }

    // 2. Check active clinic closures (clinic, doctor, or room level)
    const requestedStartIso = `${scheduleDate}T${formattedStart}Z`;
    const requestedEndIso = `${scheduleDate}T${formattedEnd}Z`;

    const activeClosures = await this.db.query.clinicClosures.findMany({
      where: and(
        isNull(clinicClosures.cancelledAt),
        lt(clinicClosures.startsAt, requestedEndIso),
        gt(clinicClosures.endsAt, requestedStartIso),
      ),
    });

    for (const closure of activeClosures) {
      if (
        closure.scope === 'clinic' ||
        (closure.scope === 'doctor' && closure.doctorId === practitionerId)
      ) {
        throw new ConflictException({
          code: 'CLINIC_OR_DOCTOR_CLOSED',
          message: `Klinik atau dokter ditutup pada waktu yang dipilih (${closure.reason || 'Penutupan operasional'}).`,
          metadata: {
            closureId: closure.id,
            scope: closure.scope,
            reason: closure.reason,
          },
        });
      }

      if (roomId && closure.scope === 'room' && closure.roomId === roomId) {
        throw new ConflictException({
          code: 'ROOM_CLOSED',
          message: `Ruangan ditutup pada waktu yang dipilih (${closure.reason || 'Penutupan ruangan'}).`,
          metadata: {
            closureId: closure.id,
            roomId,
            reason: closure.reason,
          },
        });
      }
    }
  }
}
