import { Inject, Injectable } from '@nestjs/common';
import { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { parseTimeToMinutes } from '../../../schedules/domain/services/shift-duration.helper';
import {
  ATTENDANCE_STATUS,
  MILESTONE_STATUS,
  MILESTONE_STATUS_LABELS,
} from '../../domain/constants/attendance.constants';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';
import { AttendanceRosterCandidateResolver } from '../../domain/services/attendance-roster-candidate.resolver';
import type {
  AttendanceMilestoneStatus,
  StaffAttendanceMilestone,
} from '../../domain/types/attendance-milestone.type';

export interface GetStaffAttendanceMilestonesQuery {
  staffProfileId: string;
  date?: string;
}

@Injectable()
export class GetStaffAttendanceMilestonesUseCase {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
    private readonly candidateResolver: AttendanceRosterCandidateResolver,
    private readonly clinicTimeService: ClinicTimeService,
    private readonly clinicConfigService: ClinicConfigService,
  ) {}

  async execute(
    query: GetStaffAttendanceMilestonesQuery,
  ): Promise<StaffAttendanceMilestone[]> {
    const { staffProfileId, date } = query;
    const targetDate = date
      ? this.clinicTimeService.normalizeDate(date)
      : this.clinicTimeService.today();

    const targetDateObj = new Date(targetDate + 'T12:00:00Z');
    const dow = targetDateObj.getDay();

    const todayStr = this.clinicTimeService.today();
    const nowTimeStr = this.clinicTimeService.getCurrentTimeString();
    const nowMinutes = parseTimeToMinutes(nowTimeStr);
    const now = this.clinicTimeService.nowDate();

    // 1. Resolve candidate sessions for this staff on targetDate
    const candidateResult = await this.candidateResolver.resolveCandidates(
      this.repo,
      {
        staffId: staffProfileId,
        targetDate,
        dow,
        nowTime: now,
      },
    );

    const candidateSessions = candidateResult.candidateSessions;
    if (candidateSessions.length === 0) {
      return [];
    }

    // 2. Fetch existing attendance records for this staff on targetDate
    const [attendanceRecords, onLeave, shiftLabelMap, attendanceConfig] =
      await Promise.all([
        this.repo.findAttendanceRecordsForStaffAndDate(
          staffProfileId,
          targetDate,
        ),
        this.repo.findApprovedLeave(staffProfileId, targetDate),
        this.repo.getAllShiftLabelsMap(),
        this.clinicConfigService.getAttendanceConfig(),
      ]);

    const windowBefore = attendanceConfig.checkInWindowMinutesBefore;

    // 3. Map candidate sessions into StaffAttendanceMilestones
    const milestones: StaffAttendanceMilestone[] = candidateSessions.map(
      (session) => {
        const matchingRecord = attendanceRecords.find(
          (rec) =>
            (session.sessionId && rec.sessionId === session.sessionId) ||
            rec.shift === session.shift,
        );

        const startsAt = session.startsAt || '00:00:00';
        const endsAt = session.endsAt || '24:00:00';
        const startMinutes = parseTimeToMinutes(startsAt);
        const endMinutes =
          endsAt === '24:00:00' || endsAt === '24:00'
            ? 1440
            : parseTimeToMinutes(endsAt);

        let status: AttendanceMilestoneStatus = MILESTONE_STATUS.UPCOMING;
        let isCurrentShift = false;

        if (matchingRecord) {
          const recStatus = matchingRecord.status;
          if (recStatus === ATTENDANCE_STATUS.PRESENT) {
            status = MILESTONE_STATUS.PRESENT;
          } else if (recStatus === ATTENDANCE_STATUS.LATE) {
            status = MILESTONE_STATUS.LATE;
          } else if (recStatus === ATTENDANCE_STATUS.LEAVE) {
            status = MILESTONE_STATUS.LEAVE;
          } else if (
            recStatus === ATTENDANCE_STATUS.ABSENT ||
            recStatus === ATTENDANCE_STATUS.MISSED
          ) {
            status = MILESTONE_STATUS.ABSENT;
          } else {
            status = MILESTONE_STATUS.PRESENT;
          }
        } else if (onLeave) {
          status = MILESTONE_STATUS.LEAVE;
        } else {
          // Compare current time vs shift boundaries
          if (targetDate < todayStr) {
            status = MILESTONE_STATUS.ABSENT;
          } else if (targetDate === todayStr) {
            if (nowMinutes >= endMinutes) {
              status = MILESTONE_STATUS.ABSENT;
            } else if (
              nowMinutes >= startMinutes - windowBefore &&
              nowMinutes < endMinutes
            ) {
              status = MILESTONE_STATUS.ONGOING;
              isCurrentShift = true;
            } else {
              status = MILESTONE_STATUS.UPCOMING;
            }
          } else {
            status = MILESTONE_STATUS.UPCOMING;
          }
        }

        const shiftLabel =
          (session.sessionId && shiftLabelMap.get(session.sessionId)) ||
          shiftLabelMap.get(session.shift) ||
          '';

        return {
          sessionId: session.sessionId,
          shiftCode: session.shift,
          shiftLabel,
          startsAt,
          endsAt,
          status,
          statusLabel: MILESTONE_STATUS_LABELS[status] || status,
          checkInAt: matchingRecord?.checkInAt
            ? matchingRecord.checkInAt.toISOString()
            : null,
          checkOutAt: matchingRecord?.checkOutAt
            ? matchingRecord.checkOutAt.toISOString()
            : null,
          lateMinutes: matchingRecord?.lateMinutes ?? null,
          validatedDurationHours: matchingRecord?.validatedDurationHours
            ? Number(matchingRecord.validatedDurationHours)
            : null,
          attendanceRecordId: matchingRecord?.id ?? null,
          notes: matchingRecord?.notes ?? null,
          isCurrentShift,
        };
      },
    );

    // 4. Sort milestones by startsAt ascending
    return milestones.sort(
      (a, b) => parseTimeToMinutes(a.startsAt) - parseTimeToMinutes(b.startsAt),
    );
  }
}
