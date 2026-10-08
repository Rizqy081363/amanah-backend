import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointmentStatusEvents,
  appointments,
  clinicServices,
  patientAffiliations,
  patientProfiles,
  practitionerScheduleSessions,
  queueTickets,
  sessionDefs,
} from '../../../../database/schema';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { RescheduleAppointmentDto } from '../../presentation/dto/reschedule-appointment.dto';
import { allocateSlotTiming } from './appointment-slot.helper';
import {
  DEFAULT_FALLBACK_CAPACITY,
  resolveQueueLoadStatus,
} from '../../../queue-engine/domain/constants/queue-load.constants';

export class AppointmentRescheduleHandler {
  static async getRescheduleOptions(
    db: DrizzleDatabase,
    appointmentId: string,
    userId: string,
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

    await validateRescheduleAuthorization(db, apt, userId);
    validateAppointmentStateForReschedule(apt);

    let availableDates: any[] = [];
    if (apt.practitionerId) {
      const today = new Date().toISOString().split('T')[0];
      const candidateSessions =
        await db.query.practitionerScheduleSessions.findMany({
          where: and(
            eq(practitionerScheduleSessions.practitionerId, apt.practitionerId),
            gte(practitionerScheduleSessions.scheduleDate, today),
            eq(practitionerScheduleSessions.status, 'open'),
          ),
          orderBy: [
            asc(practitionerScheduleSessions.scheduleDate),
            asc(practitionerScheduleSessions.startTime),
          ],
        });

      const groupedByDate: Record<string, any[]> = {};
      for (const sess of candidateSessions) {
        if (!groupedByDate[sess.scheduleDate]) {
          groupedByDate[sess.scheduleDate] = [];
        }
        const cap =
          sess.capacity > 0 ? sess.capacity : DEFAULT_FALLBACK_CAPACITY;
        const booked = Math.max(0, cap - sess.availableSlots);
        const loadRatio = booked / cap;
        const loadStatus = resolveQueueLoadStatus(loadRatio);

        groupedByDate[sess.scheduleDate].push({
          sessionId: sess.id,
          startTime: sess.startTime.slice(0, 5),
          endTime: sess.endTime.slice(0, 5),
          shift: sess.sessionLabel,
          sessionShift: sess.sessionShift,
          availableSlots: sess.availableSlots,
          capacity: sess.capacity,
          loadStatus,
          isAvailable: true,
        });
      }

      availableDates = Object.entries(groupedByDate).map(([date, shifts]) => ({
        date,
        shifts,
      }));
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
  ): Promise<AppointmentEntity> {
    await db.transaction(async (tx) => {
      const [apt] = await tx
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId))
        .for('update');

      if (!apt) {
        throw new NotFoundException('Janji temu tidak ditemukan');
      }

      await validateRescheduleAuthorization(tx, apt, userId);
      validateAppointmentStateForReschedule(apt);

      const targetSession = await resolveTargetScheduleSession(tx, dto);
      const targetDate = dto.target_date || dto.newDate!;
      const nowIso = new Date().toISOString();

      await transferSessionCapacity(
        tx,
        apt.scheduleSessionId,
        targetSession,
        nowIso,
      );

      const slotTiming = await allocateRescheduledSlotTiming(
        tx,
        apt,
        targetSession,
        targetDate,
        appointmentId,
      );

      await persistRescheduledAppointment(
        tx,
        apt,
        targetSession,
        targetDate,
        slotTiming,
        userId,
        nowIso,
      );

      await synchronizeQueueTicket(tx, apt, targetSession, targetDate, nowIso);

      await recordRescheduleStatusEvent(
        tx,
        appointmentId,
        apt.status,
        userId,
        dto.reason,
      );
    });

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
): Promise<void> {
  if (apt.createdBy === userId) {
    return;
  }

  const affiliation = await db.query.patientAffiliations.findFirst({
    where: and(
      eq(patientAffiliations.userId, userId),
      eq(patientAffiliations.patientId, apt.patientId),
    ),
  });
  if (affiliation) {
    return;
  }

  const ownProfile = await db.query.patientProfiles.findFirst({
    where: and(
      eq(patientProfiles.userId, userId),
      eq(patientProfiles.id, apt.patientId),
    ),
  });
  if (ownProfile) {
    return;
  }

  throw new ForbiddenException(
    'Anda tidak berhak menjadwalkan ulang janji temu ini',
  );
}

