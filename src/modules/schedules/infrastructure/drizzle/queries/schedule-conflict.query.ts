import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, not } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import { practitionerScheduleSessions } from '../../../../../database/schema';

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
    excludeSessionId?: string,
  ): Promise<void> {
    const formattedStart =
      startTime.length === 5 ? `${startTime}:00` : startTime;
    const formattedEnd = endTime.length === 5 ? `${endTime}:00` : endTime;

    if (formattedStart >= formattedEnd) {
      throw new ConflictException({
        code: 'INVALID_TIME_RANGE',
        message: 'Jam mulai harus lebih awal daripada jam selesai.',
      });
    }

    // 1. Doctor overlapping session check on the same date
    const doctorConditions = [
      eq(practitionerScheduleSessions.practitionerId, practitionerId),
      eq(practitionerScheduleSessions.scheduleDate, scheduleDate),
    ];
    if (excludeSessionId) {
      doctorConditions.push(
        not(eq(practitionerScheduleSessions.id, excludeSessionId)),
      );
    }

    const doctorSessions =
      await this.db.query.practitionerScheduleSessions.findMany({
        where: and(...doctorConditions),
      });

    for (const sess of doctorSessions) {
      const sessStart =
        sess.startTime.length === 5 ? `${sess.startTime}:00` : sess.startTime;
      const sessEnd =
        sess.endTime.length === 5 ? `${sess.endTime}:00` : sess.endTime;

      if (formattedStart < sessEnd && formattedEnd > sessStart) {
        throw new ConflictException({
          code: 'PRACTITIONER_ALREADY_SCHEDULED',
          message: `Dokter sudah memiliki jadwal praktek lain pada jam ${sess.startTime.slice(0, 5)} - ${sess.endTime.slice(0, 5)} WIB.`,
          metadata: {
            conflictingSessionId: sess.id,
            scheduleDate: sess.scheduleDate,
            startTime: sess.startTime.slice(0, 5),
            endTime: sess.endTime.slice(0, 5),
            timeRange: `${sess.startTime.slice(0, 5)} - ${sess.endTime.slice(0, 5)} WIB`,
            roomId: sess.roomId,
            sessionShift: sess.sessionShift,
            sessionLabel: sess.sessionLabel,
          },
        });
      }
    }

    // 2. Room occupancy check if roomId is provided
    if (roomId) {
      const roomConditions = [
        eq(practitionerScheduleSessions.roomId, roomId),
        eq(practitionerScheduleSessions.scheduleDate, scheduleDate),
      ];
      if (excludeSessionId) {
        roomConditions.push(
          not(eq(practitionerScheduleSessions.id, excludeSessionId)),
        );
      }

      const roomSessions =
        await this.db.query.practitionerScheduleSessions.findMany({
          where: and(...roomConditions),
          with: {
            practitioner: {
              with: {
                staffProfile: true,
              },
            },
            clinicRoom: true,
          },
        });

      for (const sess of roomSessions) {
        const sessStart =
          sess.startTime.length === 5 ? `${sess.startTime}:00` : sess.startTime;
        const sessEnd =
          sess.endTime.length === 5 ? `${sess.endTime}:00` : sess.endTime;

        if (formattedStart < sessEnd && formattedEnd > sessStart) {
          const roomName = sess.clinicRoom?.name || 'Ruangan';
          const doctorName =
            sess.practitioner?.staffProfile?.fullName ||
            sess.practitioner?.displayName ||
            'Dokter lain';
          throw new ConflictException({
            code: 'ROOM_ALREADY_OCCUPIED',
            message: `${roomName} sudah dijadwalkan untuk ${doctorName} pada jam ${sess.startTime.slice(0, 5)} - ${sess.endTime.slice(0, 5)} WIB.`,
            metadata: {
              conflictingSessionId: sess.id,
              scheduleDate: sess.scheduleDate,
              startTime: sess.startTime.slice(0, 5),
              endTime: sess.endTime.slice(0, 5),
              timeRange: `${sess.startTime.slice(0, 5)} - ${sess.endTime.slice(0, 5)} WIB`,
              roomId: sess.roomId,
              roomName,
              occupiedBy: doctorName,
            },
          });
        }
      }
    }
  }
}
