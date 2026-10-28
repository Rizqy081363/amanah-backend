import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  doctorAssignments,
  practitioners,
  shiftExceptions,
  staffAttendanceRecords,
  staffLeaveRequests,
} from '@database/schema';
import { replacementOpportunities } from '@database/schema/leave-payroll.schema';
import type { ClinicalPractitionerEntity } from '@modules/schedules/domain/entities/schedule.entity';
import { ScheduleRecordMapper } from '@modules/schedules/infrastructure/drizzle/mappers/schedule-record.mapper';
import type { ClinicalPractitionersQueryDto } from '@modules/schedules/presentation/dto/clinical-practitioners-query.dto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, isNull, lte, or } from 'drizzle-orm';

@Injectable()
export class DrizzleClinicalPractitionerRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async findClinicalPractitioners(
    query: ClinicalPractitionersQueryDto,
  ): Promise<ClinicalPractitionerEntity[]> {
    const targetDate = query.date || new Date().toISOString().slice(0, 10);
    const targetDow = new Date(targetDate).getDay();

    const pracs = await this.db.query.practitioners.findMany({
      where: eq(practitioners.isAcceptingAppointments, true),
      with: {
        staffProfile: {
          with: {
            clinicUnit: true,
          },
        },
        medicalSpecialty: true,
        clinicRoom: true,
      },
      orderBy: [asc(practitioners.displayName)],
    });

    const results: ClinicalPractitionerEntity[] = [];

    for (const p of pracs) {
      const spec =
        p.medicalSpecialty?.name ||
        p.staffProfile?.clinicUnit?.name ||
        p.staffProfile?.positionTitle ||
        '';

      if (query.service) {
        const q = query.service.toLowerCase();
        const matchService =
          spec.toLowerCase().includes(q) ||
          (p.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!matchService) continue;
      }

      const [
        activeLeave,
        assignedRoster,
        extraShift,
        approvedLeave,
        claimedByMe,
        attendanceRecord,
      ] = await Promise.all([
        this.db.query.shiftExceptions.findFirst({
          where: and(
            eq(shiftExceptions.doctorId, p.id),
            eq(shiftExceptions.serviceDate, targetDate),
            eq(shiftExceptions.type, 'leave'),
          ),
        }),
        this.db.query.doctorAssignments.findFirst({
          where: and(
            eq(doctorAssignments.doctorId, p.id),
            eq(doctorAssignments.isActive, true),
            or(
              eq(doctorAssignments.dow, targetDow),
              isNull(doctorAssignments.dow),
            ),
          ),
        }),
        this.db.query.shiftExceptions.findFirst({
          where: and(
            eq(shiftExceptions.doctorId, p.id),
            eq(shiftExceptions.serviceDate, targetDate),
            eq(shiftExceptions.type, 'extra'),
          ),
        }),
        this.db.query.staffLeaveRequests.findFirst({
          where: and(
            or(
              eq(staffLeaveRequests.practitionerId, p.id),
              eq(staffLeaveRequests.staffProfileId, p.staffProfileId || ''),
            ),
            eq(staffLeaveRequests.status, 'approved'),
            lte(staffLeaveRequests.startDate, targetDate),
            gte(staffLeaveRequests.endDate, targetDate),
          ),
        }),
        this.db.query.replacementOpportunities.findFirst({
          where: and(
            eq(replacementOpportunities.workDate, targetDate),
            eq(replacementOpportunities.claimedByPractitionerId, p.id),
            eq(replacementOpportunities.status, 'claimed'),
          ),
          with: {
            originalStaffProfile: true,
          },
        }),
        p.staffProfileId
          ? this.db.query.staffAttendanceRecords.findFirst({
              where: and(
                eq(staffAttendanceRecords.staffProfileId, p.staffProfileId),
                eq(staffAttendanceRecords.attendanceDate, targetDate),
              ),
            })
          : Promise.resolve(null),
      ]);

      const isOnLeave = Boolean(activeLeave || approvedLeave);
      const leaveReason =
        approvedLeave?.reason ||
        activeLeave?.note ||
        null;
      const isReplacement = Boolean(claimedByMe);
      const replacingPractitionerName =
        claimedByMe?.originalStaffProfile?.fullName || null;

      const isAvailable =
        !isOnLeave &&
        (Boolean(assignedRoster) || Boolean(extraShift) || isReplacement);
      const location = p.clinicRoom
        ? `${p.clinicRoom.name}${p.clinicRoom.location ? `, ${p.clinicRoom.location}` : ''}`
        : p.staffProfile?.clinicUnit?.name || '';

      const todayStr = new Date().toISOString().slice(0, 10);
      let attendanceStatus:
        | 'checked_in'
        | 'not_checked_in'
        | 'late'
        | 'on_leave'
        | 'absent' = 'not_checked_in';
      let checkInAt: string | null = null;
      let attendanceWarning: string | null = null;

      if (isOnLeave) {
        attendanceStatus = 'on_leave';
      } else if (attendanceRecord) {
        if (
          attendanceRecord.status === 'present' ||
          attendanceRecord.status === 'late'
        ) {
          attendanceStatus = 'checked_in';
          checkInAt = attendanceRecord.checkInAt;
        } else if (
          attendanceRecord.status === 'absent' ||
          attendanceRecord.status === 'missed'
        ) {
          attendanceStatus = 'absent';
          if (targetDate === todayStr) {
            attendanceWarning = 'Dokter belum melakukan presensi hari ini';
          }
        }
      } else {
        if (targetDate === todayStr && isAvailable) {
          attendanceWarning = 'Dokter belum melakukan presensi hari ini';
        }
      }

      results.push({
        id: p.id,
        name: p.staffProfile?.fullName || p.displayName || '',
        spec,
        avatar: ScheduleRecordMapper.toAvatarUrl(p.staffProfile),
        location,
        rating: p.rating ? String(p.rating) : '5.0',
        tags: p.tags?.length ? p.tags : [spec],
        schedule: 'Senin - Sabtu (07:30 - 17:30)',
        is_available: isAvailable,
        is_on_leave: isOnLeave,
        leave_reason: leaveReason,
        is_replacement: isReplacement,
        replacing_practitioner_name: replacingPractitionerName,
        attendance_status: attendanceStatus,
        check_in_at: checkInAt,
        attendance_warning: attendanceWarning,
      });
    }

    return results;
  }
}
