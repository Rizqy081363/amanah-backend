import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  doctorAssignments,
  shiftExceptions,
} from '@database/schema';
import { ACTIVE_APPOINTMENT_STATUSES } from '@modules/schedules/domain/constants/schedule.constants';
import {
  type CalendarSummaryResponse,
  ScheduleOperationalStatus,
} from '@modules/schedules/domain/entities/schedule.entity';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';

@Injectable()
export class DrizzleScheduleDayRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
  ) {}

  async getCalendarSummary(
    staffId: string,
    month: string,
  ): Promise<CalendarSummaryResponse> {
    const practitioner = await this.practitionerResolver.resolve(staffId);
    if (!practitioner) {
      return {
        month,
        days: [],
      };
    }
    const practitionerId = practitioner.id;

    // Month format: YYYY-MM
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const startDate = `${month}-01`;
    const endDate = `${month}-${String(daysInMonth).padStart(2, '0')}`;

    const [assignments, exceptions, monthAppointments] = await Promise.all([
      this.db.query.doctorAssignments.findMany({
        where: and(
          eq(doctorAssignments.doctorId, practitionerId),
          eq(doctorAssignments.isActive, true),
        ),
      }),
      this.db.query.shiftExceptions.findMany({
        where: and(
          eq(shiftExceptions.doctorId, practitionerId),
          gte(shiftExceptions.serviceDate, startDate),
          lte(shiftExceptions.serviceDate, endDate),
          eq(shiftExceptions.type, 'leave'),
        ),
      }),
      this.db.query.appointments.findMany({
        where: and(
          eq(appointments.practitionerId, practitionerId),
          gte(appointments.scheduledDate, startDate),
          lte(appointments.scheduledDate, endDate),
          inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
        ),
      }),
    ]);

    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      const dow = new Date(date).getDay();
      const dayAssignments = assignments.filter(
        (a) => a.dow === null || a.dow === dow,
      );
      const leaveException = exceptions.find((ex) => ex.serviceDate === date);
      const dayAppointments = monthAppointments.filter(
        (a) => a.scheduledDate === date,
      );

      const hasSchedule = dayAssignments.length > 0;
      const isOnLeave = Boolean(leaveException);
      const leaveReason =
        leaveException?.note || (isOnLeave ? 'Dokter Cuti' : null);
      const sessionCount = dayAssignments.length;
      const bookedPatientCount = dayAppointments.length;

      let dayOpStatus: ScheduleOperationalStatus;
      if (isOnLeave || !hasSchedule) {
        dayOpStatus = ScheduleOperationalStatus.CLOSED;
      } else {
        dayOpStatus = ScheduleOperationalStatus.OPEN;
      }

      const isClosed = dayOpStatus === ScheduleOperationalStatus.CLOSED;
      let dayNotes: string | null = null;
      if (isOnLeave) {
        dayNotes = leaveReason || 'Dokter Cuti';
      } else if (!hasSchedule) {
        dayNotes = null;
      } else if (dayOpStatus === ScheduleOperationalStatus.CLOSED) {
        dayNotes = 'Jadwal ditutup oleh dokter/admin';
      }

      days.push({
        date,
        hasSchedule,
        isOnLeave,
        leaveReason,
        sessionCount,
        bookedPatientCount,
        status: dayOpStatus,
        isClosed,
        notes: dayNotes,
      });
    }

    return {
      month,
      days,
    };
  }
}