function validateAppointmentStateForReschedule(
  apt: typeof appointments.$inferSelect,
): void {
  if (apt.checkedInAt) {
    throw new BadRequestException(
      'Pasien sudah melakukan check-in di klinik. Perubahan jadwal hanya dapat dilakukan oleh petugas klinik.',
    );
  }
  if (
    apt.status === 'in_service' ||
    apt.status === 'completed' ||
    apt.status === 'cancelled'
  ) {
    throw new BadRequestException(
      'Janji temu tidak dapat dijadwalkan ulang pada status ini',
    );
  }
}

async function resolveTargetScheduleSession(
  tx: DrizzleDatabase,
  dto: RescheduleAppointmentDto,
): Promise<typeof practitionerScheduleSessions.$inferSelect> {
  const targetSessionId = dto.target_session_id || dto.newSessionId;
  const targetDate = dto.target_date || dto.newDate;

  if (!targetSessionId || !targetDate) {
    throw new BadRequestException(
      'Target sesi dan tanggal reschedule wajib diisi',
    );
  }

  const [targetSession] = await tx
    .select()
    .from(practitionerScheduleSessions)
    .where(eq(practitionerScheduleSessions.id, targetSessionId))
    .for('update');

  if (!targetSession) {
    throw new NotFoundException('Sesi jadwal tujuan tidak ditemukan');
  }

  if (targetSession.status !== 'open') {
    throw new BadRequestException(
      'Sesi jadwal yang dipilih sedang tidak aktif atau ditutup',
    );
  }

  return targetSession;
}

async function transferSessionCapacity(
  tx: DrizzleDatabase,
  oldSessionId: string | null,
  targetSession: typeof practitionerScheduleSessions.$inferSelect,
  nowIso: string,
): Promise<void> {
  await tx
    .update(practitionerScheduleSessions)
    .set({
      availableSlots: Math.max(0, targetSession.availableSlots - 1),
      updatedAt: nowIso,
    })
    .where(eq(practitionerScheduleSessions.id, targetSession.id));

  if (!oldSessionId || oldSessionId === targetSession.id) {
    return;
  }

  const [oldSession] = await tx
    .select()
    .from(practitionerScheduleSessions)
    .where(eq(practitionerScheduleSessions.id, oldSessionId))
    .for('update');

  if (oldSession) {
    await tx
      .update(practitionerScheduleSessions)
      .set({
        availableSlots: Math.min(
          oldSession.capacity,
          oldSession.availableSlots + 1,
        ),
        updatedAt: nowIso,
      })
      .where(eq(practitionerScheduleSessions.id, oldSession.id));
  }
}

async function allocateRescheduledSlotTiming(
  tx: DrizzleDatabase,
  currentApt: typeof appointments.$inferSelect,
  targetSession: typeof practitionerScheduleSessions.$inferSelect,
  targetDate: string,
  appointmentId: string,
): Promise<{ startTime: string; endTime: string }> {
  const existingAppts = await tx.query.appointments.findMany({
    where: and(
      eq(appointments.practitionerId, targetSession.practitionerId),
      eq(appointments.scheduledDate, targetDate),
      inArray(appointments.status, [
        'booked',
        'checked_in',
        'waiting',
        'in_service',
      ]),
    ),
  });

  const otherApptTimes = existingAppts
    .filter((a) => a.id !== appointmentId && a.scheduledStartTime)
    .map((a) => a.scheduledStartTime as string);

  // When the patient reschedules within the same session on the same date,
  // their current slot is freed but must not be immediately re-assigned to
  // them. Add their own slot to the occupied set so the allocator advances
  // to the next genuinely free slot.
  const isSameSession =
    currentApt.scheduleSessionId === targetSession.id &&
    currentApt.scheduledDate === targetDate;

  const existingTimes =
    isSameSession && currentApt.scheduledStartTime
      ? [...otherApptTimes, currentApt.scheduledStartTime]
      : otherApptTimes;

  const slotTiming = allocateSlotTiming(
    targetSession.startTime,
    targetSession.endTime,
    existingTimes,
    30,
    targetDate,
  );

  if (slotTiming) {
    return slotTiming;
  }

  return {
    startTime: targetSession.startTime.slice(0, 5),
    endTime: targetSession.endTime.slice(0, 5),
  };
}

async function persistRescheduledAppointment(
  tx: DrizzleDatabase,
  apt: typeof appointments.$inferSelect,
  targetSession: typeof practitionerScheduleSessions.$inferSelect,
  targetDate: string,
  slotTiming: { startTime: string; endTime: string },
  userId: string,
  nowIso: string,
): Promise<void> {
  await tx
    .update(appointments)
    .set({
      practitionerId: targetSession.practitionerId,
      roomId: targetSession.roomId ?? apt.roomId,
      scheduledDate: targetDate,
      scheduledStartTime: slotTiming.startTime,
      scheduledEndTime: slotTiming.endTime,
      scheduleSessionId: targetSession.id,
      updatedBy: userId,
      updatedAt: nowIso,
    })
    .where(eq(appointments.id, apt.id));
}

