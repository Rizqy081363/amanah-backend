import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointmentStatusEvents,
  appointments,
  clinicRooms,
  doctorAssignments,
  medicalSpecialties,
  practitioners,
  queueTickets,
  sessionDefs,
  shiftExceptions,
} from '@database/schema';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { ClinicTimeService } from '@common/time/clinic-time.service';
import {
  QUEUE_TICKET_STATUS,
  SHIFT_EXCEPTION_TYPE,
} from '../../domain/constants/appointment-lifecycle.constants';
import type { RoomOccupantDetails } from '../domain/entities/candidate-room.entity';

@Injectable()
export class DrizzleCandidateAssignmentRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly clinicTimeService: ClinicTimeService,
  ) {}

  async findAppointmentWithContext(appointmentId: string) {
    const apt = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      with: {
        practitioner: {
          with: {
            staffProfile: true,
          },
        },
        clinicService: {
          with: {
            medicalSpecialty: true,
          },
        },
        clinicRoom: true,
      },
    });

    if (!apt) return null;

    const ticket = await this.db.query.queueTickets.findFirst({
      where: eq(queueTickets.appointmentId, appointmentId),
    });

    return {
      appointment: apt,
      queueTicket: ticket || null,
    };
  }

  async findAllActiveSessionDefs() {
    return this.db.query.sessionDefs.findMany({
      where: eq(sessionDefs.isActive, true),
      orderBy: (s, { asc }) => [asc(s.sortOrder)],
    });
  }

  async findRosteredDoctors(sessionId: string, dow: number) {
    return this.db.query.doctorAssignments.findMany({
      where: and(
        eq(doctorAssignments.sessionId, sessionId),
        or(eq(doctorAssignments.dow, dow), isNull(doctorAssignments.dow)),
        eq(doctorAssignments.isActive, true),
      ),
    });
  }

  async findActiveDoctorLeaves(serviceDate: string, sessionId?: string | null) {
    const conditions = [
      eq(shiftExceptions.serviceDate, serviceDate),
      eq(shiftExceptions.type, SHIFT_EXCEPTION_TYPE.LEAVE),
    ];

    if (sessionId) {
      conditions.push(
        or(
          eq(shiftExceptions.sessionId, sessionId),
          isNull(shiftExceptions.sessionId),
        )!,
      );
    }

    return this.db.query.shiftExceptions.findMany({
      where: and(...conditions),
    });
  }

  async countActiveQueuePerDoctor(
    serviceDate: string,
    sessionId?: string | null,
  ): Promise<Map<string, number>> {
    const queueRows = await this.db
      .select({
        doctorId: queueTickets.doctorId,
        count: sql<number>`count(*)::int`,
      })
      .from(queueTickets)
      .where(
        and(
          eq(queueTickets.queueDate, serviceDate),
          sessionId ? eq(queueTickets.sessionId, sessionId) : sql`TRUE`,
          inArray(queueTickets.status, [
            QUEUE_TICKET_STATUS.WAITING,
            QUEUE_TICKET_STATUS.CALLED,
            QUEUE_TICKET_STATUS.IN_SERVICE,
          ]),
        ),
      )
      .groupBy(queueTickets.doctorId);

    const countMap = new Map<string, number>();
    for (const r of queueRows) {
      if (r.doctorId) {
        countMap.set(r.doctorId, r.count);
      }
    }
    return countMap;
  }

  async findAllActiveSpecialties() {
    return this.db.query.medicalSpecialties.findMany({
      orderBy: (ms, { asc }) => [asc(ms.name)],
    });
  }

  async findAllActivePractitioners() {
    return this.db.query.practitioners.findMany({
      where: eq(practitioners.isAcceptingAppointments, true),
      with: {
        staffProfile: {
          with: {
            clinicUnit: true,
          },
        },
        medicalSpecialty: true,
      },
    });
  }

  async findAllActiveClinicRooms() {
    return this.db.query.clinicRooms.findMany({
      where: eq(clinicRooms.isActive, true),
      orderBy: (r, { asc }) => [asc(r.name)],
    });
  }

  async findActiveRuntimeRoomOccupants(
    serviceDate: string,
  ): Promise<Map<string, RoomOccupantDetails>> {
    const activeTickets = await this.db.query.queueTickets.findMany({
      where: and(
        eq(queueTickets.queueDate, serviceDate),
        inArray(queueTickets.status, [
          QUEUE_TICKET_STATUS.CALLED,
          QUEUE_TICKET_STATUS.IN_SERVICE,
        ]),
      ),
      with: {
        clinicRoom: true,
        appointment: true,
      },
    });

    const occupantMap = new Map<string, RoomOccupantDetails>();

    for (const ticket of activeTickets) {
      if (!ticket.roomId) continue;

      let doctorName: string | undefined;
      if (ticket.doctorId) {
        const doc = await this.db.query.practitioners.findFirst({
          where: eq(practitioners.id, ticket.doctorId),
          with: { staffProfile: true },
        });
        doctorName = doc?.displayName || doc?.staffProfile?.fullName;
      }

      occupantMap.set(ticket.roomId, {
        practitionerId: ticket.doctorId || undefined,
        doctorName,
        bookingCode: ticket.appointment?.bookingCode || ticket.queueNumber,
        startTime: ticket.calledAt
          ? this.clinicTimeService.formatTime(ticket.calledAt).slice(0, 5)
          : undefined,
      });
    }

    return occupantMap;
  }

  async findDoctorPreferredRoomId(
    doctorId: string,
    sessionId?: string | null,
    dow?: number | null,
  ): Promise<string | null> {
    const conditions = [
      eq(doctorAssignments.doctorId, doctorId),
      eq(doctorAssignments.isActive, true),
    ];
    if (sessionId) {
      conditions.push(eq(doctorAssignments.sessionId, sessionId));
    }
    if (dow !== undefined && dow !== null) {
      conditions.push(
        or(eq(doctorAssignments.dow, dow), isNull(doctorAssignments.dow))!,
      );
    }

    const da = await this.db.query.doctorAssignments.findFirst({
      where: and(...conditions),
    });

    if (da?.preferredRoomId) {
      return da.preferredRoomId;
    }

    const doc = await this.db.query.practitioners.findFirst({
      where: eq(practitioners.id, doctorId),
    });

    return doc?.defaultRoomId || null;
  }

  async updateAppointmentDoctorTransactional(params: {
    appointmentId: string;
    targetDoctorId: string;
    previousDoctorId?: string | null;
    targetRoomId?: string | null;
    updatedBy?: string | null;
    reason?: string;
    previousStatus: string;
  }) {
    return this.db.transaction(async (tx) => {
      // Transaction-level advisory lock to serialize concurrent doctor reassignments
      const lockKeyTarget = `doctor_queue_${params.targetDoctorId}`;
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${lockKeyTarget}))`,
      );
      if (
        params.previousDoctorId &&
        params.previousDoctorId !== params.targetDoctorId
      ) {
        const lockKeyPrev = `doctor_queue_${params.previousDoctorId}`;
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${lockKeyPrev}))`,
        );
      }

      await tx
        .update(appointments)
        .set({
          practitionerId: params.targetDoctorId,
          ...(params.targetRoomId !== undefined
            ? { roomId: params.targetRoomId }
            : {}),
          updatedBy: params.updatedBy,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(appointments.id, params.appointmentId));

      await tx
        .update(queueTickets)
        .set({
          doctorId: params.targetDoctorId,
          queueNumber: sql`CASE WHEN ${queueTickets.doctorId} IS DISTINCT FROM ${params.targetDoctorId}::uuid THEN 'TMP_' || ${queueTickets.id} || '_' || ${queueTickets.queueNumber} ELSE ${queueTickets.queueNumber} END`,
          assignedAt: sql`CASE WHEN ${queueTickets.doctorId} IS DISTINCT FROM ${params.targetDoctorId}::uuid THEN NOW() ELSE COALESCE(${queueTickets.assignedAt}, NOW()) END`,
          ...(params.targetRoomId !== undefined
            ? { roomId: params.targetRoomId }
            : {}),
          status: sql`CASE WHEN ${queueTickets.status} = ${QUEUE_TICKET_STATUS.CALLED} THEN ${QUEUE_TICKET_STATUS.WAITING}::queue_status ELSE ${queueTickets.status} END`,
          calledAt: sql`CASE WHEN ${queueTickets.status} = ${QUEUE_TICKET_STATUS.CALLED} THEN NULL ELSE ${queueTickets.calledAt} END`,
        })
        .where(eq(queueTickets.appointmentId, params.appointmentId));

      if (params.reason) {
        await tx.insert(appointmentStatusEvents).values({
          appointmentId: params.appointmentId,
          previousStatus: params.previousStatus as any,
          newStatus: params.previousStatus as any,
          reason: params.reason,
          changedBy: (params.updatedBy || null) as any,
        });
      }
    });
  }

  async updateAppointmentRoomTransactional(params: {
    appointmentId: string;
    targetRoomId: string;
    updatedBy?: string | null;
    reason?: string;
    previousStatus: string;
  }) {
    return this.db.transaction(async (tx) => {
      await tx
        .update(appointments)
        .set({
          roomId: params.targetRoomId,
          updatedBy: params.updatedBy,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(appointments.id, params.appointmentId));

      await tx
        .update(queueTickets)
        .set({
          roomId: params.targetRoomId,
        })
        .where(eq(queueTickets.appointmentId, params.appointmentId));

      if (params.reason) {
        await tx.insert(appointmentStatusEvents).values({
          appointmentId: params.appointmentId,
          previousStatus: params.previousStatus as any,
          newStatus: params.previousStatus as any,
          reason: params.reason,
          changedBy: (params.updatedBy || null) as any,
        });
      }
    });
  }
}
