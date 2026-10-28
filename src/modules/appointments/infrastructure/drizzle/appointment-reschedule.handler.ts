import { Temporal } from '@js-temporal/polyfill';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AuthenticatedUser } from '../../../../common/auth/authenticated-user.interface';
import { isAdminUser } from '../../../../common/auth/authenticated-user.interface';
import type { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import {
  DomainForbiddenException,
  DomainValidationException,
  EntityNotFoundException,
  InvalidStateTransitionException,
} from '../../../../common/exceptions/domain.exceptions';
import type { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointmentStatusEvents,
  appointments,
  clinicClosures,
  clinicServices,
  clinicSettings,
  doctorAssignments,
  patientAffiliations,
  patientProfiles,
  queueTickets,
  sessionDefs,
} from '../../../../database/schema';
import type { QueuePositionRecalculationService } from '../../../queue-engine/application/services/queue-position-recalculation.service';
import { QUEUE_PRIORITY } from '../../../queue-engine/domain/constants/queue-engine.constants';
import { resolveQueueLoadStatus } from '../../../queue-engine/domain/constants/queue-load.constants';
import {
  DB_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/appointment-lifecycle.constants';
import type { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { SYSTEM_ROLES } from '../../../../auth/constants/auth.constants';
import { ActiveTicketPolicyService } from '../../domain/services/active-ticket-policy.service';
import { RescheduleAppointmentDto } from '../../presentation/dto/reschedule-appointment.dto';

export class AppointmentRescheduleHandler {
  static async getRescheduleOptions(
    db: DrizzleDatabase,
    appointmentId: string,
    userId: string,
    user?: AuthenticatedUser,
  ): Promise<any> {
    const apt = await db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      with: {
        patientProfile: true,
        clinicService: true,
        clinicRoom: { with: { clinicUnit: true } },
        practitioner: { with: { staffProfile: true, medicalSpecialty: true } },
      },
    });

    if (!apt) {
      throw new EntityNotFoundException('Janji temu', appointmentId);
    }

    const { isAdmin } = await validateRescheduleAuthorization(
      db,
      apt,
      userId,
      user,
    );
    await validateAppointmentStateForReschedule(db, apt, isAdmin);

    const today = new Date().toISOString().split('T')[0];
    const categoryId = apt.clinicService?.serviceCategoryId || null;

    // Load active master sessions (Rule R1: Jam praktik milik klinik)
    const masterSessions = await db.query.sessionDefs.findMany({
      where: eq(sessionDefs.isActive, true),
      orderBy: [asc(sessionDefs.sortOrder)],
    });

    // Load active closures
    const activeClosures = await db
      .select()
      .from(clinicClosures)
      .where(isNull(clinicClosures.cancelledAt));

    const availableDates: any[] = [];
    const baseDate = new Date(`${today}T00:00:00.000Z`);

    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const curDate = new Date(baseDate.getTime() + dayOffset * 86400000);
      const dateStr = curDate.toISOString().slice(0, 10);
      const shifts = [];

      for (const sess of masterSessions) {
        const sTime = sess.defaultStartsAt?.slice(0, 5) || '08:00';
        const eTime = sess.defaultEndsAt?.slice(0, 5) || '12:00';
        const shiftStartIso = `${dateStr}T${sTime}:00.000Z`;
        const shiftEndIso = `${dateStr}T${eTime}:00.000Z`;

        const isClosed = activeClosures.some((c: any) => {
          const cStart = new Date(c.startsAt).getTime();
          const cEnd = new Date(c.endsAt).getTime();
          const sStart = new Date(shiftStartIso).getTime();
          const sEnd = new Date(shiftEndIso).getTime();
          const overlaps = cStart < sEnd && cEnd > sStart;
          if (!overlaps) return false;
          if (c.scope === 'clinic') return true;
          if (
            c.scope === 'category' &&
            categoryId &&
            c.categoryId === categoryId
          )
            return true;
          return false;
        });

        if (!isClosed) {
          shifts.push({
            sessionId: sess.id,
            startTime: sTime,
            endTime: eTime,
            shift: sess.code,
            sessionShift: sess.code,
            sessionLabel: sess.label,
            label: sess.label,
            loadStatus: resolveQueueLoadStatus(0),
            isAvailable: true,
          });
        }
      }

      if (shifts.length > 0) {
        availableDates.push({
          date: dateStr,
          shifts,
        });
      }
    }

    return {
      appointmentId: apt.id,
      currentDate: apt.scheduledDate,
      currentStartTime: apt.scheduledStartTime?.slice(0, 5) || null,
      currentEndTime: apt.scheduledEndTime?.slice(0, 5) || null,
      patient: {
        id: apt.patientId,
        name: apt.patientProfile?.fullName,
      },
      doctor: {
        id: apt.practitionerId,
        name:
          apt.practitioner?.staffProfile?.fullName ||
          apt.practitioner?.displayName ||
          '',
        specialization:
          apt.practitioner?.medicalSpecialty?.name ||
          apt.practitioner?.staffProfile?.positionTitle ||
          apt.clinicService?.name ||
          '',
      },
      service: {
        id: apt.serviceId,
        name: apt.clinicService?.name,
      },
      availableDates,
    };
  }

  static async reschedule(
    db: DrizzleDatabase,
    appointmentId: string,
    dto: RescheduleAppointmentDto,
    userId: string,
    findById: (id: string) => Promise<AppointmentEntity | null>,
    user?: AuthenticatedUser,
    queuePositionRecalculationService?: QueuePositionRecalculationService,
    clinicConfig?: ClinicConfigService,
    clinicTimeService?: ClinicTimeService,
  ): Promise<AppointmentEntity> {
    const targetDate = dto.target_date;

    if (!targetDate) {
      throw new DomainValidationException(
        'Target tanggal reschedule wajib diisi',
      );
    }

    let oldDate: string | null = null;
    let oldDoctorId: string | null = null;
    let appointmentCategoryId: string | null = null;

    await db.transaction(async (tx) => {
      const [apt] = await tx
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId))
        .for('update');

      if (!apt) {
        throw new EntityNotFoundException('Janji temu', appointmentId);
      }

      oldDate = apt.scheduledDate;
      oldDoctorId = apt.practitionerId;

      const { isAdmin } = await validateRescheduleAuthorization(
        tx,
        apt,
        userId,
        user,
      );
      await validateAppointmentStateForReschedule(tx, apt, isAdmin);

      let targetSessionDef: any = null;
      if (dto.target_session_id) {
        const sessionId = dto.target_session_id.trim();
        targetSessionDef = await tx.query.sessionDefs.findFirst({
          where: eq(sessionDefs.id, sessionId),
        });
        if (!targetSessionDef) {
          const assignment = await tx.query.doctorAssignments.findFirst({
            where: eq(doctorAssignments.id, sessionId),
          });
          if (assignment?.sessionId) {
            targetSessionDef = await tx.query.sessionDefs.findFirst({
              where: eq(sessionDefs.id, assignment.sessionId),
            });
          }
        }
      } else if (dto.session) {
        const normalizedSession = dto.session.trim().toLowerCase();
        targetSessionDef = await tx.query.sessionDefs.findFirst({
          where: eq(sessionDefs.code, normalizedSession),
        });
      }

      if (!targetSessionDef) {
        throw new EntityNotFoundException(
          'Sesi jadwal',
          dto.target_session_id || dto.session || 'unknown',
        );
      }

      const sTime = targetSessionDef.defaultStartsAt.slice(0, 5);
      const eTime = targetSessionDef.defaultEndsAt.slice(0, 5);
      const nowIso = new Date().toISOString();

      const service = await tx.query.clinicServices.findFirst({
        where: eq(clinicServices.id, apt.serviceId),
      });
      const categoryPrefix = service?.codePrefix || 'U';
      const categoryId = service?.serviceCategoryId || null;
      appointmentCategoryId = categoryId;
      const sessionPrefix = targetSessionDef.codePrefix;

      let activeCountRow: { count: number } | undefined;
      if (apt.practitionerId) {
        [activeCountRow] = await tx
          .select({
            count: sql<number>`count(*)::int`,
          })
          .from(appointments)
          .where(
            and(
              eq(appointments.scheduledDate, targetDate),
              eq(appointments.practitionerId, apt.practitionerId),
              sql`${appointments.id} != ${apt.id}`,
              inArray(appointments.status, [
                DB_APPOINTMENT_STATUS.BOOKED,
                DB_APPOINTMENT_STATUS.WAITING,
                DB_APPOINTMENT_STATUS.IN_SERVICE,
              ]),
            ),
          );
      } else {
        [activeCountRow] = await tx
          .select({
            count: sql<number>`count(*)::int`,
          })
          .from(appointments)
          .innerJoin(
            clinicServices,
            eq(appointments.serviceId, clinicServices.id),
          )
          .where(
            and(
              eq(appointments.scheduledDate, targetDate),
              isNull(appointments.practitionerId),
              categoryId
                ? eq(clinicServices.serviceCategoryId, categoryId)
                : eq(appointments.serviceId, apt.serviceId),
              sql`${appointments.id} != ${apt.id}`,
              inArray(appointments.status, [
                DB_APPOINTMENT_STATUS.BOOKED,
                DB_APPOINTMENT_STATUS.WAITING,
                DB_APPOINTMENT_STATUS.IN_SERVICE,
              ]),
            ),
          );
      }
      const numericQueueNumber = (activeCountRow?.count || 0) + 1;

      const ticketScopeCondition = apt.practitionerId
        ? eq(queueTickets.doctorId, apt.practitionerId)
        : and(
            isNull(queueTickets.doctorId),
            categoryId
              ? eq(queueTickets.categoryId, categoryId)
              : eq(queueTickets.serviceId, apt.serviceId),
          );

      const existingTickets = await tx
        .select({ queueNumber: queueTickets.queueNumber })
        .from(queueTickets)
        .where(
          and(
            ticketScopeCondition,
            eq(queueTickets.queueDate, targetDate),
            inArray(queueTickets.status, [
              QUEUE_TICKET_STATUS.WAITING,
              QUEUE_TICKET_STATUS.CALLED,
              QUEUE_TICKET_STATUS.IN_SERVICE,
            ]),
          ),
        );
      const usedNumbers = new Set(existingTickets.map((t) => t.queueNumber));
      let ticketIndex = numericQueueNumber;
      let formattedTicketNumber = `${categoryPrefix}-${sessionPrefix}${String(ticketIndex).padStart(3, '0')}`;
      while (usedNumbers.has(formattedTicketNumber)) {
        ticketIndex++;
        formattedTicketNumber = `${categoryPrefix}-${sessionPrefix}${String(ticketIndex).padStart(3, '0')}`;
      }

      const [existingTicket] = await tx
        .select()
        .from(queueTickets)
        .where(eq(queueTickets.appointmentId, apt.id));

      // Rule H2 & Blueprint Section 4.5: Satu tiket aktif per pasien per kategori per hari
      if (apt.patientId && categoryId && targetDate) {
        await ActiveTicketPolicyService.assertNoActiveTicketConflict(
          tx,
          {
            patientId: apt.patientId,
            categoryId,
            queueDate: targetDate,
            excludeTicketId: existingTicket?.id,
          },
          clinicConfig,
        );
      }

      const policy = clinicConfig
        ? await clinicConfig.getSchedulePolicy().catch(() => null)
        : null;

      const [startH, startM] = (sTime || '08:00')
        .split(':')
        .map((v: string) => parseInt(v, 10));
      const h = Number.isNaN(startH) ? 8 : startH;
      const m = Number.isNaN(startM) ? 0 : startM;
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
      const tz =
        clinicTimeService?.getTimezone() ||
        (clinicConfig ? await clinicConfig.getTimezone() : 'Asia/Jakarta');

      const baseStart = new Date(
        Temporal.PlainDateTime.from(`${targetDate}T${timeStr}`)
          .toZonedDateTime(tz)
          .toInstant().epochMilliseconds,
      );

      const consultationMinutes =
        policy?.defaultConsultationDurationMinutes ?? 20;
      const queueOffsetMinutes =
        Math.max(0, numericQueueNumber - 1) * consultationMinutes;
      const estimatedStart = new Date(
        baseStart.getTime() + queueOffsetMinutes * 60_000,
      );
      const estimatedEnd = new Date(
        estimatedStart.getTime() + consultationMinutes * 60_000,
      );

      if (existingTicket) {
        await tx
          .update(queueTickets)
          .set({
            queueDate: targetDate,
            sessionId: targetSessionDef.id,
            queueNumber: formattedTicketNumber,
            status: QUEUE_TICKET_STATUS.WAITING,
            priority: QUEUE_PRIORITY.REGULAR,
            waitingPosition: numericQueueNumber,
            projectedStart: estimatedStart.toISOString(),
            projectedEnd: estimatedEnd.toISOString(),
            carriedOver: true,
            assignedAt: nowIso,
            updatedAt: nowIso,
          })
          .where(eq(queueTickets.id, existingTicket.id));
      } else {
        await tx.insert(queueTickets).values({
          appointmentId: apt.id,
          serviceId: apt.serviceId,
          categoryId,
          sessionId: targetSessionDef.id,
          patientId: apt.patientId || null,
          doctorId: apt.practitionerId || null,
          roomId: null,
          queueDate: targetDate,
          queueNumber: formattedTicketNumber,
          status: QUEUE_TICKET_STATUS.WAITING,
          priority: QUEUE_PRIORITY.REGULAR,
          waitingPosition: numericQueueNumber,
          projectedStart: estimatedStart.toISOString(),
          projectedEnd: estimatedEnd.toISOString(),
          carriedOver: true,
          source: 'online',
          assignedAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }

      await tx
        .update(appointments)
        .set({
          status: DB_APPOINTMENT_STATUS.BOOKED,
          checkedInAt: null,
          scheduledDate: targetDate,
          scheduledStartTime: sTime,
          scheduledEndTime: eTime,
          queueNumber: numericQueueNumber,
          estimatedStartAt: estimatedStart.toISOString(),
          estimatedEndAt: estimatedEnd.toISOString(),
          roomId: null,
          updatedBy: userId,
          updatedAt: nowIso,
        })
        .where(eq(appointments.id, apt.id));

      await tx.insert(appointmentStatusEvents).values({
        appointmentId,
        previousStatus: apt.status,
        newStatus: DB_APPOINTMENT_STATUS.BOOKED,
        changedBy: userId,
        reason:
          dto.reason ||
          'Reschedule janji temu pasien (reissue tiket antrean atomik)',
      });
    });

    if (queuePositionRecalculationService && oldDate) {
      // Compact old date queue
      await queuePositionRecalculationService
        .recalculateDoctorQueue({
          serviceDate: oldDate,
          practitionerId: oldDoctorId,
          categoryId: oldDoctorId ? undefined : appointmentCategoryId,
        })
        .catch(() => {});

      // Recalculate target date queue if different date
      if (targetDate !== oldDate) {
        await queuePositionRecalculationService
          .recalculateDoctorQueue({
            serviceDate: targetDate,
            practitionerId: oldDoctorId,
            categoryId: oldDoctorId ? undefined : appointmentCategoryId,
          })
          .catch(() => {});
      }
    }

    const updated = await findById(appointmentId);
    if (!updated) {
      throw new EntityNotFoundException('Janji temu', appointmentId);
    }
    return updated;
  }
}

