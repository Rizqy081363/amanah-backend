import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../../../../common/pagination';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  patientAffiliations,
  patientProfiles,
  queueTickets,
} from '../../../../database/schema';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import {
  DOMAIN_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/appointment-lifecycle.constants';
import {
  AppointmentFindAllResult,
  AppointmentRepository,
} from '../../domain/repositories/appointment.repository';
import { AdminUpdateAppointmentStatusDto } from '../../presentation/dto/admin-update-appointment-status.dto';
import { CancelAppointmentDto } from '../../presentation/dto/cancel-appointment.dto';
import { RescheduleAppointmentDto } from '../../presentation/dto/reschedule-appointment.dto';
import { AppointmentAdminHandler } from './appointment-admin.handler';
import { AppointmentCreationHandler } from './appointment-creation.handler';
import { AppointmentRecordMapper } from './appointment-record.mapper';
import { AppointmentRescheduleHandler } from './appointment-reschedule.handler';
import { AppointmentStatusHandler } from './appointment-status.handler';

@Injectable()
export class AppointmentDrizzleRepository implements AppointmentRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async create(
    data: Omit<AppointmentEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AppointmentEntity> {
    return AppointmentCreationHandler.create(this.db, data, (id) =>
      this.findById(id),
    );
  }

  async findById(id: string): Promise<AppointmentEntity | null> {
    const apt = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, id),
      with: {
        queueTickets: true,
        patientProfile: true,
        clinicService: true,
        practitionerScheduleSession: true,
        clinicRoom: {
          with: {
            clinicUnit: true,
          },
        },
        practitioner: {
          with: {
            staffProfile: true,
            medicalSpecialty: true,
          },
        },
      },
    });
    if (!apt) return null;
    return AppointmentRecordMapper.toEntity(apt, apt.queueTickets?.[0]);
  }

  async findAll(
    limit = 20,
    offset = 0,
    filters?: {
      poliklinikId?: string;
      date?: string;
      session?: string;
      status?: string;
      patientId?: string;
      cursor?: string;
    },
  ): Promise<AppointmentFindAllResult> {
    const conditions: any[] = [];
    if (filters?.date) {
      conditions.push(eq(appointments.scheduledDate, filters.date));
    }
    if (filters?.patientId) {
      conditions.push(eq(appointments.patientId, filters.patientId));
    }

    if (filters?.cursor) {
      const cursorPayload = decodeCursor(filters.cursor);
      const cursorIso = cursorPayload.createdAt.toISOString();
      conditions.push(
        or(
          lt(appointments.createdAt, cursorIso),
          and(
            eq(appointments.createdAt, cursorIso),
            lt(appointments.id, cursorPayload.id),
          ),
        ),
      );
    }

    const fetchLimit = limit + 1;
    const records = await this.db.query.appointments.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      limit: fetchLimit,
      offset: filters?.cursor ? 0 : offset,
      orderBy: [desc(appointments.createdAt), desc(appointments.id)],
      with: {
        queueTickets: true,
        patientProfile: true,
        clinicService: true,
        practitionerScheduleSession: true,
        clinicRoom: {
          with: {
            clinicUnit: true,
          },
        },
        practitioner: {
          with: {
            staffProfile: true,
            medicalSpecialty: true,
          },
        },
      },
    });

    let results = records.map((apt) =>
      AppointmentRecordMapper.toEntity(apt, apt.queueTickets?.[0]),
    );

    if (filters?.poliklinikId) {
      results = results.filter((a) => a.poliklinikId === filters.poliklinikId);
    }
    if (filters?.session) {
      results = results.filter((a) => a.session === filters.session);
    }
    if (filters?.status) {
      results = results.filter((a) => a.status === filters.status);
    }

    const hasNextPage = results.length > limit;
    const pageData = hasNextPage ? results.slice(0, limit) : results;
    let nextCursor: string | null = null;
    if (hasNextPage && pageData.length > 0) {
      const lastItem = pageData[pageData.length - 1];
      nextCursor = encodeCursor({
        createdAt: lastItem.createdAt,
        id: lastItem.id,
      });
    }

    return {
      data: pageData,
      meta: {
        nextCursor,
        hasNextPage,
        limit,
      },
    };
  }

  async findByQueueNumber(
    queueNumber: string,
    date: string,
  ): Promise<AppointmentEntity | null> {
    const ticket = await this.db.query.queueTickets.findFirst({
      where: and(
        eq(queueTickets.queueNumber, queueNumber),
        eq(queueTickets.queueDate, date),
      ),
      with: {
        appointment: {
          with: {
            patientProfile: true,
            clinicService: true,
            practitionerScheduleSession: true,
            clinicRoom: { with: { clinicUnit: true } },
            practitioner: {
              with: { staffProfile: true, medicalSpecialty: true },
            },
            queueTickets: true,
          },
        },
      },
    });
    if (!ticket || !ticket.appointment) return null;
    return AppointmentRecordMapper.toEntity(ticket.appointment, ticket);
  }

  async findByPatientId(patientId: string): Promise<AppointmentEntity[]> {
    const records = await this.db.query.appointments.findMany({
      where: eq(appointments.patientId, patientId),
      orderBy: [desc(appointments.scheduledDate)],
      with: {
        queueTickets: true,
        patientProfile: true,
        clinicService: true,
        practitionerScheduleSession: true,
        clinicRoom: { with: { clinicUnit: true } },
        practitioner: { with: { staffProfile: true, medicalSpecialty: true } },
      },
    });
    return records.map((apt) =>
      AppointmentRecordMapper.toEntity(apt, apt.queueTickets?.[0]),
    );
  }

  async findByUserId(userId: string): Promise<AppointmentEntity[]> {
    const affiliations = await this.db.query.patientAffiliations.findMany({
      where: eq(patientAffiliations.userId, userId),
    });
    const ownProfile = await this.db.query.patientProfiles.findFirst({
      where: eq(patientProfiles.userId, userId),
    });

    const patientIds = new Set<string>();
    if (ownProfile) {
      patientIds.add(ownProfile.id);
    }
    for (const aff of affiliations) {
      patientIds.add(aff.patientId);
    }

    const patientIdArray = Array.from(patientIds);
    const whereCondition =
      patientIdArray.length > 0
        ? or(
            eq(appointments.createdBy, userId),
            inArray(appointments.patientId, patientIdArray),
          )
        : eq(appointments.createdBy, userId);

    const records = await this.db.query.appointments.findMany({
      where: whereCondition,
      orderBy: [desc(appointments.scheduledDate), desc(appointments.createdAt)],
      with: {
        queueTickets: true,
        patientProfile: true,
        clinicService: true,
        practitionerScheduleSession: true,
        clinicRoom: { with: { clinicUnit: true } },
        practitioner: { with: { staffProfile: true, medicalSpecialty: true } },
      },
    });

    return records.map((apt) =>
      AppointmentRecordMapper.toEntity(apt, apt.queueTickets?.[0]),
    );
  }

  async getRescheduleOptions(
    appointmentId: string,
    userId: string,
  ): Promise<any> {
    return AppointmentRescheduleHandler.getRescheduleOptions(
      this.db,
      appointmentId,
      userId,
    );
  }

  async reschedule(
    appointmentId: string,
    dto: RescheduleAppointmentDto,
    userId: string,
  ): Promise<AppointmentEntity> {
    return AppointmentRescheduleHandler.reschedule(
      this.db,
      appointmentId,
      dto,
      userId,
      (id) => this.findById(id),
    );
  }

  async findDailyQueue(
    poliklinikId: string,
    date: string,
    session?: string,
  ): Promise<AppointmentEntity[]> {
    const records = await this.db.query.appointments.findMany({
      where: eq(appointments.scheduledDate, date),
      with: {
        queueTickets: true,
        practitionerScheduleSession: true,
        clinicRoom: { with: { clinicUnit: true } },
        patientProfile: true,
        clinicService: true,
        practitioner: { with: { staffProfile: true, medicalSpecialty: true } },
      },
    });

    return records
      .filter((apt) => {
        if (
          poliklinikId &&
          apt.clinicRoom?.unitId &&
          apt.clinicRoom.unitId !== poliklinikId
        ) {
          return false;
        }
        if (session) {
          const aptSession = AppointmentRecordMapper.resolveSession(apt);
          if (aptSession !== session) return false;
        }
        return true;
      })
      .map((apt) =>
        AppointmentRecordMapper.toEntity(
          apt,
          apt.queueTickets?.[0],
          poliklinikId,
        ),
      );
  }

  async findDisplayQueue(date: string, poliklinikId?: string): Promise<any> {
    const dailyAppointments = await this.findDailyQueue(
      poliklinikId || '',
      date,
    );

    const currentlyCalled =
      dailyAppointments.find(
        (a) =>
          a.status === DOMAIN_APPOINTMENT_STATUS.IN_SERVICE ||
          a.ticketStatus === QUEUE_TICKET_STATUS.IN_SERVICE,
      ) ||
      dailyAppointments.find(
        (a) => a.ticketStatus === QUEUE_TICKET_STATUS.CALLED,
      );
    const waitingList = dailyAppointments.filter(
      (a) => a.status === DOMAIN_APPOINTMENT_STATUS.WAITING,
    );
    const completedList = dailyAppointments.filter(
      (a) => a.status === DOMAIN_APPOINTMENT_STATUS.COMPLETED,
    );

    return {
      date,
      poliklinikId: poliklinikId || null,
      currentTicket: currentlyCalled
        ? {
            queueNumber: currentlyCalled.queueNumber,
            patientName: currentlyCalled.patientName,
            roomName: currentlyCalled.poliklinikName,
            doctorName: currentlyCalled.doctorName,
            status:
              currentlyCalled.status === DOMAIN_APPOINTMENT_STATUS.IN_SERVICE ||
              currentlyCalled.ticketStatus === QUEUE_TICKET_STATUS.IN_SERVICE
                ? DOMAIN_APPOINTMENT_STATUS.IN_SERVICE
                : QUEUE_TICKET_STATUS.CALLED,
            calledAt: currentlyCalled.calledAt,
            startedAt: currentlyCalled.actualStartedAt,
            consultationElapsedSeconds:
              currentlyCalled.consultationElapsedSeconds,
            consultationDurationFormatted:
              currentlyCalled.consultationDurationFormatted,
          }
        : null,
      nextTickets: waitingList.slice(0, 5).map((w) => ({
        queueNumber: w.queueNumber,
        patientName: w.patientName,
        poliklinikName: w.poliklinikName,
      })),
      statistics: {
        totalQueue: dailyAppointments.length,
        waiting: waitingList.length,
        inService: currentlyCalled ? 1 : 0,
        completed: completedList.length,
      },
    };
  }

  async updateStatus(
    id: string,
    status: AppointmentEntity['status'],
    staffId?: string,
    cancellationReason?: string,
    expectedVersion?: string,
  ): Promise<AppointmentEntity | null> {
    return AppointmentStatusHandler.updateStatus(
      this.db,
      id,
      status,
      staffId,
      cancellationReason,
      expectedVersion,
      (aptId) => this.findById(aptId),
    );
  }

  async getNextQueueIndex(
    _poliklinikId: string,
    date: string,
    _session: string,
  ): Promise<number> {
    const [result] = await this.db
      .select({ val: count() })
      .from(queueTickets)
      .where(eq(queueTickets.queueDate, date));

    return Number(result?.val || 0) + 1;
  }

  async delete(id: string): Promise<boolean> {
    const updated = await this.updateStatus(
      id,
      'CANCELLED',
      undefined,
      'Dihapus oleh pengguna',
    );
    return updated !== null;
  }

  async cancelAdminAppointment(
    appointmentId: string,
    dto: CancelAppointmentDto,
    actorUserId?: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    return AppointmentAdminHandler.cancelAdminAppointment(
      this.db,
      appointmentId,
      dto,
      actorUserId,
    );
  }

  async updateAdminAppointmentStatus(
    appointmentId: string,
    dto: AdminUpdateAppointmentStatusDto,
    actorUserId?: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    return AppointmentAdminHandler.updateAdminAppointmentStatus(
      this.db,
      appointmentId,
      dto,
      actorUserId,
    );
  }
}
