import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  practitionerLeavePeriods,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
} from '@database/schema';
import { ACTIVE_APPOINTMENT_STATUSES } from '@modules/schedules/domain/constants/schedule.constants';
import type {
  AppointmentOccupation,
  ScheduleClosedReason,
} from '@modules/schedules/domain/schedule-projection';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lt, lte, or } from 'drizzle-orm';

@Injectable()
export class AppointmentOccupationQuery {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async getDayClosedReason(
    practitionerId: string,
    date: string,
  ): Promise<ScheduleClosedReason | undefined> {
    const daySetting =
      await this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          eq(practitionerScheduleDaySettings.scheduleDate, date),
        ),
      });
    if (daySetting?.isLeave) {
      return 'LEAVE';
    }

    const activeLeave = await this.db.query.practitionerLeavePeriods.findFirst({
      where: and(
        eq(practitionerLeavePeriods.practitionerId, practitionerId),
        lte(practitionerLeavePeriods.startDate, date),
        gte(practitionerLeavePeriods.endDate, date),
      ),
    });

    return activeLeave ? 'LEAVE' : undefined;
  }

  async getAppointmentOccupations(params: {
    practitionerId: string;
    date: string;
    sessionId?: string;
  }): Promise<AppointmentOccupation[]> {
    const conditions = [
      eq(appointments.practitionerId, params.practitionerId),
      eq(appointments.scheduledDate, params.date),
      inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
    ];

    if (params.sessionId) {
      const session =
        await this.db.query.practitionerScheduleSessions.findFirst({
          where: eq(practitionerScheduleSessions.id, params.sessionId),
        });
      if (session) {
        const sessStart =
          session.startTime.length === 5
            ? `${session.startTime}:00`
            : session.startTime;
        const sessEnd =
          session.endTime.length === 5
            ? `${session.endTime}:00`
            : session.endTime;
        conditions.push(
          or(
            eq(appointments.scheduleSessionId, params.sessionId),
            and(
              gte(appointments.scheduledStartTime, sessStart),
              lt(appointments.scheduledStartTime, sessEnd),
            )!,
          )!,
        );
      } else {
        conditions.push(eq(appointments.scheduleSessionId, params.sessionId));
      }
    }

    const records = await this.db.query.appointments.findMany({
      where: and(...conditions),
      with: {
        queueTickets: true,
      },
    });

    return records.map((appointment) => ({
      appointmentId: appointment.id,
      startTime: appointment.scheduledStartTime.slice(0, 5),
      endTime: appointment.scheduledEndTime?.slice(0, 5) ?? null,
      queueNumber: appointment.queueTickets?.[0]?.queueNumber ?? null,
      status: appointment.status,
    }));
  }
}
