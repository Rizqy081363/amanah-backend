import { ClinicTimeService } from '@common/time/clinic-time.service';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  doctorAssignments,
  sessionSchedules,
  shiftExceptions,
} from '@database/schema';
import { SHIFT_EXCEPTION_TYPE } from '@modules/appointments/domain/constants/appointment-lifecycle.constants';
import type { ScheduleEntity } from '@modules/schedules/domain/entities/schedule.entity';
import type { SessionShiftType } from '@modules/schedules/domain/factories/schedule-session.factory';
import { SchedulePersistenceStatus } from '@modules/schedules/domain/schedule-status';
import { parseTimeToMinutes } from '@modules/schedules/domain/services/shift-duration.helper';
import { ScheduleRecordMapper } from '@modules/schedules/infrastructure/drizzle/mappers/schedule-record.mapper';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lte } from 'drizzle-orm';

export interface DoctorMySchedulesFilter {
  date?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class DoctorMySchedulesQuery {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly clinicTimeService: ClinicTimeService,
  ) {}

  async execute(
    staffId: string,
    filters?: DoctorMySchedulesFilter,
  ): Promise<ScheduleEntity[]> {
    const practitioner = await this.practitionerResolver.resolve(staffId);
    if (!practitioner) {
      return [];
    }
    const targetId = practitioner.id;

    const startDate =
      filters?.date || filters?.startDate || this.clinicTimeService.today();
    const endDate = filters?.date || filters?.endDate || startDate;

    const [assignments, exceptions, templateSchedules] = await Promise.all([
      this.db.query.doctorAssignments.findMany({
        where: eq(doctorAssignments.doctorId, targetId),
        with: {
          sessionDef: {
            with: { schedules: true },
          },
          preferredRoom: {
            with: { clinicUnit: true },
          },
          practitioner: {
            with: {
              staffProfile: {
                with: { clinicUnit: true },
              },
            },
          },
        },
      }),
      this.db.query.shiftExceptions.findMany({
        where: and(
          eq(shiftExceptions.doctorId, targetId),
          gte(shiftExceptions.serviceDate, startDate),
          lte(shiftExceptions.serviceDate, endDate),
        ),
      }),
      this.db.query.sessionSchedules.findMany({
        where: eq(sessionSchedules.isActive, true),
        with: {
          sessionDef: true,
        },
      }),
    ]);

    const results: ScheduleEntity[] = [];
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);

    for (let d = new Date(startObj); d <= endObj; d.setDate(d.getDate() + 1)) {
      const curDateStr = d.toISOString().slice(0, 10);
      const curDow = d.getDay();

      const dayAssignments = assignments.filter(
        (da) => da.dow === null || da.dow === curDow,
      );

      const processedSessionIds = new Set<string>();

      for (const da of dayAssignments) {
        if (!da.sessionDef || !da.sessionDef.isActive) continue;
        processedSessionIds.add(da.sessionId);
        if (!da.isActive) continue;

        const ex = exceptions.find(
          (e) =>
            e.serviceDate === curDateStr &&
            (!e.sessionId || e.sessionId === da.sessionId),
        );
        const isLeave = ex?.type === SHIFT_EXCEPTION_TYPE.LEAVE;

        const sched = da.sessionDef.schedules?.find(
          (s) => s.dow === curDow && s.isActive,
        );
        const startTime = sched?.startsAt || da.sessionDef.defaultStartsAt;
        const endTime = sched?.endsAt || da.sessionDef.defaultEndsAt;

        results.push(
          ScheduleRecordMapper.toEntity({
            id: da.id,
            sessionId: da.sessionId,
            practitionerId: da.doctorId,
            scheduleDate: curDateStr,
            sessionLabel: da.sessionDef.label,
            sessionShift: da.sessionDef.code as SessionShiftType,
            startTime,
            endTime,
            roomId: da.preferredRoomId,
            serviceId: da.categoryId,
            status: isLeave
              ? SchedulePersistenceStatus.CLOSED
              : SchedulePersistenceStatus.OPEN,
            notes: ex?.note || null,
            createdAt: da.createdAt,
            updatedAt: da.updatedAt,
            practitioner: da.practitioner,
            clinicRoom: da.preferredRoom,
            clinicService: null,
          }),
        );
      }

      const dayTemplates = templateSchedules.filter(
        (ts) => ts.dow === curDow && ts.sessionDef?.isActive,
      );

      for (const ts of dayTemplates) {
        if (!ts.sessionDef || processedSessionIds.has(ts.sessionId)) continue;

        const ex = exceptions.find(
          (e) =>
            e.serviceDate === curDateStr &&
            (!e.sessionId || e.sessionId === ts.sessionId),
        );
        const isLeave = ex?.type === SHIFT_EXCEPTION_TYPE.LEAVE;

        const startTime = ts.startsAt || ts.sessionDef.defaultStartsAt;
        const endTime = ts.endsAt || ts.sessionDef.defaultEndsAt;

        results.push(
          ScheduleRecordMapper.toEntity({
            id: ts.sessionDef.id,
            sessionId: ts.sessionId,
            practitionerId: targetId,
            scheduleDate: curDateStr,
            sessionLabel: ts.sessionDef.label,
            sessionShift: ts.sessionDef.code as SessionShiftType,
            startTime,
            endTime,
            roomId: practitioner.defaultRoomId || null,
            serviceId: null,
            status: isLeave
              ? SchedulePersistenceStatus.CLOSED
              : SchedulePersistenceStatus.OPEN,
            notes: ex?.note || null,
            createdAt: ts.sessionDef.createdAt,
            updatedAt: ts.sessionDef.updatedAt,
            practitioner,
            clinicRoom: null,
            clinicService: null,
          }),
        );
      }
    }

    if (results.length > 1) {
      const todayStr = this.clinicTimeService.today();
      const now = this.clinicTimeService.nowDate();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const calculateScore = (s: ScheduleEntity): number => {
        const schedDate = s.scheduleDate;
        const startMin = parseTimeToMinutes(s.startTime);
        let endMin = parseTimeToMinutes(s.endTime);
        if (endMin <= startMin) endMin = 1440;

        if (schedDate === todayStr) {
          if (startMin <= currentMinutes && currentMinutes < endMin) {
            return 0;
          }
          if (currentMinutes < startMin) {
            return 10000 + (startMin - currentMinutes);
          }
          return 20000 + (currentMinutes - endMin);
        }

        const dateDiff = Math.abs(
          new Date(schedDate).getTime() - new Date(todayStr).getTime(),
        );
        const days = Math.round(dateDiff / (1000 * 60 * 60 * 24));
        if (schedDate > todayStr) {
          return 30000 + days * 1440 + startMin;
        }
        return 40000 + days * 1440;
      };

      results.sort((a, b) => calculateScore(a) - calculateScore(b));
    }

    return results;
  }
}
