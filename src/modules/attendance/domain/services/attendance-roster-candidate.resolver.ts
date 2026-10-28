import { Injectable } from '@nestjs/common';
import { AttendanceRepository } from '../repositories/attendance.repository';
import { CandidateScheduledSession } from './attendance-session.resolver';

export interface ResolveCandidateOptions {
  staffId: string;
  targetDate: string;
  dow: number;
  isAdministrativeEntry?: boolean;
  requestedShift?: string;
  requestedSessionId?: string | null;
  nowTime?: number | string | Date;
}

export interface CandidateResolutionResult {
  candidateSessions: CandidateScheduledSession[];
  claimedReplacementId: string | null;
}

/**
 * Pure domain service for resolving schedulable session candidates
 * based on the authoritative hierarchy:
 * 1. Claimed replacement shift (replacement_opportunities)
 * 2. Doctor assignments (if doctor) or Staff individual roster (staff_rosters)
 * 3. Clinic Master Weekly Operational Template (session_schedules) as baseline if worker has no custom individual roster
 * 4. Daily Admin Overrides (shift_exceptions) for leave/extra shifts
 * 5. Administrative manual entry fallback (if isAdministrativeEntry and no schedule exists)
 */
@Injectable()
export class AttendanceRosterCandidateResolver {
  async resolveCandidates(
    repo: AttendanceRepository,
    options: ResolveCandidateOptions,
  ): Promise<CandidateResolutionResult> {
    const {
      staffId,
      targetDate,
      dow,
      isAdministrativeEntry = false,
      requestedShift,
      requestedSessionId,
      nowTime = new Date(),
    } = options;

    const candidateSessions: CandidateScheduledSession[] = [];

    // 1. Tier 1: Claimed Replacement Shift
    const claimedReplacement = await repo.findClaimedReplacement(
      staffId,
      targetDate,
    );
    if (claimedReplacement) {
      const repSession = await repo.findClaimedReplacementSession(
        claimedReplacement.id,
        dow,
      );
      if (repSession) {
        candidateSessions.push({
          ...repSession,
          isReplacement: true,
          replacementOpportunityId: claimedReplacement.id,
        });
      }
    }

    // 2. Tier 2: Check for individual custom rosters (Doctor or Staff)
    const isDoctorWithRoster = await repo.hasCustomDoctorRoster(staffId);
    if (isDoctorWithRoster) {
      const doctorSessions =
        await repo.findDoctorAssignmentsForDowDetailed(staffId, dow);
      for (const s of doctorSessions) {
        if (!candidateSessions.some((c) => c.sessionId === s.sessionId)) {
          candidateSessions.push(s);
        }
      }
    } else {
      const hasCustomStaffRoster = await repo.hasCustomStaffRoster(staffId);
      if (hasCustomStaffRoster) {
        const staffSessions = await repo.findStaffRostersForDowDetailed(
          staffId,
          dow,
        );
        for (const s of staffSessions) {
          if (!candidateSessions.some((c) => c.sessionId === s.sessionId)) {
            candidateSessions.push(s);
          }
        }
      } else {
        // 3. Tier 3: Clinic Master Weekly Operational Template (session_schedules)
        // Baseline for workers without custom rosters
        const weeklyTemplateSessions =
          await repo.findClinicWeeklyTemplateForDow(dow);
        for (const s of weeklyTemplateSessions) {
          if (!candidateSessions.some((c) => c.sessionId === s.sessionId)) {
            candidateSessions.push(s);
          }
        }
      }
    }

    // 4. Daily Admin Overrides (shift_exceptions)
    const shiftExceptions = await repo.findDoctorShiftExceptions(
      staffId,
      targetDate,
    );
    for (const exc of shiftExceptions) {
      if (exc.type === 'leave') {
        if (exc.sessionId) {
          const idx = candidateSessions.findIndex(
            (c) => c.sessionId === exc.sessionId,
          );
          if (idx !== -1) {
            candidateSessions.splice(idx, 1);
          }
        } else {
          // Whole-day leave override
          candidateSessions.length = 0;
        }
      } else if (exc.type === 'extra' && exc.sessionId) {
        if (!candidateSessions.some((c) => c.sessionId === exc.sessionId)) {
          candidateSessions.push({
            id: exc.id,
            sessionId: exc.sessionId,
            shift: exc.shift || 'extra',
            startsAt: exc.startsAt || null,
            endsAt: exc.endsAt || null,
          });
        }
      }
    }

    // 5. Tier 5: Administrative Manual Entry Fallback (When no schedule exists in DB)
    if (isAdministrativeEntry && candidateSessions.length === 0) {
      const fallbackDef = requestedShift
        ? await repo.resolveSessionDefByCode(requestedShift)
        : (await repo.resolveSessionDefById(requestedSessionId || '')) ||
          (await repo.resolveSessionDefByTime(nowTime));

      if (fallbackDef) {
        candidateSessions.push({
          id: fallbackDef.id,
          sessionId: fallbackDef.id,
          shift: fallbackDef.code,
          startsAt: fallbackDef.defaultStartsAt,
          endsAt: fallbackDef.defaultEndsAt || '24:00:00',
        });
      }
    }

    return {
      candidateSessions,
      claimedReplacementId: claimedReplacement ? claimedReplacement.id : null,
    };
  }
}
