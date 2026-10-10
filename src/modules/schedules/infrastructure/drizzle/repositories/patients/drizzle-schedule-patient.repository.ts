import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  doctorAssignments,
  practitioners,
  sessionDefs,
} from '@database/schema';
import { AppointmentTemporalStatusHelper } from '@modules/appointments/domain/helpers/appointment-temporal-status.helper';
import { APPOINTMENT_STATUS_BADGE_MAP } from '@modules/schedules/domain/constants/schedule.constants';
import { resolveCanonicalShift } from '@modules/schedules/domain/constants/schedule-shift.constants';
import type {
  AdminDoctorAccumulatedPatientsResponse,
  AdminSessionPatientItem,
  AdminSessionPatientsResponse,
  BookedPatientEntity,
} from '@modules/schedules/domain/entities/schedule.entity';
import { BookedPatientMapper } from '@modules/schedules/infrastructure/drizzle/mappers/booked-patient.mapper';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import type { GetAdminDoctorPatientsQueryDto } from '@modules/schedules/presentation/dto/get-admin-doctor-patients-query.dto';
import type { GetSessionPatientsQueryDto } from '@modules/schedules/presentation/dto/get-session-patients-query.dto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm';

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
      const session = await this.db.query.sessionDefs.findFirst({
        where: eq(sessionDefs.id, sessionId),
      });
      if (session) {
        const sessStart = `${session.defaultStartsAt.slice(0, 5)}:00`;
        const sessEnd = `${session.defaultEndsAt.slice(0, 5)}:00`;
        conditions.push(
          and(
            gte(appointments.scheduledStartTime, sessStart),
            lt(appointments.scheduledStartTime, sessEnd),
          ),
        );
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
      with: {
        patientProfile: true,
        practitioner: {
          with: {
            staffProfile: true,
          },
        },
        clinicRoom: {
          with: {
            clinicUnit: true,
          },
        },
        queueTickets: true,
      },
      orderBy: [
        asc(appointments.scheduledDate),
        asc(appointments.scheduledStartTime),
      ],
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

    const sessionDef = await this.db.query.sessionDefs.findFirst({
      where: eq(sessionDefs.id, sessionId),
    });

    const assignment = sessionDef
      ? null
      : await this.db.query.doctorAssignments.findFirst({
          where: and(
            eq(doctorAssignments.id, sessionId),
            eq(doctorAssignments.doctorId, practitioner.id),
          ),
          with: {
            sessionDef: true,
            preferredRoom: {
              with: {
                clinicUnit: true,
              },
            },
          },
        });

    const effectiveSessionDef = sessionDef ?? assignment?.sessionDef;
    const effectiveRoom = assignment?.preferredRoom || null;

    const sessDate =
      (query as any).date || new Date().toISOString().slice(0, 10);
    const sessStartTime =
      effectiveSessionDef?.defaultStartsAt.slice(0, 5) || '08:00';
    const sessEndTime =
      effectiveSessionDef?.defaultEndsAt.slice(0, 5) || '12:00';
    const sessStart = `${sessStartTime}:00`;
    const sessEnd = `${sessEndTime}:00`;

    const session = {
      id: sessionId,
      scheduleDate: sessDate,
      startTime: sessStartTime,
      endTime: sessEndTime,
      sessionLabel: effectiveSessionDef?.labelKey || 'Sesi Praktik',
      sessionShift: effectiveSessionDef?.code || 'morning',
      clinicRoom: effectiveRoom,
    };

    const sessionMatchCondition = and(
      eq(appointments.practitionerId, practitioner.id),
      eq(appointments.scheduledDate, session.scheduleDate),
      gte(appointments.scheduledStartTime, sessStart),
      lt(appointments.scheduledStartTime, sessEnd),
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
        clinicRoom: {
          with: {
            clinicUnit: true,
          },
        },
        clinicService: true,
      },
    });

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

      const isElapsed = AppointmentTemporalStatusHelper.isElapsed({
        scheduledDate: apt.scheduledDate,
        scheduledStartTime: apt.scheduledStartTime,
        scheduledEndTime: apt.scheduledEndTime,
      });

      const effectiveStatus = AppointmentTemporalStatusHelper.resolveDbStatus(
        apt.status,
        isElapsed,
      );

      const statusBadge =
        APPOINTMENT_STATUS_BADGE_MAP[effectiveStatus] || effectiveStatus;

      const isCancellable =
        !isElapsed &&
        effectiveStatus !== 'in_service' &&
        effectiveStatus !== 'completed' &&
        effectiveStatus !== 'cancelled';

      const clinicRoomName =
        apt.clinicRoom?.name || session.clinicRoom?.name || 'Ruang Poli';
      const roomName = apt.clinicRoom?.name || session.clinicRoom?.name || null;
      const roomLocation =
        apt.clinicRoom?.location || session.clinicRoom?.location || null;
      const poliklinikName =
        apt.clinicRoom?.clinicUnit?.name ||
        session.clinicRoom?.clinicUnit?.name ||
        null;

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
        appointmentDate: apt.scheduledDate,
        queueTicketId: apt.queueTickets?.[0]?.id || null,
        queueNumber,
        timeSlot,
        status: effectiveStatus,
        statusBadge,
        chiefComplaint: apt.complaint || null,
        clinicRoomName,
        roomName,
        roomLocation,
        poliklinikName,
        visitType:
          apt.visitType === 'follow_up' ? 'Kontrol Ulang' : 'Pemeriksaan Baru',
        serviceName: apt.clinicService?.name || null,
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

    const resolvedShift = resolveCanonicalShift({
      session: session.sessionLabel,
      sessionShift: session.sessionShift,
    });
    const shiftLabel = session.sessionLabel || resolvedShift.label;

    return {
      success: true,
      data: {
        sessionId: session.id,
        sessionLabel: shiftLabel,
        shift: shiftLabel,
        scheduleDate: session.scheduleDate,
        startTime: session.startTime.slice(0, 5),
        endTime: session.endTime.slice(0, 5),
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

    const targetDow = new Date(date).getDay();
    const assignments = await this.db.query.doctorAssignments.findMany({
      where: and(
        eq(doctorAssignments.doctorId, practitioner.id),
        eq(doctorAssignments.isActive, true),
        or(eq(doctorAssignments.dow, targetDow), isNull(doctorAssignments.dow)),
      ),
      with: {
        sessionDef: true,
        preferredRoom: true,
      },
    });

    const sessions = assignments
      .filter((da) => da.sessionDef && da.sessionDef.isActive)
      .filter((da) => {
        if (!query.sessionShift) return true;
        const resolved = resolveCanonicalShift({
          sessionShift: query.sessionShift,
        });
        return da.sessionDef.code === resolved.shift;
      })
      .map((da) => ({
        id: da.sessionDef.id,
        sessionShift: da.sessionDef.code,
        sessionLabel: da.sessionDef.labelKey,
        startTime: da.sessionDef.defaultStartsAt,
        endTime: da.sessionDef.defaultEndsAt,
        clinicRoom: da.preferredRoom || null,
      }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const sessionItems: any[] = [];
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

      accumulatedBookedCount += sessionResult.data.bookedCount;

      sessionItems.push({
        sessionId: s.id,
        sessionLabel: sessionResult.data.sessionLabel,
        shift: sessionResult.data.shift,
        startTime: sessionResult.data.startTime,
        endTime: sessionResult.data.endTime,
        bookedCount: sessionResult.data.bookedCount,
        patients: sessionResult.data.patients,
      });
    }

    const allPatients = sessionItems
      .flatMap((s) => s.patients)
      .sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));

    return {
      success: true,
      data: {
        doctorId: practitioner.id,
        doctorName,
        date,
        accumulatedBookedCount,
        sessions: sessionItems,
        patients: allPatients,
      },
    };
  }
}