async function validateRescheduleAuthorization(
  db: DrizzleDatabase,
  apt: typeof appointments.$inferSelect,
  userId: string,
  user?: AuthenticatedUser,
): Promise<{ isAdmin: boolean }> {
  if (user && (isAdminUser(user) || user.systemRole === SYSTEM_ROLES.STAF)) {
    return { isAdmin: true };
  }

  if (apt.createdBy === userId) {
    return { isAdmin: false };
  }

  const affiliation = await db.query.patientAffiliations.findFirst({
    where: and(
      eq(patientAffiliations.userId, userId),
      eq(patientAffiliations.patientId, apt.patientId),
    ),
  });
  if (affiliation) {
    return { isAdmin: false };
  }

  const ownProfile = await db.query.patientProfiles.findFirst({
    where: and(
      eq(patientProfiles.userId, userId),
      eq(patientProfiles.id, apt.patientId),
    ),
  });
  if (ownProfile) {
    return { isAdmin: false };
  }

  throw new DomainForbiddenException(
    'Anda tidak berhak menjadwalkan ulang janji temu ini',
  );
}

async function validateAppointmentStateForReschedule(
  db: DrizzleDatabase,
  apt: typeof appointments.$inferSelect,
  isAdmin: boolean,
): Promise<void> {
  if (
    apt.status === DB_APPOINTMENT_STATUS.IN_SERVICE ||
    apt.status === DB_APPOINTMENT_STATUS.COMPLETED ||
    apt.status === DB_APPOINTMENT_STATUS.CANCELLED ||
    apt.status === DB_APPOINTMENT_STATUS.NO_SHOW
  ) {
    throw new InvalidStateTransitionException(
      'Janji temu',
      apt.status,
      DB_APPOINTMENT_STATUS.BOOKED,
    );
  }

  if (!isAdmin) {
    if (apt.checkedInAt) {
      throw new DomainForbiddenException(
        'Pasien sudah melakukan check-in di klinik. Perubahan jadwal hanya dapat dilakukan oleh petugas klinik.',
      );
    }

    const [activeTicket] = await db
      .select({ status: queueTickets.status })
      .from(queueTickets)
      .where(eq(queueTickets.appointmentId, apt.id))
      .limit(1);

    if (activeTicket && activeTicket.status === QUEUE_TICKET_STATUS.CALLED) {
      throw new DomainForbiddenException(
        'Nomor antrean sedang dipanggil oleh petugas klinik. Silakan hubungi meja admisi klinik.',
      );
    }

    const today = new Date().toISOString().split('T')[0];
    if (apt.scheduledDate === today && apt.scheduledEndTime) {
      const overflowSetting = await db.query.clinicSettings.findFirst({
        where: eq(clinicSettings.key, 'queue.overflow_tolerance_minutes'),
      });
      const bufferMinutes =
        typeof overflowSetting?.value === 'number' ? overflowSetting.value : 30;

      const [endH, endM] = apt.scheduledEndTime.split(':').map(Number);
      const sessionEnd = new Date();
      sessionEnd.setHours(endH, endM + bufferMinutes, 0, 0);

      if (new Date() > sessionEnd) {
        throw new DomainForbiddenException(
          'Sesi praktik ini telah berakhir. Silakan hubungi petugas klinik untuk bantuan reschedule.',
        );
      }
    }
  }
}
