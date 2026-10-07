import { UnprocessableEntityException } from '@nestjs/common';
import { and, asc, eq, ilike, inArray, not, or, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  childImmunizationIntakes,
  clinicRooms,
  clinicSchedulePolicies,
  clinicServices,
  clinicUnits,
  maternalHealthIntakes,
  medicalIntakeSubmissions,
  practitionerScheduleSessions,
  practitioners,
  queueTickets,
} from '../../../../database/schema';
import {
  ScheduleShiftRegistry,
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

    const targetShift = ScheduleShiftRegistry.resolve(data.session).shift;

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

    let isLayananKebidanan = false;
    let clinicServiceRecord: any = null;
    if (data.layananId) {
      clinicServiceRecord = await db.query.clinicServices.findFirst({
        where: eq(clinicServices.id, data.layananId),
        with: {
          serviceCategory: true,
          medicalSpecialty: true,
        },
      });

      if (
        clinicServiceRecord &&
        (clinicServiceRecord.serviceCategory?.code === 'layanan_kebidanan' ||
          clinicServiceRecord.medicalFlow === 'pregnancy' ||
          clinicServiceRecord.medicalFlow === 'immunization')
      ) {
        isLayananKebidanan = true;
        const kiaUnit = await db.query.clinicUnits.findFirst({
          where: or(
            eq(clinicUnits.code, 'poli_kia'),
            ilike(clinicUnits.name, '%kia%'),
          ),
        });
        if (kiaUnit) {
          data.poliklinikId = kiaUnit.id;
        }

        if (practitionerId) {
          const prac = await db.query.practitioners.findFirst({
            where: eq(practitioners.id, practitionerId),
            with: {
              medicalSpecialty: true,
              staffProfile: true,
            },
          });
          const isMidwife = prac?.staffProfile?.staffType === 'midwife';
          const isKiaSpecialty =
            prac?.medicalSpecialty?.code === 'maternal_child_health';
          if (!isMidwife && !isKiaSpecialty) {
            throw new UnprocessableEntityException(
              'Layanan KIA hanya dapat ditangani oleh Bidan atau Dokter Spesialis KIA',
            );
          }
        }
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
            practitioner: {
              with: {
                staffProfile: true,
                medicalSpecialty: true,
              },
            },
          },
        });

      const candidateSessions = allCandidateSessions.filter((s) => {
        if (data.poliklinikId) {
          const inUnit =
            (s.roomId && unitRoomIds.has(s.roomId)) ||
            s.clinicRoom?.unitId === data.poliklinikId;
          if (!inUnit) return false;
        }
        if (isLayananKebidanan) {
          const prac = s.practitioner;
          const isMidwife = prac?.staffProfile?.staffType === 'midwife';
          const isKiaSpecialty =
            prac?.medicalSpecialty?.code === 'maternal_child_health';
          if (!isMidwife && !isKiaSpecialty) return false;
        }
        return true;
      });

      let matchedSession: (typeof allCandidateSessions)[number] | undefined;
      let matchedSlotTiming: { startTime: string; endTime: string } | null =
        null;
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
          occupancyConditions.push(
            eq(appointments.practitionerId, targetPracId),
          );
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

    const effectiveMedicalFlow =
      (clinicServiceRecord?.medicalFlow as any) ||
      (data as any).medicalFlow ||
      (clinicServiceRecord?.name?.toLowerCase().includes('imunisasi')
        ? 'immunization'
        : clinicServiceRecord?.name?.toLowerCase().includes('kebidanan') ||
            clinicServiceRecord?.name?.toLowerCase().includes('persalinan')
          ? 'pregnancy'
          : null);

    const targetUnitId = data.poliklinikId || room?.unitId;
    let unitPrefix: string | null = null;
    if (targetUnitId) {
      const unit = await db.query.clinicUnits.findFirst({
        where: eq(clinicUnits.id, targetUnitId),
      });
      if (unit?.queuePrefix) {
        unitPrefix = unit.queuePrefix;
      }
    }

    let numericQueueNumber = 1;
    if (practitionerId && data.appointmentDate) {
      const [maxQ] = await db
        .select({
          max: sql<number>`COALESCE(MAX(${appointments.queueNumber}), 0)`,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.practitionerId, practitionerId),
            eq(appointments.scheduledDate, data.appointmentDate),
          ),
        );
      numericQueueNumber = Number(maxQ?.max || 0) + 1;
    }

    let ticketIndex = numericQueueNumber;
    let formattedTicketNumber = unitPrefix
      ? `${unitPrefix}-${String(ticketIndex).padStart(3, '0')}`
      : String(ticketIndex);

    if (data.layananId && data.appointmentDate) {
      const existingTickets = await db
        .select({ queueNumber: queueTickets.queueNumber })
        .from(queueTickets)
        .where(
          and(
            eq(queueTickets.serviceId, data.layananId),
            eq(queueTickets.queueDate, data.appointmentDate),
          ),
        );

      const usedNumbers = new Set(existingTickets.map((t) => t.queueNumber));
      while (usedNumbers.has(formattedTicketNumber)) {
        ticketIndex++;
        formattedTicketNumber = unitPrefix
          ? `${unitPrefix}-${String(ticketIndex).padStart(3, '0')}`
          : String(ticketIndex);
      }
    }
    numericQueueNumber = ticketIndex;

    const [startH, startM] = (startTime || '08:00')
      .split(':')
      .map((v) => parseInt(v, 10));
    const estimatedStart = new Date(`${data.appointmentDate}T00:00:00.000Z`);
    estimatedStart.setUTCHours(
      Number.isNaN(startH) ? 8 : startH,
      Number.isNaN(startM) ? 0 : startM,
      0,
      0,
    );

    const consultationMinutes =
      policy?.defaultConsultationDurationMinutes ?? 30;
    const estimatedEnd = new Date(
      estimatedStart.getTime() + consultationMinutes * 60_000,
    );

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
        queueNumber: numericQueueNumber,
        estimatedStartAt: estimatedStart.toISOString(),
        estimatedEndAt: estimatedEnd.toISOString(),
        complaint: data.complaint || null,
        medicalFlow: effectiveMedicalFlow,
      })
      .returning();

    const [ticket] = await db
      .insert(queueTickets)
      .values({
        appointmentId: apt.id,
        serviceId: data.layananId,
        roomId: room ? room.id : null,
        queueDate: data.appointmentDate,
        queueNumber: formattedTicketNumber,
        status: 'waiting',
        priority: 'regular',
        waitingPosition: 1,
      })
      .returning();

    if (data.sourceIntakeId) {
      await db
        .update(maternalHealthIntakes)
        .set({ appointmentId: apt.id })
        .where(
          or(
            eq(maternalHealthIntakes.id, data.sourceIntakeId),
            eq(maternalHealthIntakes.intakeSubmissionId, data.sourceIntakeId),
          ),
        );

      const imm = await db.query.childImmunizationIntakes.findFirst({
        where: or(
          eq(childImmunizationIntakes.id, data.sourceIntakeId),
          eq(childImmunizationIntakes.intakeSubmissionId, data.sourceIntakeId),
        ),
      });
      if (imm) {
        await db
          .update(childImmunizationIntakes)
          .set({ appointmentId: apt.id })
          .where(eq(childImmunizationIntakes.id, imm.id));
        if (imm.intakeSubmissionId) {
          await db
            .update(medicalIntakeSubmissions)
            .set({ appointmentId: apt.id })
            .where(eq(medicalIntakeSubmissions.id, imm.intakeSubmissionId));
        }
      }

      await db
        .update(medicalIntakeSubmissions)
        .set({ appointmentId: apt.id })
        .where(eq(medicalIntakeSubmissions.id, data.sourceIntakeId));
    }

    const fullApt = await findById(apt.id);
    return (
      fullApt ||
      AppointmentRecordMapper.toEntity(apt, ticket, data.poliklinikId)
    );
  }
}
