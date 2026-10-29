import { ClinicConfigService } from '@common/clinic-config';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import type { AuthenticatedUser } from '../../../../common/auth';
import { decodeCursor, encodeCursor } from '../../../../common/pagination';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  clinicServices,
  clinicUnits,
  patientAffiliations,
  patientProfiles,
  practitioners,
  queueTickets,
  serviceCategories,
} from '../../../../database/schema';
import { QueuePositionRecalculationService } from '../../../queue-engine/application/services/queue-position-recalculation.service';
import {
  DB_APPOINTMENT_STATUS,
  DOMAIN_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/appointment-lifecycle.constants';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import {
  AppointmentFindAllResult,
  AppointmentRepository,
} from '../../domain/repositories/appointment.repository';
import { AppointmentPolicyReader } from '../../domain/services/appointment-policy.reader';
import { AppointmentPoliklinikResolver } from '../../domain/services/appointment-poliklinik.resolver';
import { AdminUpdateAppointmentStatusDto } from '../../presentation/dto/admin-update-appointment-status.dto';
import { CancelAppointmentDto } from '../../presentation/dto/cancel-appointment.dto';
import { RescheduleAppointmentDto } from '../../presentation/dto/reschedule-appointment.dto';
import { AppointmentAdminHandler } from './appointment-admin.handler';
import { AppointmentCreationHandler } from './appointment-creation.handler';
import { AppointmentRecordMapper } from './appointment-record.mapper';
import { APPOINTMENT_RELATIONS } from './appointment-relations.constant';
import { AppointmentRescheduleHandler } from './appointment-reschedule.handler';
import { AppointmentStatusHandler } from './appointment-status.handler';

