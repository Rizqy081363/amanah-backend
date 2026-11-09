import { ClinicTimeService } from '@common/time/clinic-time.service';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointmentStatusEvents,
  appointments,
  childImmunizationIntakes,
  clinicRooms,
  clinicServices,
  clinicUnits,
  clinicalIntakeForms,
  doctorAssignments,
  maternalHealthIntakes,
  medicalIntakeSubmissions,
  practitioners,
  queueTickets,
  replacementOpportunities,
  serviceCategories,
  sessionDefs,
  shiftExceptions,
  staffAttendanceRecords,
  staffLeaveRequests,
} from '@database/schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
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

  async findActiveStaffLeaves(serviceDate: string) {
    return this.db.query.staffLeaveRequests.findMany({
      where: and(
        eq(staffLeaveRequests.status, 'approved'),
        lte(staffLeaveRequests.startDate, serviceDate),
        gte(staffLeaveRequests.endDate, serviceDate),
      ),
      with: {
        staffProfile: true,
      },
    });
  }

  async findClaimedReplacements(
    serviceDate: string,
    sessionId?: string | null,
  ) {
    const conditions = [
      eq(replacementOpportunities.workDate, serviceDate),
      eq(replacementOpportunities.status, 'claimed'),
    ];
    if (sessionId) {
      conditions.push(eq(replacementOpportunities.sessionId, sessionId));
    }
    return this.db.query.replacementOpportunities.findMany({
      where: and(...conditions),
      with: {
        claimedByPractitioner: {
          with: { staffProfile: true },
        },
        originalPractitioner: {
          with: { staffProfile: true },
        },
      },
    });
  }

  async findAttendanceRecordsForDate(serviceDate: string) {
    return this.db.query.staffAttendanceRecords.findMany({
      where: eq(staffAttendanceRecords.attendanceDate, serviceDate),
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
            role: true,
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

  async findActiveClinicService(serviceId: string) {
    const [svc] = await this.db
      .select({
        id: clinicServices.id,
        name: clinicServices.name,
        codePrefix: clinicServices.codePrefix,
        serviceCategoryId: clinicServices.serviceCategoryId,
        categoryCodePrefix: serviceCategories.codePrefix,
        unitId: serviceCategories.unitId,
        unitQueuePrefix: clinicUnits.queuePrefix,
        unitName: clinicUnits.name,
        intakeFormCode: clinicalIntakeForms.code,
        isActive: clinicServices.isActive,
      })
      .from(clinicServices)
      .leftJoin(
        serviceCategories,
        eq(clinicServices.serviceCategoryId, serviceCategories.id),
      )
      .leftJoin(clinicUnits, eq(serviceCategories.unitId, clinicUnits.id))
      .leftJoin(
        clinicalIntakeForms,
        eq(clinicServices.intakeFormId, clinicalIntakeForms.id),
      )
      .where(and(eq(clinicServices.id, serviceId), eq(clinicServices.isActive, true)))
      .limit(1);

    if (!svc) return null;

    const resolvedPrefix =
      svc.codePrefix || svc.categoryCodePrefix || svc.unitQueuePrefix || 'A';

    return {
      ...svc,
      resolvedPrefix,
    };
  }

  async updateAppointmentServiceTransactional(params: {
    appointmentId: string;
    targetServiceId: string;
    targetCategoryId?: string | null;
    targetMedicalFlow?: 'pregnancy' | 'immunization' | null;
    targetQueuePrefix?: string;
    targetUnitId?: string | null;
    complaint?: string;
    updatedBy?: string | null;
    reason?: string;
    previousStatus: string;
  }) {
    return this.db.transaction(async (tx) => {
      // 1. Fetch current appointment and room
      const [currentApt] = await tx
        .select({
          id: appointments.id,
          roomId: appointments.roomId,
          practitionerId: appointments.practitionerId,
        })
        .from(appointments)
        .where(eq(appointments.id, params.appointmentId))
        .limit(1);

      let targetRoomId = currentApt?.roomId || null;

      // Check if current room matches the new unit
      if (params.targetUnitId && currentApt?.roomId) {
        const [currentRoom] = await tx
          .select({ id: clinicRooms.id, unitId: clinicRooms.unitId })
          .from(clinicRooms)
          .where(eq(clinicRooms.id, currentApt.roomId))
          .limit(1);

        if (currentRoom && currentRoom.unitId !== params.targetUnitId) {
          // Re-evaluate room in target unit: preferred room or first active room in that unit
          const [matchingRoom] = await tx
            .select({ id: clinicRooms.id })
            .from(clinicRooms)
            .where(
              and(
                eq(clinicRooms.unitId, params.targetUnitId),
                eq(clinicRooms.isActive, true),
              ),
            )
            .limit(1);

          targetRoomId = matchingRoom?.id || null;
        }
      }

      const [existingTicket] = await tx
        .select({
          id: queueTickets.id,
          queueNumber: queueTickets.queueNumber,
          queueDate: queueTickets.queueDate,
          doctorId: queueTickets.doctorId,
        })
        .from(queueTickets)
        .where(eq(queueTickets.appointmentId, params.appointmentId))
        .limit(1);

      let newTicketNumber = existingTicket?.queueNumber;
      let newNumericQueueNumber: number | null = null;

      if (existingTicket?.queueNumber && params.targetQueuePrefix) {
        // Extract sequence/session suffix, e.g. 'UM-P002' -> suffix 'P002' or 'UM-003' -> '003'
        const match = existingTicket.queueNumber.match(/^([A-Za-z0-9]+)-(.*)$/);
        const suffix = match ? match[2] : existingTicket.queueNumber;
        newTicketNumber = `${params.targetQueuePrefix}-${suffix}`;

        // Ensure collision-free within target active ticket scope
        const ticketScopeCondition = existingTicket.doctorId
          ? and(
              eq(queueTickets.doctorId, existingTicket.doctorId),
              eq(queueTickets.queueDate, existingTicket.queueDate),
              eq(queueTickets.queueNumber, newTicketNumber),
            )
          : and(
              isNull(queueTickets.doctorId),
              eq(queueTickets.serviceId, params.targetServiceId),
              eq(queueTickets.queueDate, existingTicket.queueDate),
              eq(queueTickets.queueNumber, newTicketNumber),
            );

        const [conflict] = await tx
          .select({ id: queueTickets.id })
          .from(queueTickets)
          .where(and(ticketScopeCondition, sql`${queueTickets.id} != ${existingTicket.id}`))
          .limit(1);

        if (conflict) {
          const numericMatch = suffix.match(/\d+$/);
          let index = numericMatch ? parseInt(numericMatch[0], 10) : 1;
          const nonDigitPrefix = suffix.replace(/\d+$/, '');
          while (true) {
            index++;
            const candidate = `${params.targetQueuePrefix}-${nonDigitPrefix}${String(index).padStart(3, '0')}`;
            const [taken] = await tx
              .select({ id: queueTickets.id })
              .from(queueTickets)
              .where(
                and(
                  existingTicket.doctorId
                    ? eq(queueTickets.doctorId, existingTicket.doctorId)
                    : and(
                        isNull(queueTickets.doctorId),
                        eq(queueTickets.serviceId, params.targetServiceId),
                      ),
                  eq(queueTickets.queueDate, existingTicket.queueDate),
                  eq(queueTickets.queueNumber, candidate),
                  sql`${queueTickets.id} != ${existingTicket.id}`,
                ),
              )
              .limit(1);
            if (!taken) {
              newTicketNumber = candidate;
              break;
            }
          }
        }

        const numericExtract = newTicketNumber.match(/\d+$/);
        if (numericExtract) {
          newNumericQueueNumber = parseInt(numericExtract[0], 10);
        }
      }

      await tx
        .update(appointments)
        .set({
          serviceId: params.targetServiceId,
          medicalFlow: (params.targetMedicalFlow || null) as any,
          roomId: targetRoomId,
          ...(params.complaint !== undefined ? { complaint: params.complaint } : {}),
          ...(newNumericQueueNumber !== null ? { queueNumber: newNumericQueueNumber } : {}),
          updatedBy: params.updatedBy,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(appointments.id, params.appointmentId));

      await tx
        .update(queueTickets)
        .set({
          serviceId: params.targetServiceId,
          ...(params.targetCategoryId ? { categoryId: params.targetCategoryId } : {}),
          roomId: targetRoomId,
          ...(newTicketNumber ? { queueNumber: newTicketNumber } : {}),
        })
        .where(eq(queueTickets.appointmentId, params.appointmentId));

      // Delete aborted intake records from this appointment to prevent database bloat
      if (params.targetMedicalFlow !== 'pregnancy') {
        await tx
          .delete(maternalHealthIntakes)
          .where(eq(maternalHealthIntakes.appointmentId, params.appointmentId));
      }

      if (params.targetMedicalFlow !== 'immunization') {
        await tx
          .delete(childImmunizationIntakes)
          .where(eq(childImmunizationIntakes.appointmentId, params.appointmentId));
      }

      if (!params.targetMedicalFlow) {
        await tx
          .delete(medicalIntakeSubmissions)
          .where(eq(medicalIntakeSubmissions.appointmentId, params.appointmentId));
      } else {
        await tx
          .delete(medicalIntakeSubmissions)
          .where(
            and(
              eq(medicalIntakeSubmissions.appointmentId, params.appointmentId),
              ne(medicalIntakeSubmissions.flow, params.targetMedicalFlow),
            ),
          );
      }

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

  async findAppointmentsOrderMetadata(appointmentIds: string[]) {
    if (!appointmentIds || appointmentIds.length === 0) return [];
    return this.db
      .select({
        id: appointments.id,
        queueNumber: appointments.queueNumber,
        createdAt: appointments.createdAt,
      })
      .from(appointments)
      .where(inArray(appointments.id, appointmentIds));
  }
}
