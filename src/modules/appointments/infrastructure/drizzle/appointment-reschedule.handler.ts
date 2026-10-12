import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointmentStatusEvents,
  appointments,
  clinicClosures,
  clinicServices,
  clinicSettings,
  patientAffiliations,
  patientProfiles,
  queueTickets,
  roles,
  sessionDefs,
  userRoles,
} from '../../../../database/schema';
import { resolveQueueLoadStatus } from '../../../queue-engine/domain/constants/queue-load.constants';
import {
  CLINIC_ADMIN_STAFF_ROLE_CODES,
  DB_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/appointment-lifecycle.constants';
import { QUEUE_PRIORITY } from '../../../queue-engine/domain/constants/queue-engine.constants';
import type { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { RescheduleAppointmentDto } from '../../presentation/dto/reschedule-appointment.dto';
import type { QueuePositionRecalculationService } from '../../../queue-engine/application/services/queue-position-recalculation.service';

export class AppointmentRescheduleHandler {
  static async getRescheduleOptions(
    db: DrizzleDatabase,
    appointmentId: string,
    userId: string,
    user?: any,
  ): Promise<any> {
    const apt = await db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      with: {
        patientProfile: true,
        clinicService: true,
        clinicRoom: { with: { clinicUnit: true } },
        practitioner: { with: { staffProfile: true } },
      },
    });

    if (!apt) {
      throw new NotFoundException('Janji temu tidak ditemukan');
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
            shift: sess.labelKey,
            sessionShift: sess.code,
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
        name: apt.patientProfile?.fullName || 'Pasien',
      },
      doctor: {
        id: apt.practitionerId,
        name:
          apt.practitioner?.displayName ||
          apt.practitioner?.staffProfile?.fullName ||
          'Dokter',
        specialization: apt.clinicService?.name || 'Dokter Umum',
      },
      service: {
        id: apt.serviceId,
        name: apt.clinicService?.name || 'Layanan',
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
    user?: any,
    queuePositionRecalculationService?: QueuePositionRecalculationService,
  ): Promise<AppointmentEntity> {
    const targetSessionId = dto.target_session_id || dto.newSessionId;
    const targetDate = dto.target_date || dto.newDate;

    if (!targetDate) {
      throw new BadRequestException('Target tanggal reschedule wajib diisi');
    }

    let oldDate: string | null = null;
    let oldDoctorId: string | null = null;

    await db.transaction(async (tx) => {
      const [apt] = await tx
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId))
        .for('update');

      if (!apt) {
        throw new NotFoundException('Janji temu tidak ditemukan');
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
      if (targetSessionId) {
        targetSessionDef = await tx.query.sessionDefs.findFirst({
          where: or(
            eq(sessionDefs.id, targetSessionId),
            eq(sessionDefs.code, targetSessionId),
          ),
        });
      }
      if (!targetSessionDef) {
        targetSessionDef = await tx.query.sessionDefs.findFirst({
          where: eq(sessionDefs.code, 'morning'),
        });
      }

      const sTime = targetSessionDef?.defaultStartsAt?.slice(0, 5) || '08:00';
      const eTime = targetSessionDef?.defaultEndsAt?.slice(0, 5) || '12:00';
      const nowIso = new Date().toISOString();

      const service = await tx.query.clinicServices.findFirst({
        where: eq(clinicServices.id, apt.serviceId),
      });
      const categoryPrefix = service?.codePrefix || 'U';
      const categoryId = service?.serviceCategoryId || null;
      const sessionPrefix = targetSessionDef?.codePrefix || '';

      const doctorCondition = apt.practitionerId
        ? eq(appointments.practitionerId, apt.practitionerId)
        : isNull(appointments.practitionerId);

      const [activeCountRow] = await tx
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.scheduledDate, targetDate),
            doctorCondition,
            sql`${appointments.id} != ${apt.id}`,
            inArray(appointments.status, [
              DB_APPOINTMENT_STATUS.BOOKED,
              DB_APPOINTMENT_STATUS.WAITING,
              DB_APPOINTMENT_STATUS.IN_SERVICE,
            ]),
          ),
        );
      let numericQueueNumber = (activeCountRow?.count || 0) + 1;

      const ticketScopeCondition = apt.practitionerId
        ? eq(queueTickets.doctorId, apt.practitionerId)
        : and(
            isNull(queueTickets.doctorId),
            eq(queueTickets.serviceId, apt.serviceId),
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

      const oldTickets = await tx
        .select()
        .from(queueTickets)
        .where(eq(queueTickets.appointmentId, apt.id));

      if (oldTickets.length > 0) {
        for (const oldT of oldTickets) {
          await tx
            .update(queueTickets)
            .set({
              status: QUEUE_TICKET_STATUS.CANCELLED,
              updatedAt: nowIso,
            })
            .where(eq(queueTickets.id, oldT.id));
        }
      }

      const [newTicket] = await tx
        .insert(queueTickets)
        .values({
          appointmentId: apt.id,
          serviceId: apt.serviceId,
          categoryId,
          sessionId: targetSessionDef?.id || null,
          patientId: apt.patientId || null,
          doctorId: apt.practitionerId || null,
          roomId: null,
          queueDate: targetDate,
          queueNumber: formattedTicketNumber,
          status: QUEUE_TICKET_STATUS.WAITING,
          priority: QUEUE_PRIORITY.REGULAR,
          waitingPosition: numericQueueNumber,
          carriedOver: true,
          source: 'online',
          assignedAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .returning();

      if (oldTickets.length > 0 && newTicket) {
        for (const oldT of oldTickets) {
          await tx
            .update(queueTickets)
            .set({
              movedTo: newTicket.id,
              updatedAt: nowIso,
            })
            .where(eq(queueTickets.id, oldT.id));
        }
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
        })
        .catch(() => {});

      // Recalculate target date queue
      await queuePositionRecalculationService
        .recalculateDoctorQueue({
          serviceDate: targetDate,
          practitionerId: oldDoctorId,
        })
        .catch(() => {});
    }

    const updated = await findById(appointmentId);
    if (!updated) {
      throw new NotFoundException(
        'Janji temu tidak ditemukan setelah pembaruan',
      );
    }
    return updated;
  }
}