@Injectable()
export class AppointmentDrizzleRepository implements AppointmentRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly clinicTimeService: ClinicTimeService,
    @Optional()
    private readonly clinicConfig?: ClinicConfigService,
    private readonly policyReader?: AppointmentPolicyReader,
    @Optional()
    private readonly poliklinikResolver?: AppointmentPoliklinikResolver,
    @Optional()
    private readonly queuePositionRecalculationService?: QueuePositionRecalculationService,
  ) {}

  private async getWindowHours(): Promise<number | undefined> {
    if (this.clinicConfig) {
      try {
        return await this.clinicConfig.getCheckInWindowHours();
      } catch (_) {}
    }
    if (this.policyReader) {
      try {
        return await this.policyReader.getCheckInWindowHours();
      } catch (_) {}
    }
    return undefined;
  }

  private async getQueueThresholds(): Promise<
    { arriveEarlyMinutes?: number; overflowToleranceMinutes?: number } | undefined
  > {
    if (this.clinicConfig) {
      try {
        return await this.clinicConfig.getQueueThresholds();
      } catch (_) {}
    }
    if (this.policyReader) {
      try {
        return await this.policyReader.getQueueThresholds();
      } catch (_) {}
    }
    return undefined;
  }

  private async persistLateness(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const updated = await this.db
        .update(appointments)
        .set({
          status: DB_APPOINTMENT_STATUS.LATE,
          updatedAt: new Date().toISOString(),
        })
        .where(inArray(appointments.id, ids))
        .returning({
          id: appointments.id,
          scheduledDate: appointments.scheduledDate,
          practitionerId: appointments.practitionerId,
        });

      await this.db
        .update(queueTickets)
        .set({
          status: QUEUE_TICKET_STATUS.CANCELLED,
          waitingPosition: null,
          updatedAt: sql`NOW()`,
        })
        .where(inArray(queueTickets.appointmentId, ids))
        .catch(() => {});

      if (this.queuePositionRecalculationService && updated.length > 0) {
        await this.queuePositionRecalculationService
          .recalculatePartitions(
            updated.map((u) => ({
              serviceDate: u.scheduledDate,
              practitionerId: u.practitionerId,
            })),
          )
          .catch(() => {});
      }
    } catch (_) {}
  }

  private async mapAndSweep(
    records: any[],
    windowHours?: number,
    poliId?: string,
  ): Promise<AppointmentEntity[]> {
    if (this.poliklinikResolver) {
      await this.poliklinikResolver.loadFromDatabase();
    }
    const thresholds = await this.getQueueThresholds();
    const busyDoctorIds = new Set<string>();
    for (const r of records) {
      if (
        r.practitionerId &&
        (r.status === DB_APPOINTMENT_STATUS.IN_SERVICE ||
          r.queueTickets?.[0]?.status === QUEUE_TICKET_STATUS.IN_SERVICE)
      ) {
        busyDoctorIds.add(r.practitionerId);
      }
    }

    const staleLateIds: string[] = [];
    const results = records.map((apt) => {
      const resolvedUnit = this.poliklinikResolver
        ? this.poliklinikResolver.resolveSync(apt, poliId)
        : undefined;
      const isDoctorServing = Boolean(
        apt.practitionerId &&
          busyDoctorIds.has(apt.practitionerId) &&
          apt.status !== DB_APPOINTMENT_STATUS.IN_SERVICE,
      );
      const entity = AppointmentRecordMapper.toEntity(
        apt,
        apt.queueTickets?.[0],
        resolvedUnit || poliId,
        windowHours,
        this.clinicTimeService,
        isDoctorServing,
        thresholds,
      );
      if (
        entity.status === DOMAIN_APPOINTMENT_STATUS.LATE &&
        apt.status !== DB_APPOINTMENT_STATUS.LATE
      ) {
        staleLateIds.push(apt.id);
      }
      return entity;
    });
    if (staleLateIds.length > 0) {
      this.persistLateness(staleLateIds).catch(() => {});
    }
    return results;
  }

  async create(
    data: Omit<AppointmentEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AppointmentEntity> {
    return AppointmentCreationHandler.create(
      this.db,
      data,
      (id) => this.findById(id),
      this.clinicConfig,
      this.clinicTimeService,
      this.queuePositionRecalculationService,
    );
  }

  async findById(id: string): Promise<AppointmentEntity | null> {
    const apt = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, id),
      with: APPOINTMENT_RELATIONS,
    });
    if (!apt) return null;
    const windowHours = await this.getWindowHours();
    return (await this.mapAndSweep([apt], windowHours))[0] || null;
  }

  async findAll(
    limit = 20,
    offset = 0,
    filters?: {
      poliklinikId?: string;
      poliklinikName?: string;
      serviceName?: string;
      date?: string;
      session?: string;
      status?: string;
      patientId?: string;
      search?: string;
      cursor?: string;
      doctorId?: string;
      doctorName?: string;
      roomId?: string;
      roomName?: string;
    },
  ): Promise<AppointmentFindAllResult> {
    const conditions: any[] = [];

    // 1. Scheduled Date filter
    if (filters?.date) {
      conditions.push(eq(appointments.scheduledDate, filters.date));
    }

    // 2. Patient ID filter
    if (filters?.patientId) {
      conditions.push(eq(appointments.patientId, filters.patientId));
    }

    // 3. Doctor/Practitioner filter
    if (filters?.doctorId) {
      if (filters.doctorId === 'unassigned') {
        conditions.push(isNull(appointments.practitionerId));
      } else {
        conditions.push(eq(appointments.practitionerId, filters.doctorId));
      }
    }

    if (filters?.doctorName) {
      conditions.push(
        ilike(practitioners.displayName, `%${filters.doctorName.trim()}%`),
      );
    }

    // 4. Room filter
    if (filters?.roomId) {
      conditions.push(eq(appointments.roomId, filters.roomId));
    }

    if (filters?.roomName) {
      conditions.push(
        ilike(clinicRooms.name, `%${filters.roomName.trim()}%`),
      );
    }

    // 5. Service Name filter
    if (filters?.serviceName) {
      conditions.push(
        ilike(clinicServices.name, `%${filters.serviceName.trim()}%`),
      );
    }

    // 6. Session filter
    if (filters?.session) {
      conditions.push(eq(queueTickets.sessionId, filters.session));
    }

    // 7. Status filter (supports single or comma-separated status)
    if (filters?.status) {
      const rawStatuses = filters.status
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      if (rawStatuses.length === 1) {
        conditions.push(eq(appointments.status, rawStatuses[0] as any));
      } else if (rawStatuses.length > 1) {
        conditions.push(inArray(appointments.status, rawStatuses as any[]));
      }
    }

    // 8. Poliklinik Unit filter (Unit Rooms, Services, or Cross-Assigned Rooms)
    if (filters?.poliklinikId) {
      const poliConditions: any[] = [
        eq(clinicRooms.unitId, filters.poliklinikId),
      ];

      if (this.poliklinikResolver) {
        await this.poliklinikResolver.loadFromDatabase();
        const serviceIds = this.poliklinikResolver.getServiceIdsForUnit(
          filters.poliklinikId,
        );
        if (serviceIds.length > 0) {
          poliConditions.push(inArray(appointments.serviceId, serviceIds));
        }
      }

      const roomsInUnit = await this.db
        .select({ id: clinicRooms.id })
        .from(clinicRooms)
        .where(eq(clinicRooms.unitId, filters.poliklinikId));
      if (roomsInUnit.length > 0) {
        poliConditions.push(
          inArray(
            appointments.roomId,
            roomsInUnit.map((r) => r.id),
          ),
        );
      }

      conditions.push(or(...poliConditions));
    }

    if (filters?.poliklinikName) {
      const pn = `%${filters.poliklinikName.trim()}%`;
      conditions.push(
        or(
          ilike(clinicUnits.name, pn),
          ilike(clinicRooms.name, pn),
        ),
      );
    }

    // 9. Global database-driven search across all relevant fields
    if (filters?.search && filters.search.trim().length > 0) {
      const searchPattern = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(patientProfiles.fullName, searchPattern),
          ilike(patientProfiles.medicalRecordNumber, searchPattern),
          ilike(appointments.bookingCode, searchPattern),
          ilike(queueTickets.queueNumber, searchPattern),
          ilike(practitioners.displayName, searchPattern),
          ilike(clinicRooms.name, searchPattern),
          ilike(clinicServices.name, searchPattern),
          ilike(appointments.complaint, searchPattern),
        ),
      );
    }

    // 10. Keyset cursor filter
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

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 11. Count total matching rows in database with identical WHERE clause
    const [countResult] = await this.db
      .select({ total: count() })
      .from(appointments)
      .leftJoin(patientProfiles, eq(appointments.patientId, patientProfiles.id))
      .leftJoin(queueTickets, eq(appointments.id, queueTickets.appointmentId))
      .leftJoin(
        practitioners,
        eq(appointments.practitionerId, practitioners.id),
      )
      .leftJoin(clinicRooms, eq(appointments.roomId, clinicRooms.id))
      .leftJoin(clinicUnits, eq(clinicRooms.unitId, clinicUnits.id))
      .leftJoin(clinicServices, eq(appointments.serviceId, clinicServices.id))
      .where(whereClause);

    const totalCount = Number(countResult?.total ?? 0);

    // 12. Query matching row IDs in SQL with LIMIT + 1 and OFFSET
    const fetchLimit = limit + 1;
    const orderByClause = filters?.cursor
      ? [desc(appointments.createdAt), desc(appointments.id)]
      : [
          asc(appointments.scheduledDate),
          asc(appointments.queueNumber),
          asc(appointments.scheduledStartTime),
          asc(appointments.createdAt),
        ];

    const matchedRows = await this.db
      .select({
        id: appointments.id,
      })
      .from(appointments)
      .leftJoin(patientProfiles, eq(appointments.patientId, patientProfiles.id))
      .leftJoin(queueTickets, eq(appointments.id, queueTickets.appointmentId))
      .leftJoin(
        practitioners,
        eq(appointments.practitionerId, practitioners.id),
      )
      .leftJoin(clinicRooms, eq(appointments.roomId, clinicRooms.id))
      .leftJoin(clinicUnits, eq(clinicRooms.unitId, clinicUnits.id))
      .leftJoin(clinicServices, eq(appointments.serviceId, clinicServices.id))
      .where(whereClause)
      .orderBy(...orderByClause)
      .limit(fetchLimit)
      .offset(filters?.cursor ? 0 : offset);

    if (matchedRows.length === 0) {
      return {
        data: [],
        meta: {
          nextCursor: null,
          hasNextPage: false,
          limit,
          total: totalCount,
        },
      };
    }

    const hasNextPage = matchedRows.length > limit;
    const pageRows = hasNextPage ? matchedRows.slice(0, limit) : matchedRows;
    const pageIds = pageRows.map((r) => r.id);

    // 13. Fetch relational records for the exact paginated IDs
    const records = await this.db.query.appointments.findMany({
      where: inArray(appointments.id, pageIds),
      with: APPOINTMENT_RELATIONS,
    });

    const recordMap = new Map(records.map((r) => [r.id, r]));
    const orderedRecords = pageIds
      .map((id) => recordMap.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));

    const windowHours = await this.getWindowHours();
    const results = await this.mapAndSweep(
      orderedRecords,
      windowHours,
      filters?.poliklinikId,
    );

    let nextCursor: string | null = null;
    if (hasNextPage && results.length > 0) {
      const lastItem = results[results.length - 1];
      nextCursor = encodeCursor({
        createdAt: lastItem.createdAt,
        id: lastItem.id,
      });
    }

    return {
      data: results,
      meta: {
        nextCursor,
        hasNextPage,
        limit,
        total: totalCount,
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
      orderBy: [desc(queueTickets.createdAt)],
      with: {
        appointment: {
          with: APPOINTMENT_RELATIONS,
        },
      },
    });
    if (!ticket?.appointment) return null;
    const windowHours = await this.getWindowHours();
    return (
      (await this.mapAndSweep([ticket.appointment], windowHours))[0] || null
    );
  }

  async findByPatientId(patientId: string): Promise<AppointmentEntity[]> {
    const records = await this.db.query.appointments.findMany({
      where: eq(appointments.patientId, patientId),
      orderBy: [
        desc(appointments.scheduledDate),
        asc(appointments.queueNumber),
        asc(appointments.scheduledStartTime),
        asc(appointments.createdAt),
      ],
      with: APPOINTMENT_RELATIONS,
    });
    const windowHours = await this.getWindowHours();
    return await this.mapAndSweep(records, windowHours);
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
      orderBy: [
        desc(appointments.scheduledDate),
        asc(appointments.queueNumber),
        asc(appointments.scheduledStartTime),
        asc(appointments.createdAt),
      ],
      with: APPOINTMENT_RELATIONS,
    });

    const windowHours = await this.getWindowHours();
    return await this.mapAndSweep(records, windowHours);
  }

  async getRescheduleOptions(
    appointmentId: string,
    userId: string,
    user?: AuthenticatedUser,
  ): Promise<any> {
    return AppointmentRescheduleHandler.getRescheduleOptions(
      this.db,
      appointmentId,
      userId,
      user,
    );
  }

  async reschedule(
    appointmentId: string,
    dto: RescheduleAppointmentDto,
    userId: string,
    user?: AuthenticatedUser,
  ): Promise<AppointmentEntity> {
    return AppointmentRescheduleHandler.reschedule(
      this.db,
      appointmentId,
      dto,
      userId,
      (id) => this.findById(id),
      user,
      this.queuePositionRecalculationService,
      this.clinicConfig,
      this.clinicTimeService,
    );
  }

  async findDailyQueue(
    poliklinikId: string,
    date: string,
    session?: string,
  ): Promise<AppointmentEntity[]> {
    if (this.poliklinikResolver) {
      await this.poliklinikResolver.loadFromDatabase();
    }
    const windowHours = await this.getWindowHours();
    const records = await this.db.query.appointments.findMany({
      where: or(
        eq(appointments.scheduledDate, date),
        and(
          inArray(appointments.status, [
            DB_APPOINTMENT_STATUS.WAITING,
            DB_APPOINTMENT_STATUS.IN_SERVICE,
          ]),
          isNotNull(appointments.checkedInAt),
        ),
      ),
      with: APPOINTMENT_RELATIONS,
    });

    const busyDoctorIds = new Set<string>();
    for (const r of records) {
      if (
        r.practitionerId &&
        (r.status === DB_APPOINTMENT_STATUS.IN_SERVICE ||
          r.queueTickets?.[0]?.status === QUEUE_TICKET_STATUS.IN_SERVICE)
      ) {
        busyDoctorIds.add(r.practitionerId);
      }
    }

    const mappedEntities = records.map((apt) => {
      const resolvedUnit = this.poliklinikResolver
        ? this.poliklinikResolver.resolveSync(apt, poliklinikId)
        : undefined;
      const isDoctorServing = Boolean(
        apt.practitionerId &&
          busyDoctorIds.has(apt.practitionerId) &&
          apt.status !== DB_APPOINTMENT_STATUS.IN_SERVICE,
      );
      return AppointmentRecordMapper.toEntity(
        apt,
        apt.queueTickets?.[0],
        resolvedUnit || poliklinikId,
        windowHours,
        this.clinicTimeService,
        isDoctorServing,
      );
    });

    return mappedEntities.filter((entity) => {
      // 1. Strictly exclude terminal, late, or un-checked-in booked appointments
      if (
        entity.status === DOMAIN_APPOINTMENT_STATUS.LATE ||
        entity.rawStatus === DB_APPOINTMENT_STATUS.LATE ||
        entity.status === DOMAIN_APPOINTMENT_STATUS.BOOKED ||
        entity.rawStatus === DB_APPOINTMENT_STATUS.BOOKED ||
        entity.status === DOMAIN_APPOINTMENT_STATUS.CANCELLED ||
        entity.rawStatus === DB_APPOINTMENT_STATUS.CANCELLED ||
        entity.status === DOMAIN_APPOINTMENT_STATUS.COMPLETED ||
        entity.rawStatus === DB_APPOINTMENT_STATUS.COMPLETED
      ) {
        return false;
      }

      // 2. Only active queue states: WAITING, CALLED, IN_SERVICE
      const isWaiting = entity.status === DOMAIN_APPOINTMENT_STATUS.WAITING;
      const isCalledOrInService =
        entity.status === DOMAIN_APPOINTMENT_STATUS.IN_SERVICE ||
        entity.ticketStatus === QUEUE_TICKET_STATUS.CALLED ||
        entity.ticketStatus === QUEUE_TICKET_STATUS.IN_SERVICE;

      if (!isWaiting && !isCalledOrInService) {
        return false;
      }

      // 3. Filter by session if provided
      if (session && entity.session !== session) {
        return false;
      }

      // 4. Filter by poliklinikId if provided
      if (poliklinikId) {
        const matchesId = entity.poliklinikId === poliklinikId;
        const matchesName = Boolean(
          entity.poliklinikName &&
            entity.poliklinikName.toLowerCase() === poliklinikId.toLowerCase(),
        );
        if (!matchesId && !matchesName) {
          return false;
        }
      }

      return true;
    });
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
      (a) =>
        a.id !== currentlyCalled?.id &&
        a.status === DOMAIN_APPOINTMENT_STATUS.WAITING &&
        a.ticketStatus !== QUEUE_TICKET_STATUS.CALLED &&
        a.ticketStatus !== QUEUE_TICKET_STATUS.IN_SERVICE,
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
            avatarUrl: currentlyCalled.avatarUrl,
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
            etaRange: currentlyCalled.etaRange,
            estimatedStartAt: currentlyCalled.estimatedStartAt,
            estimatedEndAt: currentlyCalled.estimatedEndAt,
          }
        : null,
      nextTickets: waitingList.slice(0, 5).map((w) => ({
        queueNumber: w.queueNumber,
        patientName: w.patientName,
        avatarUrl: w.avatarUrl,
        poliklinikName: w.poliklinikName,
        etaRange: w.etaRange,
        estimatedStartAt: w.estimatedStartAt,
        estimatedEndAt: w.estimatedEndAt,
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
    const [aptBefore] = await this.db
      .select({
        scheduledDate: appointments.scheduledDate,
        practitionerId: appointments.practitionerId,
      })
      .from(appointments)
      .where(eq(appointments.id, id))
      .limit(1);

    const result = await AppointmentStatusHandler.updateStatus(
      this.db,
      id,
      status,
      staffId,
      cancellationReason,
      expectedVersion,
      (aptId) => this.findById(aptId),
    );

    if (
      this.queuePositionRecalculationService &&
      aptBefore &&
      (status === DOMAIN_APPOINTMENT_STATUS.CANCELLED ||
        status === DOMAIN_APPOINTMENT_STATUS.COMPLETED)
    ) {
      let categoryId: string | null = null;
      if (!aptBefore.practitionerId) {
        const [aptFull] = await this.db
          .select({ serviceId: appointments.serviceId })
          .from(appointments)
          .where(eq(appointments.id, id))
          .limit(1);
        if (aptFull?.serviceId) {
          const [svc] = await this.db
            .select({ categoryId: clinicServices.serviceCategoryId })
            .from(clinicServices)
            .where(eq(clinicServices.id, aptFull.serviceId))
            .limit(1);
          categoryId = svc?.categoryId || null;
        }
      }
      await this.queuePositionRecalculationService
        .recalculateDoctorQueue({
          serviceDate: aptBefore.scheduledDate,
          practitionerId: aptBefore.practitionerId,
          categoryId,
        })
        .catch(() => {});
    }

    return result;
  }

  async getNextQueueIndex(
    poliklinikId: string,
    date: string,
    _session: string,
  ): Promise<number> {
    if (!poliklinikId) {
      const [result] = await this.db
        .select({ val: count() })
        .from(queueTickets)
        .where(eq(queueTickets.queueDate, date));
      return Number(result?.val || 0) + 1;
    }

    const unit = await this.db.query.clinicUnits.findFirst({
      where: eq(clinicUnits.id, poliklinikId),
    });

    const isKia =
      unit?.code === 'poli_kia' || unit?.name?.toLowerCase().includes('kia');
    const catCode = isKia ? 'layanan_kebidanan' : 'layanan_umum';
    const category = await this.db.query.serviceCategories.findFirst({
      where: eq(serviceCategories.code, catCode),
    });

    const whereCondition = category
      ? and(
          eq(queueTickets.queueDate, date),
          eq(queueTickets.categoryId, category.id),
        )
      : eq(queueTickets.queueDate, date);

    const [result] = await this.db
      .select({ val: count() })
      .from(queueTickets)
      .where(whereCondition);

    return Number(result?.val || 0) + 1;
  }

  async delete(id: string): Promise<boolean> {
    const updated = await this.updateStatus(
      id,
      DOMAIN_APPOINTMENT_STATUS.CANCELLED,
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
    const [aptBefore] = await this.db
      .select({
        scheduledDate: appointments.scheduledDate,
        practitionerId: appointments.practitionerId,
      })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    const result = await AppointmentAdminHandler.cancelAdminAppointment(
      this.db,
      appointmentId,
      dto,
      actorUserId,
    );

    if (this.queuePositionRecalculationService && aptBefore) {
      let categoryId: string | null = null;
      if (!aptBefore.practitionerId) {
        const [aptFull] = await this.db
          .select({ serviceId: appointments.serviceId })
          .from(appointments)
          .where(eq(appointments.id, appointmentId))
          .limit(1);
        if (aptFull?.serviceId) {
          const [svc] = await this.db
            .select({ categoryId: clinicServices.serviceCategoryId })
            .from(clinicServices)
            .where(eq(clinicServices.id, aptFull.serviceId))
            .limit(1);
          categoryId = svc?.categoryId || null;
        }
      }
      await this.queuePositionRecalculationService
        .recalculateDoctorQueue({
          serviceDate: aptBefore.scheduledDate,
          practitionerId: aptBefore.practitionerId,
          categoryId: aptBefore.practitionerId ? undefined : categoryId,
        })
        .catch(() => {});
    }

    return result;
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
    const [aptBefore] = await this.db
      .select({
        scheduledDate: appointments.scheduledDate,
        practitionerId: appointments.practitionerId,
      })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    const result = await AppointmentAdminHandler.updateAdminAppointmentStatus(
      this.db,
      appointmentId,
      dto,
      actorUserId,
    );

    if (this.queuePositionRecalculationService && aptBefore) {
      await this.queuePositionRecalculationService
        .recalculateDoctorQueue({
          serviceDate: aptBefore.scheduledDate,
          practitionerId: aptBefore.practitionerId,
        })
        .catch(() => {});
    }

    return result;
  }
}
