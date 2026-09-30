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

    if (apt.createdBy !== userId) {
      const affiliation = await db.query.patientAffiliations.findFirst({
        where: and(
          eq(patientAffiliations.userId, userId),
          eq(patientAffiliations.patientId, apt.patientId),
        ),
      });
      const ownProfile = await db.query.patientProfiles.findFirst({
        where: and(
          eq(patientProfiles.userId, userId),
          eq(patientProfiles.id, apt.patientId),
        ),
      });

      if (!affiliation && !ownProfile) {
        throw new ForbiddenException(
          'Anda tidak berhak mengakses janji temu ini',
        );
      }
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
        const hour = parseInt(sess.startTime.slice(0, 2), 10);
        const shift =
          hour < 12
            ? 'Pagi'
            : hour < 15
              ? 'Siang'
              : hour < 18
                ? 'Sore'
                : 'Malam';
        groupedByDate[sess.scheduleDate].push({
          sessionId: sess.id,
          startTime: sess.startTime.slice(0, 5),
          endTime: sess.endTime.slice(0, 5),
          shift,
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
    return await db.transaction(async (tx) => {
      const [apt] = await tx
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId))
        .for('update');

      if (!apt) {
        throw new NotFoundException('Janji temu tidak ditemukan');
      }

      if (apt.createdBy !== userId) {
        const affiliation = await tx.query.patientAffiliations.findFirst({
          where: and(
            eq(patientAffiliations.userId, userId),
            eq(patientAffiliations.patientId, apt.patientId),
          ),
        });
        const ownProfile = await tx.query.patientProfiles.findFirst({
          where: and(
            eq(patientProfiles.userId, userId),
            eq(patientProfiles.id, apt.patientId),
          ),
        });

        if (!affiliation && !ownProfile) {
          throw new ForbiddenException(
            'Anda tidak berhak menjadwalkan ulang janji temu ini',
          );
        }
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

      if (
        targetSession.availableSlots <= 0 ||
        targetSession.status !== 'open'
      ) {
        throw new BadRequestException(
          'Slot kuota pada sesi jadwal yang dipilih sudah penuh',
        );
      }

      const nowIso = new Date().toISOString();

      await tx
        .update(practitionerScheduleSessions)
        .set({
          availableSlots: targetSession.availableSlots - 1,
          updatedAt: nowIso,
        })
        .where(eq(practitionerScheduleSessions.id, targetSession.id));

      if (apt.scheduleSessionId) {
        const [oldSession] = await tx
          .select()
          .from(practitionerScheduleSessions)
          .where(eq(practitionerScheduleSessions.id, apt.scheduleSessionId))
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
          'Tidak ada slot antrean yang tersedia untuk jadwal yang dipilih.',
        );
      }

      await tx
        .update(appointments)
        .set({
          scheduledDate: targetDate,
          scheduledStartTime: slotTiming.startTime,
          scheduledEndTime: slotTiming.endTime,
          scheduleSessionId: targetSession.id,
          updatedBy: userId,
          updatedAt: nowIso,
        })
        .where(eq(appointments.id, appointmentId));

      let nextQueueNumber: string | undefined;
      if (targetDate !== apt.scheduledDate) {
        const existingTickets = await tx
          .select({ queueNumber: queueTickets.queueNumber })
          .from(queueTickets)
          .where(
            and(
              eq(queueTickets.serviceId, apt.serviceId),
              eq(queueTickets.queueDate, targetDate),
            ),
          );
        const usedNumbers = new Set(existingTickets.map((t) => t.queueNumber));
        const prefix = (
          targetSession.sessionLabel ||
          targetSession.sessionShift ||
          'P'
        )
          .charAt(0)
          .toUpperCase();
        let idx = existingTickets.length + 1;
        while (usedNumbers.has(`${prefix}-${String(idx).padStart(3, '0')}`)) {
          idx++;
        }
        nextQueueNumber = `${prefix}-${String(idx).padStart(3, '0')}`;
      }

      await tx
        .update(queueTickets)
        .set({
          queueDate: targetDate,
          ...(nextQueueNumber ? { queueNumber: nextQueueNumber } : {}),
          updatedAt: nowIso,
        })
        .where(eq(queueTickets.appointmentId, appointmentId));

      await tx.insert(appointmentStatusEvents).values({
        appointmentId,
        previousStatus: apt.status,
        newStatus: apt.status,
        changedBy: userId,
        reason: dto.reason || 'Reschedule janji temu',
      });

      const updated = await findById(appointmentId);
      if (!updated) {
        throw new NotFoundException(
          'Janji temu tidak ditemukan setelah pembaruan',
        );
      }
      return updated;
    });
  }
}
