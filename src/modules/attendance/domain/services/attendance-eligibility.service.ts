import { Inject, Injectable } from '@nestjs/common';
import {
  SessionMismatchException,
  StaffNotRosteredException,
  StaffOnLeaveException,
} from '../errors/attendance-domain.errors';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../repositories/attendance.repository';

export interface EligibilityResult {
  isEligible: boolean;
  isReplacement: boolean;
  replacementOpportunityId: string | null;
}

@Injectable()
export class AttendanceEligibilityService {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
  ) {}

  async verifyEligibility(params: {
    staffId: string;
    targetDate: string;
    dow: number;
    resolvedSessionId?: string | null;
    isAdministrativeEntry?: boolean;
  }): Promise<EligibilityResult> {
    const {
      staffId,
      targetDate,
      dow,
      resolvedSessionId,
      isAdministrativeEntry = false,
    } = params;

    // 1. Leave Check: Staff must not be on an approved leave
    const onLeave = await this.repo.findApprovedLeave(staffId, targetDate);
    if (onLeave) {
      throw new StaffOnLeaveException();
    }

    // 2. Replacement Check: Check if staff claimed an approved replacement shift for today
    const claimedReplacement = await this.repo.findClaimedReplacement(
      staffId,
      targetDate,
    );

    if (claimedReplacement) {
      return {
        isEligible: true,
        isReplacement: true,
        replacementOpportunityId: claimedReplacement.id,
      };
    }

    // 3. Regular Roster Schedule Check
    const [staffRosters, doctorAssignments] = await Promise.all([
      this.repo.findStaffRostersForDow(staffId, dow),
      this.repo.findDoctorAssignmentsForDow(staffId, dow),
    ]);

    const hasRosterToday =
      staffRosters.length > 0 || doctorAssignments.length > 0;

    if (!hasRosterToday) {
      if (isAdministrativeEntry) {
        return {
          isEligible: true,
          isReplacement: false,
          replacementOpportunityId: null,
        };
      }
      throw new StaffNotRosteredException();
    }

    // 4. Session Def Match (if session is resolved)
    if (resolvedSessionId && !isAdministrativeEntry) {
      const matchesSession =
        staffRosters.some((r) => r.sessionId === resolvedSessionId) ||
        doctorAssignments.some((d) => d.sessionId === resolvedSessionId);

      if (!matchesSession) {
        throw new SessionMismatchException();
      }
    }

    return {
      isEligible: true,
      isReplacement: false,
      replacementOpportunityId: null,
    };
  }
}