async function calculateRescheduledQueueNumber(
  tx: DrizzleDatabase,
  serviceId: string,
  targetDate: string,
  sessionLabel: string,
): Promise<string> {
  const existingTickets = await tx
    .select({ queueNumber: queueTickets.queueNumber })
    .from(queueTickets)
    .where(
      and(
        eq(queueTickets.serviceId, serviceId),
        eq(queueTickets.queueDate, targetDate),
      ),
    );

  const usedNumbers = new Set(existingTickets.map((t) => t.queueNumber));
  const prefix = (sessionLabel || 'P').charAt(0).toUpperCase();
  let idx = existingTickets.length + 1;
  while (usedNumbers.has(`${prefix}-${String(idx).padStart(3, '0')}`)) {
    idx++;
  }
  return `${prefix}-${String(idx).padStart(3, '0')}`;
}

async function synchronizeQueueTicket(
  tx: DrizzleDatabase,
  apt: typeof appointments.$inferSelect,
  targetSession: typeof practitionerScheduleSessions.$inferSelect,
  targetDate: string,
  nowIso: string,
): Promise<void> {
  const service = await tx.query.clinicServices.findFirst({
    where: eq(clinicServices.id, apt.serviceId),
  });
  if (!service) {
    throw new NotFoundException('Layanan klinik tidak ditemukan');
  }
  const categoryPrefix = service.codePrefix;

  const sessionDef = targetSession.sessionShift
    ? await tx.query.sessionDefs.findFirst({
        where: eq(sessionDefs.code, targetSession.sessionShift),
      })
    : null;

  let numericQueueNumber: number;
  let formattedTicketNumber: string;

  if (service?.id && sessionDef?.id) {
    const counterRes = await tx.execute(sql`
      INSERT INTO queue_counter (service_date, category_id, session_id, last_no)
      VALUES (${targetDate}, ${service.id}::uuid, ${sessionDef.id}::uuid, 1)
      ON CONFLICT (service_date, category_id, session_id)
      DO UPDATE SET last_no = queue_counter.last_no + 1
      RETURNING last_no;
    `);
    numericQueueNumber = Number(counterRes.rows[0]?.last_no ?? 1);
    formattedTicketNumber = `${categoryPrefix}-${String(numericQueueNumber).padStart(3, '0')}`;
  } else {
    formattedTicketNumber = await calculateRescheduledQueueNumber(
      tx,
      apt.serviceId,
      targetDate,
      targetSession.sessionLabel,
    );
    const parsed = parseInt(formattedTicketNumber.split('-')[1] || '1', 10);
    numericQueueNumber = Number.isNaN(parsed) ? 1 : parsed;
  }

  const oldTickets = await tx
    .select()
    .from(queueTickets)
    .where(eq(queueTickets.appointmentId, apt.id));

  const [newTicket] = await tx
    .insert(queueTickets)
    .values({
      appointmentId: apt.id,
      serviceId: apt.serviceId,
      categoryId: service?.id || null,
      sessionId: sessionDef?.id || null,
      patientId: apt.patientId || null,
      doctorId: targetSession.practitionerId || null,
      roomId: targetSession.roomId ?? apt.roomId,
      queueDate: targetDate,
      queueNumber: formattedTicketNumber,
      status: 'waiting',
      priority: 'regular',
      waitingPosition: numericQueueNumber,
      carriedOver: true,
      source: 'online',
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .returning();

  if (oldTickets.length > 0) {
    for (const oldT of oldTickets) {
      if (oldT.id !== newTicket?.id) {
        await tx
          .update(queueTickets)
          .set({
            status: 'cancelled',
            movedTo: newTicket ? newTicket.id : null,
            updatedAt: nowIso,
          })
          .where(eq(queueTickets.id, oldT.id));
      }
    }
  }

  await tx
    .update(appointments)
    .set({
      queueNumber: numericQueueNumber,
      updatedAt: nowIso,
    })
    .where(eq(appointments.id, apt.id));
}

async function recordRescheduleStatusEvent(
  tx: DrizzleDatabase,
  appointmentId: string,
  status: (typeof appointments.$inferSelect)['status'],
  userId: string,
  reason?: string,
): Promise<void> {
  await tx.insert(appointmentStatusEvents).values({
    appointmentId,
    previousStatus: status,
    newStatus: status,
    changedBy: userId,
    reason: reason || 'Reschedule janji temu',
  });
}
