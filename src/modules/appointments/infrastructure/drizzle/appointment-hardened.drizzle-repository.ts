import { ClinicConfigService } from '@common/clinic-config';
import { ClinicTimeService } from '@common/time/clinic-time.service';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  appointmentStatusEvents,
  queueTickets,
  sessionDefs,
} from '../../../../database/schema';
import { QueuePositionRecalculationService } from '../../../queue-engine/application/services/queue-position-recalculation.service';
import { CLINIC_POLICY_FALLBACK_CONFIG } from '../../../schedules/domain/constants/schedule.constants';
import { SchedulePolicyReader } from '../../../schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import type {
  AppointmentFilter,
  AppointmentListResult,
  AppointmentRepositoryPort,
  CreateAppointmentInput,
  TransitionStatusInput,
} from '../../application/ports/appointment-repository.port';
import { TIME_CONSTANTS } from '../../domain/constants/appointment-check-in.config';
import {
  DB_APPOINTMENT_STATUS,
  DOMAIN_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/appointment-lifecycle.constants';
import {
  AppointmentMissingDoctorError,
  AppointmentMissingRoomError,
  AppointmentNotCallableError,
  AppointmentNotCheckedInError,
  AppointmentNotFoundError,
  AppointmentQueueTurnNotReachedError,
  DoctorAlreadyServingError,
  StaleStatusError,
} from '../../domain/errors/appointment-domain.errors';
import { computeConsultationMetrics } from '../../domain/helpers/consultation-duration.helper';
import { isAppointmentWithinCheckInWindow } from '../../domain/services/appointment-check-in-window.predicate';
import {
  type AppointmentRecord,
  resolveAllowedActions,
  toDbStatus,
  toDomainStatus,
} from '../../domain/types/appointment.types';

@Injectable()
export class AppointmentHardenedDrizzleRepository
  implements AppointmentRepositoryPort
{
  private cachedDurationMinutes: number | null = null;

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly clinicTimeService: ClinicTimeService,
    @Optional()
    private readonly clinicConfig?: ClinicConfigService,
    private readonly policyReader?: SchedulePolicyReader,
    @Optional()
    private readonly queuePositionRecalculationService?: QueuePositionRecalculationService,
  ) {}

  private async getPolicyDurationMinutes(): Promise<number> {
    if (this.cachedDurationMinutes !== null) {
      return this.cachedDurationMinutes;
    }
    if (this.clinicConfig) {
      try {
        const policy = await this.clinicConfig.getSchedulePolicy();
        this.cachedDurationMinutes = policy.defaultConsultationDurationMinutes;
        return this.cachedDurationMinutes;
      } catch {}
    }
    if (this.policyReader) {
      try {
        const policy = await this.policyReader.getClinicSchedulePolicy();
        this.cachedDurationMinutes = policy.durationMinutes;
        return this.cachedDurationMinutes;
      } catch {}
    }
    this.cachedDurationMinutes =
      CLINIC_POLICY_FALLBACK_CONFIG.consultationDurationMinutes;
    return this.cachedDurationMinutes;
  }

  async findById(id: string): Promise<AppointmentRecord | null> {
    const row = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, id),
      with: {
        patientProfile: {
          with: {
            user: true,
            patientAffiliations: { with: { user: true, relationshipType: true } },
          },
        },
        clinicService: true,
        clinicRoom: { with: { clinicUnit: true } },
        practitioner: {
          with: {
            staffProfile: { with: { user: true } },
            medicalSpecialty: true,
          },
        },
        queueTickets: { with: { sessionDef: true } },
        appointmentChangeProposals: true,
      },
    });

    if (!row) return null;
    const [durationMinutes, thresholds] = await Promise.all([
      this.getPolicyDurationMinutes(),
      this.getQueueThresholds(),
    ]);
    return this.mapToRecord(row, durationMinutes, thresholds);
  }

  async getNextQueueNumber(
    practitionerId: string,
    scheduledDate: string,
    tx?: unknown,
  ): Promise<number> {
    const client = (tx as DrizzleDatabase) || this.db;
    const [result] = await client
      .select({
        maxQueue: sql<number>`COALESCE(MAX(${appointments.queueNumber}), 0)`,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.practitionerId, practitionerId),
          eq(appointments.scheduledDate, scheduledDate),
        ),
      );

    return Number(result?.maxQueue || 0) + 1;
  }

  async createWithTiming(
    input: CreateAppointmentInput,
    tx?: unknown,
  ): Promise<AppointmentRecord> {
    const client = (tx as DrizzleDatabase) || this.db;
    let resolvedServiceId = input.serviceId;
    if (!resolvedServiceId) {
      const defaultService = await client.query.clinicServices.findFirst();
      resolvedServiceId = defaultService?.id || '';
    }

    const startTimeStr = input.estimatedStartAt.toISOString().substring(11, 19);
    const endTimeStr = input.estimatedEndAt.toISOString().substring(11, 19);

    const [inserted] = await client
      .insert(appointments)
      .values({
        bookingCode: input.bookingCode,
        patientId: input.patientId,
        practitionerId: input.practitionerId,
        serviceId: resolvedServiceId,
        roomId: input.roomId || null,
        scheduledDate: input.scheduledDate,
        scheduledStartTime: startTimeStr,
        scheduledEndTime: endTimeStr,
        queueNumber: input.queueNumber,
        status: DB_APPOINTMENT_STATUS.WAITING,
        estimatedStartAt: input.estimatedStartAt.toISOString(),
        estimatedEndAt: input.estimatedEndAt.toISOString(),
        complaint: input.notes || null,
      })
      .returning();

    try {
      if (resolvedServiceId) {
        await client.insert(queueTickets).values({
          appointmentId: inserted.id,
          serviceId: resolvedServiceId,
          roomId: input.roomId || null,
          queueDate: input.scheduledDate,
          queueNumber: String(input.queueNumber),
          status: QUEUE_TICKET_STATUS.WAITING,
          priority: 'regular',
          waitingPosition: input.queueNumber,
        });
      }
    } catch {}

    const full = await this.findById(inserted.id);
    return full!;
  }

  async updateLastCalledAt(
    id: string,
    calledAt: Date,
  ): Promise<AppointmentRecord> {
    const [updated] = await this.db
      .update(appointments)
      .set({
        lastCalledAt: calledAt.toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(appointments.id, id),
          inArray(appointments.status, [
            DB_APPOINTMENT_STATUS.WAITING,
            DB_APPOINTMENT_STATUS.BOOKED,
            DB_APPOINTMENT_STATUS.CHECKED_IN,
          ] as any),
        ),
      )
      .returning();

    if (!updated) {
      const existing = await this.db.query.appointments.findFirst({
        where: eq(appointments.id, id),
      });
      if (!existing) {
        throw new AppointmentNotFoundError(id);
      }
      throw new AppointmentNotCallableError(id, existing.status);
    }

    try {
      await this.db
        .update(queueTickets)
        .set({
          calledAt: calledAt.toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(queueTickets.appointmentId, id));
    } catch {}

    const full = await this.findById(id);
    return full!;
  }

  async transitionStatus(
    input: TransitionStatusInput,
  ): Promise<AppointmentRecord> {
    const targetDbStatus = toDbStatus(input.targetStatus);

    if (targetDbStatus === DB_APPOINTMENT_STATUS.IN_SERVICE) {
      const existingRecord = await this.db.query.appointments.findFirst({
        where: eq(appointments.id, input.id),
      });
      if (!existingRecord) {
        throw new AppointmentNotFoundError(input.id);
      }
      if (!existingRecord.practitionerId) {
        throw new AppointmentMissingDoctorError(
          input.id,
          'memulai pemeriksaan pasien',
        );
      }
      if (!existingRecord.roomId) {
        throw new AppointmentMissingRoomError(
          input.id,
          'memulai pemeriksaan pasien',
        );
      }
      if (
        existingRecord.status === DB_APPOINTMENT_STATUS.BOOKED ||
        !existingRecord.checkedInAt
      ) {
        throw new AppointmentNotCheckedInError(input.id, existingRecord.status);
      }

      // 1. Guard against doctor concurrent examination (a doctor can only examine 1 patient at a time)
      const [activeServing] = await this.db
        .select({ id: appointments.id, queueNumber: appointments.queueNumber })
        .from(appointments)
        .where(
          and(
            eq(appointments.scheduledDate, existingRecord.scheduledDate),
            eq(appointments.practitionerId, existingRecord.practitionerId),
            eq(appointments.status, DB_APPOINTMENT_STATUS.IN_SERVICE),
            ne(appointments.id, input.id),
          ),
        )
        .limit(1);

      if (activeServing) {
        throw new DoctorAlreadyServingError(
          existingRecord.practitionerId,
          activeServing.queueNumber ?? 1,
        );
      }

      // 2. Guard against queue jumping (earlier queue position under this doctor must be served first)
      const currentQueueNum = Number(existingRecord.queueNumber ?? 1);
      const [earlierWaiting] = await this.db
        .select({ id: appointments.id, queueNumber: appointments.queueNumber })
        .from(appointments)
        .where(
          and(
            eq(appointments.scheduledDate, existingRecord.scheduledDate),
            eq(appointments.practitionerId, existingRecord.practitionerId),
            inArray(appointments.status, [
              DB_APPOINTMENT_STATUS.WAITING,
              DB_APPOINTMENT_STATUS.CHECKED_IN,
            ]),
            lt(appointments.queueNumber, currentQueueNum),
            ne(appointments.id, input.id),
          ),
        )
        .orderBy(asc(appointments.queueNumber))
        .limit(1);

      if (earlierWaiting) {
        throw new AppointmentQueueTurnNotReachedError(
          input.id,
          existingRecord.queueNumber ?? 1,
          earlierWaiting.queueNumber ?? 1,
        );
      }
    }

    const allowedStatuses =
      input.targetStatus === DOMAIN_APPOINTMENT_STATUS.IN_SERVICE
        ? [DB_APPOINTMENT_STATUS.WAITING, DB_APPOINTMENT_STATUS.CHECKED_IN]
        : input.expectedStatus === DOMAIN_APPOINTMENT_STATUS.WAITING
          ? [
              DB_APPOINTMENT_STATUS.WAITING,
              DB_APPOINTMENT_STATUS.BOOKED,
              DB_APPOINTMENT_STATUS.CHECKED_IN,
            ]
          : input.expectedStatus === DOMAIN_APPOINTMENT_STATUS.IN_SERVICE
            ? [DB_APPOINTMENT_STATUS.IN_SERVICE]
            : [];

    const updatePayload: Record<string, any> = {
      status: targetDbStatus,
      updatedAt: new Date().toISOString(),
    };

    if (input.actualStartedAt) {
      updatePayload.actualStartedAt = input.actualStartedAt.toISOString();
      updatePayload.startedAt = input.actualStartedAt.toISOString();
    }
    if (input.actualCompletedAt) {
      updatePayload.actualCompletedAt = input.actualCompletedAt.toISOString();
      updatePayload.completedAt = input.actualCompletedAt.toISOString();
    }
    if (input.cancelledAt) {
      updatePayload.cancelledAt = input.cancelledAt.toISOString();
    }
    if (input.cancellationReason) {
      updatePayload.cancelReason = input.cancellationReason;
    }

    const [updated] = await this.db
      .update(appointments)
      .set(updatePayload)
      .where(
        and(
          eq(appointments.id, input.id),
          inArray(appointments.status, allowedStatuses as any),
        ),
      )
      .returning();

    if (!updated) {
      const existing = await this.db.query.appointments.findFirst({
        where: eq(appointments.id, input.id),
      });
      if (!existing) {
        throw new AppointmentNotFoundError(input.id);
      }
      throw new StaleStatusError(
        input.id,
        input.expectedStatus,
        existing.status,
      );
    }

    try {
      const ticketStatus =
        targetDbStatus === DB_APPOINTMENT_STATUS.IN_SERVICE
          ? QUEUE_TICKET_STATUS.IN_SERVICE
          : targetDbStatus === DB_APPOINTMENT_STATUS.COMPLETED
            ? QUEUE_TICKET_STATUS.COMPLETED
            : targetDbStatus === DB_APPOINTMENT_STATUS.CANCELLED
              ? QUEUE_TICKET_STATUS.CANCELLED
              : targetDbStatus === DB_APPOINTMENT_STATUS.LATE
                ? QUEUE_TICKET_STATUS.SKIPPED
                : QUEUE_TICKET_STATUS.WAITING;

      const updateTicketPayload: Record<string, any> = {
        status: ticketStatus as any,
        updatedAt: new Date().toISOString(),
      };
      if (
        targetDbStatus === DB_APPOINTMENT_STATUS.IN_SERVICE &&
        input.actualStartedAt
      ) {
        updateTicketPayload.startedAt = input.actualStartedAt.toISOString();
      }
      if (
        targetDbStatus === DB_APPOINTMENT_STATUS.COMPLETED &&
        input.actualCompletedAt
      ) {
        updateTicketPayload.completedAt = input.actualCompletedAt.toISOString();
      }
      if (
        targetDbStatus === DB_APPOINTMENT_STATUS.CANCELLED ||
        targetDbStatus === DB_APPOINTMENT_STATUS.COMPLETED
      ) {
        updateTicketPayload.waitingPosition = null;
      }

      await this.db
        .update(queueTickets)
        .set(updateTicketPayload)
        .where(eq(queueTickets.appointmentId, input.id));
    } catch {}

    if (this.queuePositionRecalculationService && updated) {
      await this.queuePositionRecalculationService
        .recalculateDoctorQueue({
          serviceDate: updated.scheduledDate,
          practitionerId: updated.practitionerId,
        })
        .catch(() => {});
    }

    const full = await this.findById(input.id);
    return full!;
  }

  async sweepLateness(threshold: Date, now: Date = new Date()): Promise<number> {
    const graceMinutes = this.clinicConfig
      ? await this.clinicConfig
          .getNumber('queue.no_show_grace_minutes')
          .catch(() => 10)
      : 10;

    const nowIso = now.toISOString();
    const todayDate = nowIso.slice(0, 10);

    // 1. Phase 1: Close finished sessions / elapsed operating days -> NO_SHOW (Not CANCELLED)
    // Any appointment still in BOOKED or LATE whose session has officially ended
    // (+ grace minutes) or whose scheduled date has completely passed transitions to NO_SHOW.
    const noShowCandidates = await this.db
      .select({
        id: appointments.id,
        scheduledDate: appointments.scheduledDate,
        practitionerId: appointments.practitionerId,
        status: appointments.status,
      })
      .from(appointments)
      .leftJoin(queueTickets, eq(queueTickets.appointmentId, appointments.id))
      .leftJoin(sessionDefs, eq(sessionDefs.id, queueTickets.sessionId))
      .where(
        and(
          inArray(appointments.status, [
            DB_APPOINTMENT_STATUS.BOOKED,
            DB_APPOINTMENT_STATUS.LATE,
          ] as any),
          or(
            lt(appointments.scheduledDate, todayDate),
            and(
              eq(appointments.scheduledDate, todayDate),
              sql`(${appointments.scheduledDate} || ' ' || COALESCE(${sessionDefs.defaultEndsAt}, ${appointments.scheduledEndTime}, '23:59:59'))::timestamptz + (${graceMinutes} * interval '1 minute') <= ${nowIso}::timestamptz`,
            ),
          ),
        ),
      );

    const noShowIds = noShowCandidates.map((c) => c.id);

    if (noShowIds.length > 0) {
      await this.db
        .update(appointments)
        .set({
          status: DB_APPOINTMENT_STATUS.NO_SHOW,
          updatedAt: nowIso,
        })
        .where(inArray(appointments.id, noShowIds));

      await this.db
        .update(queueTickets)
        .set({
          status: QUEUE_TICKET_STATUS.SKIPPED,
          waitingPosition: null,
          updatedAt: nowIso,
        })
        .where(inArray(queueTickets.appointmentId, noShowIds));

      await this.db.insert(appointmentStatusEvents).values(
        noShowCandidates.map((c) => ({
          appointmentId: c.id,
          previousStatus: c.status as any,
          newStatus: DB_APPOINTMENT_STATUS.NO_SHOW as any,
          reason:
            'Tidak hadir (No-Show): sesi operasional klinik telah berakhir tanpa kehadiran pasien',
        })),
      );
    }

    // 2. Phase 2: Overdue Check-In during active session -> LATE
    // Only BOOKED appointments whose arrival time has passed tolerance window, but whose session is STILL ACTIVE.
    // They are marked LATE and demoted to queue tail, giving them the chance to check in when they arrive.
    const lateCandidates = await this.db
      .select({
        id: appointments.id,
        scheduledDate: appointments.scheduledDate,
        practitionerId: appointments.practitionerId,
        status: appointments.status,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.status, DB_APPOINTMENT_STATUS.BOOKED as any),
          sql`COALESCE(${appointments.estimatedStartAt}, (${appointments.scheduledDate} || ' ' || ${appointments.scheduledStartTime})::timestamptz) <= ${threshold.toISOString()}::timestamptz`,
          noShowIds.length > 0
            ? sql`${appointments.id} NOT IN (${sql.join(noShowIds.map((id) => sql`${id}`), sql`, `)})`
            : sql`TRUE`,
        ),
      );

    const toDemoteIds = lateCandidates.map((c) => c.id);

    if (toDemoteIds.length > 0) {
      await this.db
        .update(appointments)
        .set({
          status: DB_APPOINTMENT_STATUS.LATE,
          updatedAt: nowIso,
        })
        .where(inArray(appointments.id, toDemoteIds));

      await this.db.insert(appointmentStatusEvents).values(
        toDemoteIds.map((id) => ({
          appointmentId: id,
          previousStatus: DB_APPOINTMENT_STATUS.BOOKED as any,
          newStatus: DB_APPOINTMENT_STATUS.LATE as any,
          reason:
            'Terlambat hadir: melewati batas toleransi waktu kedatangan, digeser ke antrean belakang',
        })),
      );
    }

    const allAffected = [...noShowCandidates, ...lateCandidates];
    if (this.queuePositionRecalculationService && allAffected.length > 0) {
      await this.queuePositionRecalculationService
        .recalculatePartitions(
          allAffected.map((u) => ({
            serviceDate: u.scheduledDate,
            practitionerId: u.practitionerId,
          })),
        )
        .catch(() => {});
    }

    return allAffected.length;
  }

  async list(filter: AppointmentFilter): Promise<AppointmentListResult> {
    const conditions: any[] = [];

    if (filter.date) {
      conditions.push(eq(appointments.scheduledDate, filter.date));
    }
    if (filter.practitionerId) {
      conditions.push(eq(appointments.practitionerId, filter.practitionerId));
    }
    if (filter.patientId) {
      conditions.push(eq(appointments.patientId, filter.patientId));
    }
    if (filter.status) {
      if (filter.status === DOMAIN_APPOINTMENT_STATUS.WAITING) {
        conditions.push(
          inArray(appointments.status, [
            DB_APPOINTMENT_STATUS.WAITING,
            DB_APPOINTMENT_STATUS.BOOKED,
            DB_APPOINTMENT_STATUS.CHECKED_IN,
          ] as any),
        );
      } else {
        conditions.push(
          eq(appointments.status, toDbStatus(filter.status) as any),
        );
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filter.page && filter.page > 0 ? filter.page : 1;
    const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;
    const offset = (page - 1) * limit;

    const [countResult] = await this.db
      .select({ total: count() })
      .from(appointments)
      .where(whereClause);

    const rows = await this.db.query.appointments.findMany({
      where: whereClause,
      limit,
      offset,
      orderBy: [asc(appointments.queueNumber), desc(appointments.createdAt)],
      with: {
        patientProfile: {
          with: {
            user: true,
            patientAffiliations: { with: { user: true, relationshipType: true } },
          },
        },
        clinicService: true,
        clinicRoom: { with: { clinicUnit: true } },
        practitioner: {
          with: {
            staffProfile: { with: { user: true } },
            medicalSpecialty: true,
          },
        },
        queueTickets: { with: { sessionDef: true } },
        appointmentChangeProposals: true,
      },
    });

    const [durationMinutes, thresholds] = await Promise.all([
      this.getPolicyDurationMinutes(),
      this.getQueueThresholds(),
    ]);
    return {
      items: rows.map((r) => this.mapToRecord(r, durationMinutes, thresholds)),
      total: Number(countResult?.total || 0),
    };
  }

  private async getQueueThresholds(): Promise<
    | { arriveEarlyMinutes: number; overflowToleranceMinutes: number }
    | undefined
  > {
    if (this.clinicConfig) {
      try {
        return await this.clinicConfig.getQueueThresholds();
      } catch {}
    }
    return undefined;
  }

  private mapToRecord(
    apt: any,
    fallbackDurationMinutes?: number,
    checkInThresholds?: {
      arriveEarlyMinutes: number;
      overflowToleranceMinutes: number;
    },
  ): AppointmentRecord {
    const status = toDomainStatus(apt.status);
    const queueNumber = Number(
      apt.queueNumber || apt.queueTickets?.[0]?.queueNumber || 1,
    );
    const estimatedStartAt = apt.estimatedStartAt
      ? new Date(apt.estimatedStartAt)
      : new Date(apt.createdAt);
    const durationMinutes =
      fallbackDurationMinutes ??
      this.cachedDurationMinutes ??
      CLINIC_POLICY_FALLBACK_CONFIG.consultationDurationMinutes;
    const estimatedEndAt = apt.estimatedEndAt
      ? new Date(apt.estimatedEndAt)
      : new Date(
          estimatedStartAt.getTime() +
            durationMinutes * TIME_CONSTANTS.MILLISECONDS_PER_MINUTE,
        );

    const primaryAffiliation = apt.patientProfile?.patientAffiliations?.[0];
    const isAffiliated =
      !apt.patientProfile?.userId && Boolean(primaryAffiliation);
    const affiliationRelationship =
      primaryAffiliation?.relationLabel ||
      primaryAffiliation?.relationshipType ||
      null;
    const parentUserId =
      apt.patientProfile?.userId ||
      primaryAffiliation?.userId ||
      apt.createdBy ||
      null;
    const parentUserName =
      primaryAffiliation?.user?.name || primaryAffiliation?.user?.email || null;

    const patientUserId = apt.patientProfile?.userId || null;
    const directPatientAvatar =
      apt.patientProfile?.avatarUrl ||
      apt.patientProfile?.user?.avatarUrl ||
      null;
    const avatarUrl =
      directPatientAvatar ||
      (patientUserId ? `/api/v1/users/${patientUserId}/avatar` : null);

    const pendingProposal = apt.appointmentChangeProposals?.find(
      (p: any) => p.status === 'pending',
    );
    const hasPendingProposal = Boolean(pendingProposal);
    const pendingProposalId = pendingProposal?.id || null;
    const pendingProposalType = (pendingProposal?.proposalType as any) || null;
    const pendingProposalReason = pendingProposal?.reason || null;
    const pendingProposalCreatedAt = pendingProposal?.createdAt
      ? new Date(pendingProposal.createdAt)
      : null;
    const pendingProposalTargetDate = pendingProposal?.proposedDate || null;

    const settledProposal = apt.appointmentChangeProposals
      ?.filter((p: any) => p.status === 'accepted')
      ?.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const hasSettledProposal = Boolean(settledProposal);
    const settledProposalId = settledProposal?.id || null;
    const settledProposalType = (settledProposal?.proposalType as any) || null;

    let isOvercapacity = false;
    const sessionDef = apt.queueTickets?.[0]?.sessionDef;
    if (sessionDef?.defaultEndsAt && estimatedEndAt && apt.scheduledDate) {
      const endTimeStr =
        sessionDef.defaultEndsAt.length === 5
          ? `${sessionDef.defaultEndsAt}:00`
          : sessionDef.defaultEndsAt;
      const sessionEnd = new Date(
        `${apt.scheduledDate}T${endTimeStr}+07:00`,
      );
      const toleranceMs =
        (checkInThresholds?.overflowToleranceMinutes ?? 30) * 60_000;
      if (estimatedEndAt.getTime() > sessionEnd.getTime() + toleranceMs) {
        isOvercapacity = true;
      }
    }

    return {
      id: apt.id,
      bookingCode: apt.bookingCode || '',
      patientId: apt.patientId,
      patientUserId,
      createdBy: apt.createdBy || null,
      isAffiliated,
      affiliationRelationship,
      parentUserId,
      parentUserName,
      patientName: apt.patientProfile?.fullName || null,
      avatarUrl,
      practitionerId: apt.practitionerId,
      doctorName:
        apt.practitioner?.staffProfile?.fullName ||
        apt.practitioner?.name ||
        null,
      serviceId: apt.serviceId || null,
      serviceName: apt.clinicService?.name || null,
      poliklinikId: apt.clinicRoom?.unitId || null,
      poliklinikName: apt.clinicRoom?.clinicUnit?.name || null,
      roomId: apt.roomId || null,
      roomName: apt.clinicRoom?.name || null,
      scheduledDate: apt.scheduledDate,
      queueNumber,
      status,
      allowedActions: resolveAllowedActions(status, {
        hasDoctor: Boolean(apt.practitionerId || apt.practitioner),
        hasRoom: Boolean(apt.roomId || apt.clinicRoom),
        canCheckIn:
          status === DOMAIN_APPOINTMENT_STATUS.BOOKED &&
          apt.scheduledDate &&
          checkInThresholds
            ? isAppointmentWithinCheckInWindow({
                scheduledDate: apt.scheduledDate,
                scheduledStartTime: apt.scheduledStartTime,
                scheduledEndTime: apt.scheduledEndTime,
                todayDateStr: this.clinicTimeService.today(),
                currentTimeStr: this.clinicTimeService.getCurrentTimeString(),
                arriveEarlyMinutes: checkInThresholds.arriveEarlyMinutes,
                overflowToleranceMinutes:
                  checkInThresholds.overflowToleranceMinutes,
              }).isOpen
            : true,
      }),
      estimatedStartAt,
      estimatedEndAt,
      isOvercapacity,
      hasPendingProposal,
      pendingProposalId,
      pendingProposalType,
      pendingProposalReason,
      pendingProposalCreatedAt,
      pendingProposalTargetDate,
      hasSettledProposal,
      settledProposalId,
      settledProposalType,
      actualStartedAt: apt.actualStartedAt
        ? new Date(apt.actualStartedAt)
        : apt.startedAt
          ? new Date(apt.startedAt)
          : null,
      actualCompletedAt: apt.actualCompletedAt
        ? new Date(apt.actualCompletedAt)
        : apt.completedAt
          ? new Date(apt.completedAt)
          : null,
      consultationElapsedSeconds: computeConsultationMetrics(
        apt.actualStartedAt || apt.startedAt,
        apt.actualCompletedAt || apt.completedAt,
        status,
      ).elapsedSeconds,
      consultationDurationFormatted: computeConsultationMetrics(
        apt.actualStartedAt || apt.startedAt,
        apt.actualCompletedAt || apt.completedAt,
        status,
      ).formattedDuration,
      lastCalledAt: apt.lastCalledAt ? new Date(apt.lastCalledAt) : null,
      cancelledAt: apt.cancelledAt ? new Date(apt.cancelledAt) : null,
      notes: apt.complaint || null,
      createdAt: new Date(apt.createdAt),
      updatedAt: new Date(apt.updatedAt),
    };
  }
}
