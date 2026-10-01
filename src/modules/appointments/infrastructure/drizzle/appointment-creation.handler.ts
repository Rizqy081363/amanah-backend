import { UnprocessableEntityException } from '@nestjs/common';
import { and, asc, eq, inArray, not, or } from 'drizzle-orm';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  clinicSchedulePolicies,
  clinicServices,
  practitionerScheduleSessions,
  practitioners,
  queueTickets,
} from '../../../../database/schema';
import {
  SESSION_TO_SHIFT_MAP,
  SHIFT_TIMING_CONFIGS,
} from '../../../schedules/domain/constants/schedule-shift.constants';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { AppointmentRecordMapper } from './appointment-record.mapper';
import { allocateSlotTiming } from './appointment-slot.helper';

export class AppointmentCreationHandler {
  static async create(
    db: DrizzleDatabase,
    data: Omit<AppointmentEntity, 'id' | 'createdAt' | 'updatedAt'>,
    findById: (id: string) => Promise<AppointmentEntity | null>,
  ): Promise<AppointmentEntity> {
    const bookingCode = `BOOK-${Date.now().toString(36).toUpperCase()}-${Math.floor(
      Math.random() * 1000,
    )}`;

    const targetShift = SESSION_TO_SHIFT_MAP[data.session] || 'morning';

    const policy = await db.query.clinicSchedulePolicies.findFirst({
      where: eq(clinicSchedulePolicies.code, 'default'),
    });

    const shiftConfig =
      SHIFT_TIMING_CONFIGS[targetShift] || SHIFT_TIMING_CONFIGS.morning;
    let defaultStart = `${shiftConfig.defaultStartTime}:00`;
    let defaultEnd = `${shiftConfig.defaultEndTime}:00`;

    if (policy) {
      if (targetShift === 'early_morning') {
        defaultStart = `${policy.earlyMorningStart}:00`;
        defaultEnd = `${policy.earlyMorningEnd}:00`;
      } else if (targetShift === 'morning') {
        defaultStart = `${policy.morningStart}:00`;
        defaultEnd = `${policy.morningEnd}:00`;
      } else if (targetShift === 'afternoon') {
        defaultStart = `${policy.afternoonStart}:00`;
        defaultEnd = `${policy.afternoonEnd}:00`;
      } else if (targetShift === 'night') {
        defaultStart = `${policy.nightStart}:00`;
        defaultEnd = `${policy.nightEnd}:00`;
      }
    }

    let room: typeof clinicRooms.$inferSelect | undefined;
    const unitRooms = data.poliklinikId
      ? await db.query.clinicRooms.findMany({
          where: eq(clinicRooms.unitId, data.poliklinikId),
        })
      : [];
    const unitRoomIds = new Set(unitRooms.map((r) => r.id));
    if (unitRooms.length > 0) {
      room = unitRooms[0];
    }

    let practitionerId: string | null = null;
    if (data.staffId) {
      const prac = await db.query.practitioners.findFirst({
        where: or(
          eq(practitioners.id, data.staffId),
          eq(practitioners.staffProfileId, data.staffId),
        ),
      });
      practitionerId = prac ? prac.id : data.staffId;
    }

    if (data.layananId) {
      const service = await db.query.clinicServices.findFirst({
        where: eq(clinicServices.id, data.layananId),
        with: {
          serviceCategory: true,
          medicalSpecialty: true,
        },
      });

      if (service && service.serviceCategory?.code === 'layanan_kebidanan') {
        if (practitionerId) {
          const prac = await db.query.practitioners.findFirst({
            where: eq(practitioners.id, practitionerId),
            with: {
              medicalSpecialty: true,
              staffProfile: true,
            },
          });
          const isMidwife = prac?.staffProfile?.staffType === 'midwife';
          const isKiaSpecialty = prac?.medicalSpecialty?.code === 'maternal_child_health';
          if (!isMidwife && !isKiaSpecialty) {
            throw new UnprocessableEntityException(
              'Layanan KIA hanya dapat ditangani oleh Bidan atau Dokter Spesialis KIA',
            );
          }
        }
      }
    }

    let scheduleSessionId: string | null = null;
    let startTime = defaultStart;
    let endTime = defaultEnd;

    if (data.appointmentDate) {
      const sessionConditions = [
        eq(practitionerScheduleSessions.scheduleDate, data.appointmentDate),
        eq(practitionerScheduleSessions.sessionShift, targetShift),
        eq(practitionerScheduleSessions.status, 'open'),
      ];
      if (practitionerId) {
        sessionConditions.push(
          eq(practitionerScheduleSessions.practitionerId, practitionerId),
        );
      }

      const allCandidateSessions =
        await db.query.practitionerScheduleSessions.findMany({
          where: and(...sessionConditions),
          orderBy: [asc(practitionerScheduleSessions.startTime)],
          with: {
            clinicRoom: true,
          },
        });

      // Filter sessions strictly to the requested poliklinik
      const candidateSessions = data.poliklinikId
        ? allCandidateSessions.filter((s) => {
            if (s.roomId && unitRoomIds.has(s.roomId)) return true;
            if (s.clinicRoom?.unitId === data.poliklinikId) return true;
            return false;
          })
        : allCandidateSessions;

      let matchedSession: (typeof allCandidateSessions)[number] | undefined;
      let matchedSlotTiming: { startTime: string; endTime: string } | null = null;
      let matchedRoom = room;

      for (const candidate of candidateSessions) {
        let candidateRoom = room;
        if (candidate.roomId) {
          const foundRoom = unitRooms.find((r) => r.id === candidate.roomId);
          if (foundRoom) {
            candidateRoom = foundRoom;
          } else {
            candidateRoom = await db.query.clinicRooms.findFirst({
              where: eq(clinicRooms.id, candidate.roomId),
            });
          }
        }

        const targetPracId = candidate.practitionerId;
        const targetRoomId = candidateRoom?.id;

        const occupancyConditions: any[] = [
          eq(appointments.scheduledDate, data.appointmentDate),
          not(inArray(appointments.status, ['cancelled', 'no_show'])),
        ];

        if (targetPracId && targetRoomId) {
          occupancyConditions.push(
            or(
              eq(appointments.practitionerId, targetPracId),
              eq(appointments.roomId, targetRoomId),
            ),
          );
        } else if (targetPracId) {
          occupancyConditions.push(eq(appointments.practitionerId, targetPracId));
        } else if (targetRoomId) {
          occupancyConditions.push(eq(appointments.roomId, targetRoomId));
        }

        const existingAppts = await db.query.appointments.findMany({
          where: and(...occupancyConditions),
        });

        const existingTimes = existingAppts
          .filter((a) => a.scheduledStartTime)
          .map((a) => a.scheduledStartTime as string);

        const slotTiming = allocateSlotTiming(
          candidate.startTime,
          candidate.endTime,
          existingTimes,
          policy?.defaultConsultationDurationMinutes ?? 30,
          data.appointmentDate,
        );

        if (slotTiming) {
          matchedSession = candidate;
          matchedSlotTiming = slotTiming;
          matchedRoom = candidateRoom;
          practitionerId = targetPracId;
          break;
        }
      }

      if (matchedSession && matchedSlotTiming) {
        scheduleSessionId = matchedSession.id;
        startTime = matchedSlotTiming.startTime;
        endTime = matchedSlotTiming.endTime;
        if (matchedRoom) {
          room = matchedRoom;
        }
        if (matchedSession.availableSlots > 0) {
          await db
            .update(practitionerScheduleSessions)
            .set({
              availableSlots: Math.max(0, matchedSession.availableSlots - 1),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(practitionerScheduleSessions.id, matchedSession.id));
        }
      } else if (candidateSessions.length > 0) {
        throw new UnprocessableEntityException(
          'Tidak ada slot antrean yang tersedia untuk sesi ini karena waktu praktik telah terlewati atau kuota penuh.',
        );
      } else {
        const defaultSlot = allocateSlotTiming(
          defaultStart,
          defaultEnd,
          [],
          policy?.defaultConsultationDurationMinutes ?? 30,
          data.appointmentDate,
        );
        if (!defaultSlot) {
          throw new UnprocessableEntityException(
            'Tidak ada jadwal atau slot antrean yang tersedia untuk sesi yang dipilih.',
          );
        }
        startTime = defaultSlot.startTime;
        endTime = defaultSlot.endTime;
      }
    }

    const [apt] = await db
      .insert(appointments)
      .values({
        bookingCode,
        patientId: data.patientId,
        practitionerId: practitionerId || null,
        scheduleSessionId: scheduleSessionId || null,
        serviceId: data.layananId,
        roomId: room ? room.id : null,
        visitType:
          data.visitType === 'Kontrol Ulang' ? 'follow_up' : 'new_visit',
        status: 'booked',
        scheduledDate: data.appointmentDate,
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
        complaint: data.complaint || null,
      })
      .returning();

    const [ticket] = await db
      .insert(queueTickets)
      .values({
        appointmentId: apt.id,
        serviceId: data.layananId,
        roomId: room ? room.id : null,
        queueDate: data.appointmentDate,
        queueNumber: data.queueNumber,
        status: 'waiting',
        priority: 'regular',
        waitingPosition: 1,
      })
      .returning();

    const fullApt = await findById(apt.id);
    return (
      fullApt ||
      AppointmentRecordMapper.toEntity(apt, ticket, data.poliklinikId)
    );
  }
}
