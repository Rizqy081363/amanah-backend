import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointmentStatusEvents,
  appointments,
  patientAffiliations,
  patientProfiles,
  practitionerScheduleSessions,
  queueTickets,
} from '../../../../database/schema';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { RescheduleAppointmentDto } from '../../presentation/dto/reschedule-appointment.dto';
import { allocateSlotTiming } from './appointment-slot.helper';

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
        groupedByDate[sess.scheduleDate].push({
          sessionId: sess.id,
          startTime: sess.startTime.slice(0, 5),
          endTime: sess.endTime.slice(0, 5),
          shift: sess.sessionLabel,
          sessionShift: sess.sessionShift,
          availableSlots: sess.availableSlots,
          capacity: sess.capacity,
          isAvailable: sess.availableSlots > 0,
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

      await transferSessionCapacity(tx, apt.scheduleSessionId, targetSession, nowIso);

      const slotTiming = await allocateRescheduledSlotTiming(
        tx,
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

  if (targetSession.availableSlots <= 0) {
    throw new BadRequestException(
      'Slot kuota pada sesi jadwal yang dipilih sudah penuh',
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

  const existingTimes = existingAppts
    .filter((a) => a.id !== appointmentId && a.scheduledStartTime)
    .map((a) => a.scheduledStartTime as string);

  const slotTiming = allocateSlotTiming(
    targetSession.startTime,
    targetSession.endTime,
    existingTimes,
    30,
    targetDate,
  );

  if (!slotTiming) {
    throw new UnprocessableEntityException(
      'Tidak ada slot antrean yang tersedia untuk jadwal yang dipilih',
    );
  }

  return slotTiming;
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
  let nextQueueNumber: string | undefined;
  if (targetDate !== apt.scheduledDate) {
    nextQueueNumber = await calculateRescheduledQueueNumber(
      tx,
      apt.serviceId,
      targetDate,
      targetSession.sessionLabel,
    );
  }

  await tx
    .update(queueTickets)
    .set({
      queueDate: targetDate,
      roomId: targetSession.roomId ?? apt.roomId,
      ...(nextQueueNumber ? { queueNumber: nextQueueNumber } : {}),
      updatedAt: nowIso,
    })
    .where(eq(queueTickets.appointmentId, apt.id));
}

async function recordRescheduleStatusEvent(
  tx: DrizzleDatabase,
  appointmentId: string,
  status: typeof appointments.$inferSelect['status'],
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
