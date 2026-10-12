import { Inject, Injectable, Optional } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  queueTickets,
} from '../../../../database/schema';
import { ClinicConfigService } from '@common/clinic-config';
import { TIME_CONSTANTS } from '../../domain/constants/appointment-check-in.config';
import { CLINIC_POLICY_FALLBACK_CONFIG } from '../../../schedules/domain/constants/schedule.constants';
import { SchedulePolicyReader } from '../../../schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import type {
  AppointmentFilter,
  AppointmentListResult,
  AppointmentRepositoryPort,
  CreateAppointmentInput,
  TransitionStatusInput,
} from '../../application/ports/appointment-repository.port';
import {
  DB_APPOINTMENT_STATUS,
  DOMAIN_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/appointment-lifecycle.constants';
import {
  AppointmentNotCallableError,
  AppointmentNotFoundError,
  StaleStatusError,
} from '../../domain/errors/appointment-domain.errors';
import { computeConsultationMetrics } from '../../domain/helpers/consultation-duration.helper';
import {
  type AppointmentRecord,
  resolveAllowedActions,
  toDbStatus,
  toDomainStatus,
} from '../../domain/types/appointment.types';
import { QueuePositionRecalculationService } from '../../../queue-engine/application/services/queue-position-recalculation.service';

@Injectable()
export class AppointmentHardenedDrizzleRepository
  implements AppointmentRepositoryPort
{
  private cachedDurationMinutes: number | null = null;

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
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
      } catch (_) {}
    }
    if (this.policyReader) {
      try {
        const policy = await this.policyReader.getClinicSchedulePolicy();
        this.cachedDurationMinutes = policy.durationMinutes;
        return this.cachedDurationMinutes;
      } catch (_) {}
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
          with: { patientAffiliations: { with: { user: true } } },
        },
        clinicService: true,
        clinicRoom: { with: { clinicUnit: true } },
        practitioner: {
          with: {
            staffProfile: true,
            medicalSpecialty: true,
          },
        },
        queueTickets: true,
      },
    });

    if (!row) return null;
    const durationMinutes = await this.getPolicyDurationMinutes();
    return this.mapToRecord(row, durationMinutes);
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
    } catch (_) {}

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
    } catch (_) {}

    const full = await this.findById(id);
    return full!;
  }

  async transitionStatus(
    input: TransitionStatusInput,
  ): Promise<AppointmentRecord> {
    const allowedStatuses =
      input.expectedStatus === DOMAIN_APPOINTMENT_STATUS.WAITING
        ? [
            DB_APPOINTMENT_STATUS.WAITING,
            DB_APPOINTMENT_STATUS.BOOKED,
            DB_APPOINTMENT_STATUS.CHECKED_IN,
          ]
        : input.expectedStatus === DOMAIN_APPOINTMENT_STATUS.IN_SERVICE
          ? [DB_APPOINTMENT_STATUS.IN_SERVICE]
          : [];

    const targetDbStatus = toDbStatus(input.targetStatus);

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

      await this.db
        .update(queueTickets)
        .set(updateTicketPayload)
        .where(eq(queueTickets.appointmentId, input.id));
    } catch (_) {}

    const full = await this.findById(input.id);
    return full!;
  }

  async sweepLateness(threshold: Date): Promise<number> {
    const updated = await this.db
      .update(appointments)
      .set({
        status: DB_APPOINTMENT_STATUS.LATE,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          inArray(appointments.status, [
            DB_APPOINTMENT_STATUS.WAITING,
            DB_APPOINTMENT_STATUS.BOOKED,
            DB_APPOINTMENT_STATUS.CHECKED_IN,
          ] as any),
          or(
            sql`${appointments.estimatedStartAt} <= ${threshold.toISOString()}`,
            sql`(${appointments.scheduledDate} || ' ' || ${appointments.scheduledStartTime})::timestamptz <= ${threshold.toISOString()}::timestamptz`,
          ),
        ),
      )
      .returning({
        id: appointments.id,
        scheduledDate: appointments.scheduledDate,
        practitionerId: appointments.practitionerId,
      });

    if (updated.length > 0) {
      const ids = updated.map((u) => u.id);
      await this.db
        .update(queueTickets)
        .set({
          status: QUEUE_TICKET_STATUS.CANCELLED,
          waitingPosition: null,
          updatedAt: sql`NOW()`,
        })
        .where(inArray(queueTickets.appointmentId, ids))
        .catch(() => {});

      if (this.queuePositionRecalculationService) {
        await this.queuePositionRecalculationService
          .recalculatePartitions(
            updated.map((u) => ({
              serviceDate: u.scheduledDate,
              practitionerId: u.practitionerId,
            })),
          )
          .catch(() => {});
      }
    }

    return updated.length;
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
          with: { patientAffiliations: { with: { user: true } } },
        },
        clinicService: true,
        clinicRoom: { with: { clinicUnit: true } },
        practitioner: {
          with: {
            staffProfile: true,
            medicalSpecialty: true,
          },
        },
        queueTickets: true,
      },
    });

    const durationMinutes = await this.getPolicyDurationMinutes();
    return {
      items: rows.map((r) => this.mapToRecord(r, durationMinutes)),
      total: Number(countResult?.total || 0),
    };
  }

  private mapToRecord(
    apt: any,
    fallbackDurationMinutes?: number,
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

    return {
      id: apt.id,
      bookingCode: apt.bookingCode || '',
      patientId: apt.patientId,
      patientUserId: parentUserId,
      isAffiliated,
      affiliationRelationship,
      parentUserId,
      parentUserName,
      patientName: apt.patientProfile?.fullName || null,
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
      allowedActions: resolveAllowedActions(status),
      estimatedStartAt,
      estimatedEndAt,
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
