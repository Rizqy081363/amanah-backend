import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  queueTickets,
  sessionDefs,
  sessionSchedules,
} from '../../../../database/schema';
import { DB_APPOINTMENT_STATUS } from '../../../appointments/domain/constants/appointment-lifecycle.constants';
import { AppointmentProposalService } from '../../../appointments/application/services/appointment-proposal.service';

export interface PreAssignmentCapacityResult {
  isOvercapacity: boolean;
  type: 'THEORETICAL_OVERCAPACITY' | 'NORMAL';
  activeCount: number;
  nominalCapacity: number;
  sessionDurationMinutes: number;
}

export interface OperationalOverflowEvaluation {
  appointmentId: string;
  ticketId: string;
  isOverflowing: boolean;
  projectedEnd: Date;
  sessionEndBoundary: Date;
  toleranceMinutes: number;
}

@Injectable()
export class QueueOvercapacityDetectorService {
  private readonly logger = new Logger(QueueOvercapacityDetectorService.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly clinicConfigService: ClinicConfigService,
    @Optional()
    private readonly proposalService?: AppointmentProposalService,
  ) {}

  /**
   * Perspective A: Pre-Assignment Capacity Evaluation
   */
  async evaluatePreAssignmentCapacity(params: {
    serviceDate: string;
    sessionId: string;
  }): Promise<PreAssignmentCapacityResult> {
    const { serviceDate, sessionId } = params;

    const [durationPriorMinutes, [sessionDefRow]] = await Promise.all([
      this.clinicConfigService
        .getNumber('duration.prior_minutes')
        .catch(() => 30),
      this.db
        .select({
          startsAt: sessionDefs.defaultStartsAt,
          endsAt: sessionDefs.defaultEndsAt,
        })
        .from(sessionDefs)
        .where(eq(sessionDefs.id, sessionId))
        .limit(1),
    ]);

    if (!sessionDefRow) {
      return {
        isOvercapacity: false,
        type: 'NORMAL',
        activeCount: 0,
        nominalCapacity: 0,
        sessionDurationMinutes: 0,
      };
    }

    const durationMinutes = this.calculateDurationMinutes(
      sessionDefRow.startsAt,
      sessionDefRow.endsAt,
    );
    const nominalCapacity = Math.max(
      1,
      Math.floor(durationMinutes / Math.max(5, durationPriorMinutes)),
    );

    // Count unassigned active appointments booked for this date and session
    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(appointments)
      .leftJoin(queueTickets, eq(queueTickets.appointmentId, appointments.id))
      .where(
        and(
          eq(appointments.scheduledDate, serviceDate),
          isNull(appointments.practitionerId),
          inArray(appointments.status, [
            DB_APPOINTMENT_STATUS.BOOKED,
            DB_APPOINTMENT_STATUS.WAITING,
          ]),
          eq(queueTickets.sessionId, sessionId),
        ),
      );

    const activeCount = countRow?.count || 0;
    const isOvercapacity = activeCount > nominalCapacity;

    return {
      isOvercapacity,
      type: isOvercapacity ? 'THEORETICAL_OVERCAPACITY' : 'NORMAL',
      activeCount,
      nominalCapacity,
      sessionDurationMinutes: durationMinutes,
    };
  }

  /**
   * Perspective B: Active Operational Session Capacity Reconciliation
   * Evaluates simulated tickets against session closing boundary + tolerance.
   * If recovered, automatically withdraws pending proposals to prevent notification flapping!
   */
  async reconcileOperationalSessionOverflow(params: {
    serviceDate: string;
    sessionId: string;
    sessionEndBoundary: Date;
    projections: Array<{
      ticketId: string;
      appointmentId: string;
      projectedEnd: Date;
    }>;
  }): Promise<OperationalOverflowEvaluation[]> {
    const { sessionEndBoundary, projections } = params;
    const toleranceMinutes = await this.clinicConfigService
      .getNumber('queue.overflow_tolerance_minutes')
      .catch(() => 30);

    const toleranceBoundaryMs =
      sessionEndBoundary.getTime() + toleranceMinutes * 60_000;
    const results: OperationalOverflowEvaluation[] = [];

    for (const proj of projections) {
      const isOverflowing =
        proj.projectedEnd.getTime() > toleranceBoundaryMs;

      results.push({
        appointmentId: proj.appointmentId,
        ticketId: proj.ticketId,
        isOverflowing,
        projectedEnd: proj.projectedEnd,
        sessionEndBoundary,
        toleranceMinutes,
      });

      // Operational Recovery: If previously projected to overflow but now within boundaries,
      // withdraw any pending proposal created for this appointment!
      if (!isOverflowing && this.proposalService) {
        await this.proposalService.withdrawObsoleteProposals(
          proj.appointmentId,
          'Antrean telah memadat dan pulih secara operasional. Pasien dapat dilayani di sesi semula.',
        );
      }
    }

    return results;
  }

  private calculateDurationMinutes(
    startsAt: string,
    endsAt: string,
  ): number {
    const [sH, sM] = startsAt.split(':').map(Number);
    const [eH, eM] = endsAt.split(':').map(Number);
    let diffMinutes = eH * 60 + eM - (sH * 60 + sM);
    if (diffMinutes < 0) diffMinutes += 24 * 60; // Cross-midnight shift
    return diffMinutes;
  }
}
