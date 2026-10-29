import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  doctorAssignments,
  sessionSchedules,
  shiftExceptions,
  staffLeaveRequests,
  staffProfiles,
  staffRosters,
} from '@database/schema';
import { ACTIVE_APPOINTMENT_STATUSES } from '@modules/schedules/domain/constants/schedule.constants';
import {
  type CalendarSummaryResponse,
  ScheduleOperationalStatus,
} from '@modules/schedules/domain/entities/schedule.entity';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte, or } from 'drizzle-orm';

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
    // Month format: YYYY-MM
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const startDate = `${month}-01`;
    const endDate = `${month}-${String(daysInMonth).padStart(2, '0')}`;

    const practitioner = await this.practitionerResolver.resolve(staffId);
    if (!practitioner) {
      const staffProfile = await this.db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, staffId),
      });
      if (!staffProfile) {
        return {
          month,
          days: [],
        };
      }

      return this.getWorkerCalendarSummary(
        staffProfile.id,
        month,
        startDate,
        endDate,
        daysInMonth,
      );
    }
    const practitionerId = practitioner.id;

    const [assignments, exceptions, monthAppointments, approvedLeaves] =
      await Promise.all([
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
        this.db.query.staffLeaveRequests.findMany({
          where: and(
            or(
              eq(staffLeaveRequests.practitionerId, practitionerId),
              eq(
                staffLeaveRequests.staffProfileId,
                practitioner.staffProfileId || '',
              ),
            ),
            eq(staffLeaveRequests.status, 'approved'),
            lte(staffLeaveRequests.startDate, endDate),
            gte(staffLeaveRequests.endDate, startDate),
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
      const approvedLeave = approvedLeaves.find(
        (l) => l.startDate <= date && l.endDate >= date,
      );
      const dayAppointments = monthAppointments.filter(
        (a) => a.scheduledDate === date,
      );

      const hasSchedule = dayAssignments.length > 0;
      const isOnLeave = Boolean(leaveException || approvedLeave);
      const leaveReason =
        approvedLeave?.reason ||
        leaveException?.note ||
        null;
      const sessionCount = dayAssignments.length;
      const bookedPatientCount = dayAppointments.length;

      let dayOpStatus: ScheduleOperationalStatus;
      if (isOnLeave) {
        dayOpStatus = ScheduleOperationalStatus.ON_LEAVE;
      } else if (!hasSchedule) {
        dayOpStatus = ScheduleOperationalStatus.CLOSED;
      } else {
        dayOpStatus = ScheduleOperationalStatus.OPEN;
      }

      const isClosed = dayOpStatus === ScheduleOperationalStatus.CLOSED;
      let dayNotes: string | null = null;
      if (isOnLeave) {
        dayNotes = leaveReason || null;
      } else if (!hasSchedule) {
        dayNotes = null;
      } else if (dayOpStatus === ScheduleOperationalStatus.CLOSED) {
        dayNotes = null;
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

  private async getWorkerCalendarSummary(
    staffProfileId: string,
    month: string,
    startDate: string,
    endDate: string,
    daysInMonth: number,
  ): Promise<CalendarSummaryResponse> {
    const [workerRosters, templateSchedules, approvedLeaves] =
      await Promise.all([
        this.db.query.staffRosters.findMany({
          where: and(
            eq(staffRosters.staffProfileId, staffProfileId),
            eq(staffRosters.isActive, true),
          ),
        }),
        this.db.query.sessionSchedules.findMany({
          where: eq(sessionSchedules.isActive, true),
        }),
        this.db.query.staffLeaveRequests.findMany({
          where: and(
            eq(staffLeaveRequests.staffProfileId, staffProfileId),
            eq(staffLeaveRequests.status, 'approved'),
            lte(staffLeaveRequests.startDate, endDate),
            gte(staffLeaveRequests.endDate, startDate),
          ),
        }),
      ]);

    const hasAnyCustomRoster = workerRosters.length > 0;
    const days = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      const dow = new Date(date).getDay();

      const dayWorkerRosters = hasAnyCustomRoster
        ? workerRosters.filter((r) => r.dow === null || r.dow === dow)
        : templateSchedules.filter((ts) => ts.dow === dow);

      const approvedLeave = approvedLeaves.find(
        (l) => l.startDate <= date && l.endDate >= date,
      );

      const hasSchedule = dayWorkerRosters.length > 0;
      const isOnLeave = Boolean(approvedLeave);
      const leaveReason = approvedLeave?.reason || null;
      const sessionCount = dayWorkerRosters.length;
      const bookedPatientCount = 0;

      let dayOpStatus: ScheduleOperationalStatus;
      if (isOnLeave) {
        dayOpStatus = ScheduleOperationalStatus.ON_LEAVE;
      } else if (!hasSchedule) {
        dayOpStatus = ScheduleOperationalStatus.CLOSED;
      } else {
        dayOpStatus = ScheduleOperationalStatus.OPEN;
      }

      const isClosed = dayOpStatus === ScheduleOperationalStatus.CLOSED;
      const dayNotes: string | null = isOnLeave ? leaveReason || null : null;

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
