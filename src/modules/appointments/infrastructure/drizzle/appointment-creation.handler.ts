import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  clinicSchedulePolicies,
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
    if (data.poliklinikId) {
      room = await db.query.clinicRooms.findFirst({
        where: eq(clinicRooms.unitId, data.poliklinikId),
      });
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

      const candidateSessions =
        await db.query.practitionerScheduleSessions.findMany({
          where: and(...sessionConditions),
          orderBy: [asc(practitionerScheduleSessions.startTime)],
        });

      let matchedSession = candidateSessions[0];
      if (room?.id && candidateSessions.length > 1) {
        const roomSession = candidateSessions.find(
          (s) => s.roomId === room?.id,
        );
        if (roomSession) matchedSession = roomSession;
      }

      if (matchedSession) {
        scheduleSessionId = matchedSession.id;
        practitionerId = matchedSession.practitionerId;
        startTime = matchedSession.startTime;
        endTime = matchedSession.endTime;
        if (matchedSession.roomId && !room) {
          room = await db.query.clinicRooms.findFirst({
            where: eq(clinicRooms.id, matchedSession.roomId),
          });
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
      }

      if (practitionerId) {
        const existingAppts = await db.query.appointments.findMany({
          where: and(
            eq(appointments.practitionerId, practitionerId),
            eq(appointments.scheduledDate, data.appointmentDate),
            inArray(appointments.status, [
              'booked',
              'checked_in',
              'waiting',
              'in_service',
            ]),
          ),
        });

        const existingTimes = existingAppts
          .filter((a) => a.scheduledStartTime)
          .map((a) => a.scheduledStartTime as string);

        const slotTiming = allocateSlotTiming(
          startTime,
          endTime,
          existingTimes,
          policy?.defaultConsultationDurationMinutes ?? 30,
        );
        startTime = slotTiming.startTime;
        endTime = slotTiming.endTime;
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