async function validateRescheduleAuthorization(
  db: DrizzleDatabase,
  apt: typeof appointments.$inferSelect,
  userId: string,
  user?: any,
): Promise<{ isAdmin: boolean }> {
  const rawRole =
    typeof user?.role === 'object'
      ? user?.role?.name || user?.role?.code
      : user?.role || user?.systemRole;
  const userRole = (rawRole || '').toString().toLowerCase();

  const allowedRoles = [
    ...CLINIC_ADMIN_STAFF_ROLE_CODES.map((c) => c.toLowerCase()),
    'admin',
    'staff',
    'staf',
    'superadmin',
    'doctor',
    'practitioner',
  ];

  if (allowedRoles.includes(userRole)) {
    return { isAdmin: true };
  }

  const staffRole = await db
    .select({ code: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        inArray(sql`lower(${roles.code})`, [
          'admin',
          'staff',
          'staf',
          'superadmin',
          'doctor',
          'practitioner',
        ]),
      ),
    )
    .limit(1);

  if (staffRole.length > 0) {
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

  throw new ForbiddenException(
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
    throw new BadRequestException(
      `Janji temu tidak dapat dijadwalkan ulang pada status '${apt.status}'`,
    );
  }

  if (!isAdmin) {
    if (apt.checkedInAt) {
      throw new BadRequestException(
        'Pasien sudah melakukan check-in di klinik. Perubahan jadwal hanya dapat dilakukan oleh petugas klinik.',
      );
    }

    const [activeTicket] = await db
      .select({ status: queueTickets.status })
      .from(queueTickets)
      .where(eq(queueTickets.appointmentId, apt.id))
      .limit(1);

    if (activeTicket && activeTicket.status === QUEUE_TICKET_STATUS.CALLED) {
      throw new BadRequestException(
        'Nomor antrean sedang dipanggil oleh petugas klinik. Silakan hubungi meja admisi klinik.',
      );
    }

    const today = new Date().toISOString().split('T')[0];
    if (apt.scheduledDate === today && apt.scheduledEndTime) {
      const overflowSetting = await db.query.clinicSettings.findFirst({
        where: eq(clinicSettings.key, 'queue.overflow_tolerance_minutes'),
      });
      const bufferMinutes =
        typeof overflowSetting?.value === 'number'
          ? overflowSetting.value
          : 30;

      const [endH, endM] = apt.scheduledEndTime.split(':').map(Number);
      const sessionEnd = new Date();
      sessionEnd.setHours(endH, endM + bufferMinutes, 0, 0);

      if (new Date() > sessionEnd) {
        throw new BadRequestException(
          'Sesi praktik ini telah berakhir. Silakan hubungi petugas klinik untuk bantuan reschedule.',
        );
      }
    }
  }
}
