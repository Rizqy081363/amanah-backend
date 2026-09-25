import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lt, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  practitionerScheduleSessions,
  practitioners,
} from '../../../../../../database/schema';
import type {
  AdminDoctorAccumulatedPatientsResponse,
  AdminSessionPatientItem,
  AdminSessionPatientsResponse,
  BookedPatientEntity,
} from '../../../../domain/entities/schedule.entity';
import type { GetAdminDoctorPatientsQueryDto } from '../../../../presentation/dto/get-admin-doctor-patients-query.dto';
import type { GetSessionPatientsQueryDto } from '../../../../presentation/dto/get-session-patients-query.dto';
import { BookedPatientMapper } from '../../mappers/booked-patient.mapper';
import { PractitionerResolver } from '../../resolvers/practitioner.resolver';

const STATUS_BADGE_MAP: Record<string, string> = {
  booked: 'Booked',
  checked_in: 'Menunggu',
  waiting: 'Menunggu',
  in_service: 'Di Sesi',
  completed: 'Selesai',
  cancelled: 'Batal',
  no_show: 'Terlambat',
};

@Injectable()
export class DrizzleSchedulePatientRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
  ) {}

  async getBookedPatients(
    sessionId?: string,
    date?: string,
    staffId?: string,
  ): Promise<BookedPatientEntity[]> {
    const conditions: any[] = [];

    if (sessionId) {
      const session =
        await this.db.query.practitionerScheduleSessions.findFirst({
          where: eq(practitionerScheduleSessions.id, sessionId),
        });
      if (session) {
        const sessStart =
          session.startTime.length === 5
            ? `${session.startTime}:00`
            : session.startTime;
        const sessEnd =
          session.endTime.length === 5
            ? `${session.endTime}:00`
            : session.endTime;
        conditions.push(
          or(
            eq(appointments.scheduleSessionId, sessionId),
            and(
              eq(appointments.practitionerId, session.practitionerId),
              eq(appointments.scheduledDate, session.scheduleDate),
              gte(appointments.scheduledStartTime, sessStart),
              lt(appointments.scheduledStartTime, sessEnd),
            ),
          ),
        );
      } else {
        conditions.push(eq(appointments.scheduleSessionId, sessionId));
      }
    }
    if (date) {
      conditions.push(eq(appointments.scheduledDate, date));
    }
    if (staffId) {
      const practitioner = await this.practitionerResolver.resolve(staffId);
      if (practitioner) {
        conditions.push(eq(appointments.practitionerId, practitioner.id));
      } else {
        return [];
      }
    }

    const appointmentRecords = await this.db.query.appointments.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [
        asc(appointments.scheduledStartTime),
        asc(appointments.createdAt),
      ],
      with: {
        patientProfile: true,
        queueTickets: true,
        practitionerScheduleSession: {
          with: {
            clinicRoom: true,
          },
        },
        clinicRoom: true,
      },
    });

    return appointmentRecords.map((apt) => BookedPatientMapper.toEntity(apt));
  }

  async getAdminSessionPatients(
    practitionerId: string,
    sessionId: string,
    query: GetSessionPatientsQueryDto,
  ): Promise<AdminSessionPatientsResponse> {
    const practitioner =
      await this.practitionerResolver.resolve(practitionerId);
    if (!practitioner) {
      throw new NotFoundException(
        `Dokter dengan ID ${practitionerId} tidak ditemukan`,
      );
    }

    const session = await this.db.query.practitionerScheduleSessions.findFirst({
      where: and(
        eq(practitionerScheduleSessions.id, sessionId),
        eq(practitionerScheduleSessions.practitionerId, practitioner.id),
      ),
      with: {
        clinicRoom: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Sesi jadwal praktik tidak ditemukan`);
    }

    const sessStart =
      session.startTime.length === 5
        ? `${session.startTime}:00`
        : session.startTime;
    const sessEnd =
      session.endTime.length === 5 ? `${session.endTime}:00` : session.endTime;

    const sessionMatchCondition = or(
      eq(appointments.scheduleSessionId, sessionId),
      and(
        eq(appointments.practitionerId, practitioner.id),
        eq(appointments.scheduledDate, session.scheduleDate),
        gte(appointments.scheduledStartTime, sessStart),
        lt(appointments.scheduledStartTime, sessEnd),
      ),
    );

    const conditions: any[] = [sessionMatchCondition];

    if (query.status && query.status !== 'all') {
      if (query.status === 'waiting') {
        conditions.push(
          inArray(appointments.status, ['waiting', 'checked_in', 'booked']),
        );
      } else {
        conditions.push(eq(appointments.status, query.status as any));
      }
    }

    const aptRecords = await this.db.query.appointments.findMany({
      where: and(...conditions),
      orderBy: [
        asc(appointments.scheduledStartTime),
        asc(appointments.createdAt),
      ],
      with: {
        patientProfile: {
          with: {
            patientAddresses: true,
            patientEmergencyContacts: true,
          },
        },
        queueTickets: true,
        clinicRoom: true,
      },
    });

    const unlinkedApptIds = aptRecords
      .filter((a) => !a.scheduleSessionId)
      .map((a) => a.id);

    if (unlinkedApptIds.length > 0) {
      await this.db
        .update(appointments)
        .set({
          scheduleSessionId: session.id,
          updatedAt: new Date().toISOString(),
        })
        .where(inArray(appointments.id, unlinkedApptIds));
    }

    let mappedPatients: AdminSessionPatientItem[] = aptRecords.map((apt) => {
      const ageStr = BookedPatientMapper.calculateAgeString(
        apt.patientProfile?.birthDate,
      );

      const queueNumber =
        apt.queueTickets?.[0]?.queueNumber ||
        `P-${apt.bookingCode ? apt.bookingCode.slice(-3) : '001'}`;

      const startTime = apt.scheduledStartTime
        ? apt.scheduledStartTime.slice(0, 5)
        : '08:00';
      const endTime = apt.scheduledEndTime
        ? apt.scheduledEndTime.slice(0, 5)
        : '08:30';
      const timeSlot = `${startTime} - ${endTime} WIB`;

      const statusBadge = STATUS_BADGE_MAP[apt.status] || apt.status;

      const isCancellable =
        apt.status !== 'in_service' &&
        apt.status !== 'completed' &&
        apt.status !== 'cancelled';

      const clinicRoomName =
        apt.clinicRoom?.name || session.clinicRoom?.name || 'Ruang Poli';

      const primaryAddress =
        apt.patientProfile?.patientAddresses?.find((a: any) => a.isPrimary) ||
        apt.patientProfile?.patientAddresses?.[0];
      const addressStr = primaryAddress
        ? primaryAddress.fullAddress || primaryAddress.line1 || null
        : null;

      const emergencyContact =
        apt.patientProfile?.patientEmergencyContacts?.[0];
      const guardianStr =
        apt.guardianNameSnapshot ||
        (emergencyContact
          ? `${emergencyContact.name}${emergencyContact.relationship ? ` (${emergencyContact.relationship})` : ''}`
          : null);

      return {
        appointmentId: apt.id,
        queueTicketId: apt.queueTickets?.[0]?.id || null,
        queueNumber,
        timeSlot,
        status: apt.status,
        statusBadge,
        chiefComplaint: apt.complaint || null,
        clinicRoomName,
        isCancellable,
        patient: {
          id: apt.patientProfile?.id || apt.patientId,
          fullName: apt.patientProfile?.fullName || 'Pasien',
          medicalRecordNumber:
            apt.patientProfile?.medicalRecordNumber || 'RM-UNKNOWN',
          nik:
            apt.patientProfile?.nationalIdEncrypted ||
            apt.patientProfile?.nationalIdHash ||
            '',
          gender:
            apt.patientProfile?.gender === 'female' ? 'Perempuan' : 'Laki-laki',
          birthDate: apt.patientProfile?.birthDate || '',
          age: ageStr,
          phoneNumber: apt.patientProfile?.phone || null,
          email: apt.patientProfile?.email || null,
          address: addressStr,
          guardianName: guardianStr,
          avatarUrl: apt.patientProfile?.avatarUrl || null,
        },
        bookingMetadata: {
          bookedAt: apt.createdAt,
          checkedInAt: apt.checkedInAt || null,
          startedAt: apt.startedAt || null,
          completedAt: apt.completedAt || null,
          cancelledAt: apt.cancelledAt || null,
          cancelReason: apt.cancelReason || null,
        },
      };
    });

    if (query.search) {
      const q = query.search.toLowerCase();
      mappedPatients = mappedPatients.filter(
        (p) =>
          p.patient.fullName.toLowerCase().includes(q) ||
          p.patient.medicalRecordNumber.toLowerCase().includes(q) ||
          p.queueNumber.toLowerCase().includes(q),
      );
    }

    const activeBookedCount = aptRecords.filter(
      (a) => a.status !== 'cancelled',
    ).length;

    const shift = session.sessionShift || 'morning';
    const shiftLabel =
      session.sessionLabel ||
      (shift === 'afternoon'
        ? 'Sesi Sore'
        : shift === 'night'
          ? 'Sesi Malam'
          : shift === 'early_morning'
            ? 'Shift Dini Hari'
            : 'Sesi Pagi');

    return {
      success: true,
      data: {
        sessionId: session.id,
        sessionLabel: shiftLabel,
        shift: shiftLabel,
        scheduleDate: session.scheduleDate,
        startTime: session.startTime.slice(0, 5),
        endTime: session.endTime.slice(0, 5),
        capacity: session.capacity,
        availableSlots: session.availableSlots,
        bookedCount: activeBookedCount,
        clinicRoom: session.clinicRoom
          ? {
              id: session.clinicRoom.id,
              name: session.clinicRoom.name,
              floor: session.clinicRoom.floor || null,
            }
          : null,
        patients: mappedPatients,
      },
    };
  }

  async getAdminDoctorPatientsByDate(
    practitionerId: string,
    date: string,
    query: GetAdminDoctorPatientsQueryDto,
  ): Promise<AdminDoctorAccumulatedPatientsResponse> {
    const practitioner =
      await this.practitionerResolver.resolve(practitionerId);
    if (!practitioner) {
      throw new NotFoundException(
        `Dokter dengan ID ${practitionerId} tidak ditemukan`,
      );
    }

    const prac = await this.db.query.practitioners.findFirst({
      where: eq(practitioners.id, practitioner.id),
      with: {
        staffProfile: true,
      },
    });

    const doctorName =
      prac?.staffProfile?.fullName || prac?.displayName || 'Dokter Amanah';

    const sessionConditions: any[] = [
      eq(practitionerScheduleSessions.practitionerId, practitioner.id),
      eq(practitionerScheduleSessions.scheduleDate, date),
    ];

    if (query.sessionShift) {
      const shiftNorm = query.sessionShift.toLowerCase();
      const mappedShift =
        shiftNorm === 'pagi' || shiftNorm === 'morning'
          ? 'morning'
          : shiftNorm === 'siang' || shiftNorm === 'afternoon'
            ? 'afternoon'
            : shiftNorm === 'malam' || shiftNorm === 'night'
              ? 'night'
              : shiftNorm === 'dini_hari' || shiftNorm === 'early_morning'
                ? 'early_morning'
                : query.sessionShift;
      sessionConditions.push(
        eq(practitionerScheduleSessions.sessionShift, mappedShift as any),
      );
    }

    const sessions = await this.db.query.practitionerScheduleSessions.findMany({
      where: and(...sessionConditions),
      orderBy: [asc(practitionerScheduleSessions.startTime)],
      with: {
        clinicRoom: true,
      },
    });

    const sessionItems: any[] = [];
    let accumulatedCapacity = 0;
    let accumulatedAvailableSlots = 0;
    let accumulatedBookedCount = 0;

    for (const s of sessions) {
      const sessionResult = await this.getAdminSessionPatients(
        practitioner.id,
        s.id,
        {
          status: query.status,
          search: query.search,
        },
      );

      accumulatedCapacity += s.capacity;
      accumulatedAvailableSlots += s.availableSlots;
      accumulatedBookedCount += sessionResult.data.bookedCount;

      sessionItems.push({
        sessionId: s.id,
        sessionLabel: sessionResult.data.sessionLabel,
        shift: sessionResult.data.shift,
        startTime: sessionResult.data.startTime,
        endTime: sessionResult.data.endTime,
        capacity: s.capacity,
        availableSlots: s.availableSlots,
        bookedCount: sessionResult.data.bookedCount,
        patients: sessionResult.data.patients,
      });
    }

    return {
      success: true,
      data: {
        doctorId: practitioner.id,
        doctorName,
        date,
        accumulatedCapacity,
        accumulatedBookedCount,
        accumulatedAvailableSlots,
        sessions: sessionItems,
      },
    };
  }
}
