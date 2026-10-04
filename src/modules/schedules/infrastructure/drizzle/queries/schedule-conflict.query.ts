import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import { practitionerScheduleSessions } from '@database/schema';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, not } from 'drizzle-orm';

const toClockSeconds = (time: string): string =>
  time.length === 5 ? `${time}:00` : time;

const toClockMinutes = (time: string): string => time.slice(0, 5);

const resolveOverlapWindow = (
  requestedStart: string,
  requestedEnd: string,
  occupantStart: string,
  occupantEnd: string,
): { startTime: string; endTime: string; timeRange: string } | null => {
  const overlapStart =
    requestedStart > occupantStart ? requestedStart : occupantStart;
  const overlapEnd = requestedEnd < occupantEnd ? requestedEnd : occupantEnd;
  if (overlapStart >= overlapEnd) {
    return null;
  }
  const startTime = toClockMinutes(overlapStart);
  const endTime = toClockMinutes(overlapEnd);
  return { startTime, endTime, timeRange: `${startTime} - ${endTime} WIB` };
};

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
    const formattedStart = toClockSeconds(startTime);
    const formattedEnd = toClockSeconds(endTime);

    if (formattedStart >= formattedEnd) {
      throw new ConflictException({
        code: 'INVALID_TIME_RANGE',
        message: 'Jam mulai harus lebih awal daripada jam selesai.',
      });
    }

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
      const overlap = resolveOverlapWindow(
        formattedStart,
        formattedEnd,
        toClockSeconds(sess.startTime),
        toClockSeconds(sess.endTime),
      );

      if (overlap) {
        throw new ConflictException({
          code: 'PRACTITIONER_ALREADY_SCHEDULED',
          message: `Dokter sudah memiliki jadwal praktek lain pada jam ${overlap.timeRange}.`,
          metadata: {
            conflictingSessionId: sess.id,
            scheduleDate: sess.scheduleDate,
            startTime: overlap.startTime,
            endTime: overlap.endTime,
            timeRange: overlap.timeRange,
            occupantSessionStart: toClockMinutes(sess.startTime),
            occupantSessionEnd: toClockMinutes(sess.endTime),
            roomId: sess.roomId,
            sessionShift: sess.sessionShift,
            sessionLabel: sess.sessionLabel,
          },
        });
      }
    }

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
        const overlap = resolveOverlapWindow(
          formattedStart,
          formattedEnd,
          toClockSeconds(sess.startTime),
          toClockSeconds(sess.endTime),
        );

        if (overlap) {
          const roomName = sess.clinicRoom?.name || 'Ruangan';
          const doctorName =
            sess.practitioner?.staffProfile?.fullName ||
            sess.practitioner?.displayName ||
            'Dokter lain';

          throw new ConflictException({
            code: 'ROOM_ALREADY_OCCUPIED',
            message: `${roomName} sudah dijadwalkan untuk ${doctorName} pada jam ${overlap.timeRange}.`,
            metadata: {
              conflictingSessionId: sess.id,
              scheduleDate: sess.scheduleDate,
              startTime: overlap.startTime,
              endTime: overlap.endTime,
              timeRange: overlap.timeRange,
              occupantSessionStart: toClockMinutes(sess.startTime),
              occupantSessionEnd: toClockMinutes(sess.endTime),
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
