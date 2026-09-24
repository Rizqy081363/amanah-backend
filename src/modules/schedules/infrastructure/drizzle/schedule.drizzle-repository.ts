import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
  not,
  or,
  sql,
} from 'drizzle-orm';
import { generateEntityVersion } from '../../../../common/occ';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  clinicUnits,
  medicalSpecialties,
  patientAddresses,
  patientEmergencyContacts,
  patientProfiles,
  practitionerLeavePeriods,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
  practitioners,
  queueTickets,
} from '../../../../database/schema';
import {
  AdminDoctorAccumulatedPatientsResponse,
  AdminDoctorDailySession,
  AdminDoctorMonthlyDayEntity,
  AdminDoctorScheduleCardEntity,
  AdminDoctorScheduleDetailResponse,
  AdminDoctorScheduleListResponse,
  AdminSessionPatientItem,
  AdminSessionPatientsResponse,
  BookedPatientEntity,
  CalendarSummaryResponse,
  ClinicalPractitionerEntity,
  ClinicRoomReferenceEntity,
  DayScheduleSettingEntity,
  ScheduleAvailabilityMutationResponse,
  ScheduleContextEntity,
  ScheduleEntity,
  ScheduleOccupancyOverviewData,
  ScheduleOptionsReferenceEntity,
  ScheduleOperationalStatus,
  RescheduleEligibilityEntity,
  RescheduleSourceSessionInfo,
  ScheduleProjectionEntity,
  ScheduleShiftOccupancyEntity,
  ScheduleShiftSlotEntity,
  ScheduleSlotConflictInfoEntity,
  ScheduleSlotStatus,
} from '../../domain/entities/schedule.entity';
import { ScheduleRepository } from '../../domain/repositories/schedule.repository';
import {
  AppointmentOccupation,
  formatClockTime,
  parseClockTime,
  projectScheduleIntervals,
  ScheduleClosedReason,
} from '../../domain/schedule-projection';
import {
  AdminScheduleStatusRequest,
  SchedulePersistenceStatus,
  isClosedScheduleStatus,
  resolveAggregateOperationalStatus,
  resolveSessionOperationalStatus,
  toAdminDayStatusResponseLabel,
  toAdminScheduleStatusRequest,
  toDaySessionPersistenceStatus,
} from '../../domain/schedule-status';
import { AdminDoctorScheduleDetailQueryDto } from '../../presentation/dto/admin-doctor-schedule-detail-query.dto';
import { AdminDoctorSchedulesQueryDto } from '../../presentation/dto/admin-doctor-schedules-query.dto';
import { CheckRescheduleEligibilityQueryDto } from '../../presentation/dto/check-reschedule-eligibility-query.dto';
import { ClinicalPractitionersQueryDto } from '../../presentation/dto/clinical-practitioners-query.dto';
import { CreateAdminDoctorSessionDto } from '../../presentation/dto/create-admin-doctor-session.dto';
import { CreateAvailabilityDto } from '../../presentation/dto/create-availability.dto';
import { GetAdminDoctorPatientsQueryDto } from '../../presentation/dto/get-admin-doctor-patients-query.dto';
import { GetSessionPatientsQueryDto } from '../../presentation/dto/get-session-patients-query.dto';
import { RescheduleAdminDoctorSessionDto } from '../../presentation/dto/reschedule-admin-doctor-session.dto';
import { ScheduleOccupancyQueryDto } from '../../presentation/dto/schedule-occupancy-query.dto';
import { ScheduleProjectionQueryDto } from '../../presentation/dto/schedule-projection-query.dto';
import { UpdateAdminDoctorScheduleDto } from '../../presentation/dto/update-admin-doctor-schedule.dto';
import { UpdateAdminDoctorSessionDto } from '../../presentation/dto/update-admin-doctor-session.dto';
import { UpdatePractitionerSchedulePolicyDto } from '../../presentation/dto/update-practitioner-schedule-policy.dto';

const CLINIC_TIMEZONE = 'Asia/Jakarta';
const DEFAULT_CONSULTATION_DURATION_MINUTES = 30;
const DEFAULT_START_PRECISION_MINUTES = 1;
const ACTIVE_APPOINTMENT_STATUSES = [
  'booked',
  'checked_in',
  'waiting',
  'in_service',
] as const;

type ScheduleContextDefinition = {
  contextId: string;
  contextLabel: string;
  sessionShift: 'early_morning' | 'morning' | 'afternoon' | 'night';
  boundaryStartTime: string;
  boundaryEndTime: string;
  aliases: string[];
};

const SCHEDULE_CONTEXT_DEFINITIONS: ScheduleContextDefinition[] = [
  {
    contextId: 'early_morning',
    contextLabel: 'Dini Hari',
    sessionShift: 'early_morning',
    boundaryStartTime: '00:00',
    boundaryEndTime: '06:00',
    aliases: ['dini_hari', 'dini hari', 'early_morning'],
  },
  {
    contextId: 'morning',
    contextLabel: 'Pagi',
    sessionShift: 'morning',
    boundaryStartTime: '06:00',
    boundaryEndTime: '12:00',
    aliases: ['pagi', 'morning'],
  },
  {
    contextId: 'afternoon',
    contextLabel: 'Siang',
    sessionShift: 'afternoon',
    boundaryStartTime: '12:00',
    boundaryEndTime: '17:00',
    aliases: ['siang', 'sore', 'afternoon'],
  },
  {
    contextId: 'night',
    contextLabel: 'Malam',
    sessionShift: 'night',
    boundaryStartTime: '17:00',
    boundaryEndTime: '21:00',
    aliases: ['malam', 'night'],
  },
];

@Injectable()
export class ScheduleDrizzleRepository implements ScheduleRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private toAvatarUrl(
    staffProfile?: {
      avatarUrl?: string | null;
    } | null,
  ): string {
    return staffProfile?.avatarUrl ?? '';
  }

  private async resolvePractitioner(staffOrPractitionerId: string) {
    if (!staffOrPractitionerId || !this.isUuid(staffOrPractitionerId)) {
      return null;
    }
    return this.db.query.practitioners.findFirst({
      where: or(
        eq(practitioners.id, staffOrPractitionerId),
        eq(practitioners.staffProfileId, staffOrPractitionerId),
      ),
      with: {
        staffProfile: true,
      },
    });
  }

  private resolveScheduleContext(
    scheduleContextId: string,
  ): ScheduleContextDefinition {
    const normalized = scheduleContextId.trim().toLowerCase();
    const context = SCHEDULE_CONTEXT_DEFINITIONS.find(
      (definition) =>
        definition.contextId === normalized ||
        definition.aliases.includes(normalized),
    );

    if (!context) {
      throw new UnprocessableEntityException({
        code: 'SCHEDULE_CONTEXT_NOT_FOUND',
        message: 'Konteks jadwal yang dipilih tidak tersedia.',
        metadata: {
          scheduleContextId,
          supportedContextIds: SCHEDULE_CONTEXT_DEFINITIONS.map(
            (definition) => definition.contextId,
          ),
        },
      });
    }

    return context;
  }

  private getPolicy(practitioner: {
    consultationDurationMinutes?: number | null;
    startPrecisionMinutes?: number | null;
  }) {
    return {
      durationMinutes:
        practitioner.consultationDurationMinutes ??
        DEFAULT_CONSULTATION_DURATION_MINUTES,
      startPrecisionMinutes:
        practitioner.startPrecisionMinutes ?? DEFAULT_START_PRECISION_MINUTES,
    };
  }

  private toScheduleContextEntity(
    practitionerId: string,
    date: string,
    context: ScheduleContextDefinition,
    policy: { durationMinutes: number; startPrecisionMinutes: number },
    durationEditableByCurrentUser: boolean,
  ): ScheduleContextEntity {
    return {
      contextId: context.contextId,
      contextLabel: context.contextLabel,
      sessionShift: context.sessionShift,
      date,
      practitionerId,
      boundaryStartTime: context.boundaryStartTime,
      boundaryEndTime: context.boundaryEndTime,
      allowedStartPrecisionMinutes: policy.startPrecisionMinutes,
      timezone: CLINIC_TIMEZONE,
      effectiveConsultationDurationMinutes: policy.durationMinutes,
      durationSource: 'PRACTITIONER_CONFIG',
      durationScope: 'practitioner-specific',
      durationEditableByCurrentUser,
    };
  }

  private calculateSessionTimeAndCapacity(
    context: ScheduleContextDefinition,
    selectedStartTime: string,
    policy: { durationMinutes: number; startPrecisionMinutes: number },
    options?: {
      endTime?: string;
      slotsCount?: number;
      fillShift?: boolean;
    },
  ): {
    startMinutes: number;
    endMinutes: number;
    endTime: string;
    capacity: number;
    remainingShiftSlots: number;
  } {
    const startMinutes = parseClockTime(selectedStartTime);
    const boundaryStart = parseClockTime(context.boundaryStartTime);
    const boundaryEnd = parseClockTime(context.boundaryEndTime);

    if (startMinutes < boundaryStart || startMinutes >= boundaryEnd) {
      throw new UnprocessableEntityException({
        code: 'START_OUTSIDE_BOUNDARY',
        message: 'Jam mulai berada di luar batas konteks jadwal yang dipilih.',
        metadata: {
          selectedStartTime,
          boundaryStartTime: context.boundaryStartTime,
          boundaryEndTime: context.boundaryEndTime,
        },
      });
    }

    if ((startMinutes - boundaryStart) % policy.startPrecisionMinutes !== 0) {
      throw new UnprocessableEntityException({
        code: 'INVALID_START_PRECISION',
        message: 'Jam mulai tidak sesuai presisi menit yang diizinkan backend.',
        metadata: {
          selectedStartTime,
          allowedStartPrecisionMinutes: policy.startPrecisionMinutes,
        },
      });
    }

    let endMinutes: number;
    let capacity: number;

    if (options?.endTime) {
      const parsedEnd = parseClockTime(options.endTime);
      if (parsedEnd <= startMinutes || parsedEnd > boundaryEnd) {
        throw new UnprocessableEntityException({
          code: 'END_OUTSIDE_BOUNDARY',
          message:
            'Jam selesai harus lebih besar dari jam mulai dan tidak melebihi batas shift.',
          metadata: {
            selectedStartTime,
            endTime: options.endTime,
            boundaryEndTime: context.boundaryEndTime,
          },
        });
      }
      endMinutes = parsedEnd;
      capacity = Math.floor(
        (endMinutes - startMinutes) / policy.durationMinutes,
      );
    } else if (options?.slotsCount && options.slotsCount > 0) {
      endMinutes = startMinutes + options.slotsCount * policy.durationMinutes;
      if (endMinutes > boundaryEnd) {
        throw new UnprocessableEntityException({
          code: 'SLOTS_EXCEED_BOUNDARY',
          message: 'Jumlah slot yang diminta melebihi batas waktu shift.',
          metadata: {
            slotsCount: options.slotsCount,
            boundaryEndTime: context.boundaryEndTime,
          },
        });
      }
      capacity = options.slotsCount;
    } else if (options?.fillShift === true) {
      capacity = Math.floor(
        (boundaryEnd - startMinutes) / policy.durationMinutes,
      );
      endMinutes = startMinutes + capacity * policy.durationMinutes;
    } else {
      // DEFAULT: 1 sesi konsultasi sesuai durasi dokter (misal 30 menit)!
      // 02:00 -> 02:30, 06:00 -> 06:30
      endMinutes = startMinutes + policy.durationMinutes;
      if (endMinutes > boundaryEnd) {
        throw new UnprocessableEntityException({
          code: 'DURATION_LEAVES_NO_CAPACITY',
          message:
            'Jam mulai terlalu dekat dengan akhir shift untuk satu sesi konsultasi.',
          metadata: {
            selectedStartTime,
            boundaryEndTime: context.boundaryEndTime,
            effectiveConsultationDurationMinutes: policy.durationMinutes,
          },
        });
      }
      capacity = 1;
    }

    if (capacity < 1) {
      throw new UnprocessableEntityException({
        code: 'DURATION_LEAVES_NO_CAPACITY',
        message:
          'Jam mulai dan durasi konsultasi tidak menyisakan kapasitas interval.',
        metadata: {
          selectedStartTime,
          boundaryEndTime: context.boundaryEndTime,
          effectiveConsultationDurationMinutes: policy.durationMinutes,
        },
      });
    }

    const remainingShiftSlots = Math.max(
      0,
      Math.floor((boundaryEnd - endMinutes) / policy.durationMinutes),
    );

    return {
      startMinutes,
      endMinutes,
      endTime: formatClockTime(endMinutes),
      capacity,
      remainingShiftSlots,
    };
  }

  private validateProjectionRequest(
    context: ScheduleContextDefinition,
    selectedStartTime: string,
    policy: { durationMinutes: number; startPrecisionMinutes: number },
  ) {
    const startMinutes = parseClockTime(selectedStartTime);
    const boundaryStart = parseClockTime(context.boundaryStartTime);
    const boundaryEnd = parseClockTime(context.boundaryEndTime);

    if (startMinutes < boundaryStart || startMinutes >= boundaryEnd) {
      throw new UnprocessableEntityException({
        code: 'START_OUTSIDE_BOUNDARY',
        message: 'Jam mulai berada di luar batas konteks jadwal yang dipilih.',
        metadata: {
          selectedStartTime,
          boundaryStartTime: context.boundaryStartTime,
          boundaryEndTime: context.boundaryEndTime,
        },
      });
    }

    if ((startMinutes - boundaryStart) % policy.startPrecisionMinutes !== 0) {
      throw new UnprocessableEntityException({
        code: 'INVALID_START_PRECISION',
        message: 'Jam mulai tidak sesuai presisi menit yang diizinkan backend.',
        metadata: {
          selectedStartTime,
          allowedStartPrecisionMinutes: policy.startPrecisionMinutes,
        },
      });
    }

    const capacity = Math.floor(
      (boundaryEnd - startMinutes) / policy.durationMinutes,
    );
    if (capacity < 1) {
      throw new UnprocessableEntityException({
        code: 'DURATION_LEAVES_NO_CAPACITY',
        message:
          'Jam mulai dan durasi konsultasi tidak menyisakan kapasitas interval.',
        metadata: {
          selectedStartTime,
          boundaryEndTime: context.boundaryEndTime,
          effectiveConsultationDurationMinutes: policy.durationMinutes,
        },
      });
    }
  }

  private mapRecordToEntity(r: any): ScheduleEntity {
    const shift = r.sessionShift;
    const sessionName =
      shift === 'afternoon' ? 'SIANG' : shift === 'night' ? 'MALAM' : 'PAGI';
    const sessionLabel =
      r.sessionLabel ||
      (shift === 'afternoon' ? 'Siang' : shift === 'night' ? 'Malam' : 'Pagi');

    const startTimeFormatted = r.startTime ? r.startTime.slice(0, 5) : null;
    const endTimeFormatted = r.endTime ? r.endTime.slice(0, 5) : null;
    const timeRange =
      startTimeFormatted && endTimeFormatted
        ? `${startTimeFormatted} - ${endTimeFormatted} WIB`
        : undefined;

    const capacity = r.capacity ?? 0;
    const availableSlots = r.availableSlots ?? capacity;
    const bookedPatientCount = Math.max(0, capacity - availableSlots);

    const operationalStatus = resolveSessionOperationalStatus({
      isClosedForLeave: false,
      availableSlots,
      persistedStatus: r.status,
    });
    const isAvailable = operationalStatus === ScheduleOperationalStatus.OPEN;

    return {
      id: r.id,
      staffId: r.practitioner?.staffProfileId || r.practitionerId,
      staffName:
        r.practitioner?.staffProfile?.fullName ||
        r.practitioner?.displayName ||
        'Dokter Amanah',
      profession: r.practitioner?.staffProfile?.positionTitle || 'Dokter Umum',
      scheduleDate: r.scheduleDate,
      specificDate: r.scheduleDate,
      poliklinikId:
        r.clinicRoom?.unitId ||
        r.practitioner?.staffProfile?.primaryUnitId ||
        null,
      poliklinikName:
        r.clinicRoom?.clinicUnit?.name ||
        r.practitioner?.staffProfile?.clinicUnit?.name ||
        'Poliklinik',
      serviceId: r.serviceId || null,
      serviceName: r.clinicService?.name || null,
      dayOfWeek: null,
      session: sessionName,
      sessionLabel,
      sessionShift: shift,
      startTime: startTimeFormatted,
      endTime: endTimeFormatted,
      timeRange,
      roomId: r.roomId || null,
      roomName: r.clinicRoom?.name || (r.roomId ? 'Ruang Praktek' : null),
      capacity,
      availableSlots,
      bookedPatientCount,
      status: operationalStatus,
      rawStatus: r.status,
      isAvailable,
      notes: r.notes || null,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
      version: generateEntityVersion(r.updatedAt),
    };
  }

  private async checkScheduleConflicts(
    practitionerId: string,
    scheduleDate: string,
    startTime: string,
    endTime: string,
    roomId?: string | null,
    excludeSessionId?: string,
  ) {
    const formattedStart =
      startTime.length === 5 ? `${startTime}:00` : startTime;
    const formattedEnd = endTime.length === 5 ? `${endTime}:00` : endTime;

    if (formattedStart >= formattedEnd) {
      throw new ConflictException({
        code: 'INVALID_TIME_RANGE',
        message: 'Jam mulai harus lebih awal daripada jam selesai.',
      });
    }

    // 1. Doctor overlapping session check on the same date
    const doctorConditions = [
      eq(practitionerScheduleSessions.practitionerId, practitionerId),
      eq(practitionerScheduleSessions.scheduleDate, scheduleDate),
    ];
    if (excludeSessionId) {
      doctorConditions.push(
        not(eq(practitionerScheduleSessions.id, excludeSessionId)),
      );
    }

    const doctorSessions =
      await this.db.query.practitionerScheduleSessions.findMany({
        where: and(...doctorConditions),
      });

    for (const sess of doctorSessions) {
      const sessStart =
        sess.startTime.length === 5 ? `${sess.startTime}:00` : sess.startTime;
      const sessEnd =
        sess.endTime.length === 5 ? `${sess.endTime}:00` : sess.endTime;

      if (formattedStart < sessEnd && formattedEnd > sessStart) {
        throw new ConflictException({
          code: 'PRACTITIONER_ALREADY_SCHEDULED',
          message: `Dokter sudah memiliki jadwal praktek lain pada jam ${sess.startTime.slice(0, 5)} - ${sess.endTime.slice(0, 5)} WIB.`,
          metadata: {
            conflictingSessionId: sess.id,
            scheduleDate: sess.scheduleDate,
            startTime: sess.startTime.slice(0, 5),
            endTime: sess.endTime.slice(0, 5),
            timeRange: `${sess.startTime.slice(0, 5)} - ${sess.endTime.slice(0, 5)} WIB`,
            roomId: sess.roomId,
            sessionShift: sess.sessionShift,
            sessionLabel: sess.sessionLabel,
          },
        });
      }
    }

    // 2. Room occupancy check if roomId is provided
    if (roomId) {
      const roomConditions = [
        eq(practitionerScheduleSessions.roomId, roomId),
        eq(practitionerScheduleSessions.scheduleDate, scheduleDate),
      ];
      if (excludeSessionId) {
        roomConditions.push(
          not(eq(practitionerScheduleSessions.id, excludeSessionId)),
        );
      }

      const roomSessions =
        await this.db.query.practitionerScheduleSessions.findMany({
          where: and(...roomConditions),
          with: {
            practitioner: {
              with: {
                staffProfile: true,
              },
            },
            clinicRoom: true,
          },
        });

      for (const sess of roomSessions) {
        const sessStart =
          sess.startTime.length === 5 ? `${sess.startTime}:00` : sess.startTime;
        const sessEnd =
          sess.endTime.length === 5 ? `${sess.endTime}:00` : sess.endTime;

        if (formattedStart < sessEnd && formattedEnd > sessStart) {
          const roomName = sess.clinicRoom?.name || 'Ruangan';
          const doctorName =
            sess.practitioner?.staffProfile?.fullName ||
            sess.practitioner?.displayName ||
            'Dokter lain';
          throw new ConflictException({
            code: 'ROOM_ALREADY_OCCUPIED',
            message: `${roomName} sudah dijadwalkan untuk ${doctorName} pada jam ${sess.startTime.slice(0, 5)} - ${sess.endTime.slice(0, 5)} WIB.`,
            metadata: {
              conflictingSessionId: sess.id,
              scheduleDate: sess.scheduleDate,
              startTime: sess.startTime.slice(0, 5),
              endTime: sess.endTime.slice(0, 5),
              timeRange: `${sess.startTime.slice(0, 5)} - ${sess.endTime.slice(0, 5)} WIB`,
              roomId: sess.roomId,
              roomName,
              occupiedBy: doctorName,
            },
          });
        }
      }
    }
  }

  async create(
    data: Omit<ScheduleEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ScheduleEntity> {
    const practitioner = await this.resolvePractitioner(data.staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${data.staffId} tidak ditemukan`,
      );
    }
    const practitionerId = practitioner.id;

    const shift: 'morning' | 'afternoon' | 'night' =
      data.session === 'SIANG' || data.sessionShift === 'afternoon'
        ? 'afternoon'
        : data.session === 'MALAM' || data.sessionShift === 'night'
          ? 'night'
          : 'morning';

    const sessionLabel =
      data.sessionLabel ||
      (shift === 'afternoon' ? 'Siang' : shift === 'night' ? 'Malam' : 'Pagi');

    const targetDate =
      data.scheduleDate ||
      data.specificDate ||
      new Date().toISOString().split('T')[0];

    const defaultStartTime =
      data.startTime ||
      (shift === 'afternoon' ? '13:00' : shift === 'night' ? '18:00' : '07:00');
    const defaultEndTime =
      data.endTime ||
      (shift === 'afternoon' ? '17:00' : shift === 'night' ? '21:00' : '11:00');

    let roomId = data.roomId || null;
    if (!roomId && data.poliklinikId) {
      const room = await this.db.query.clinicRooms.findFirst({
        where: eq(clinicRooms.unitId, data.poliklinikId),
      });
      if (room) roomId = room.id;
    }

    const capacity = data.capacity ?? 8;

    // Validate conflicts (time order, doctor overlap, room overlap)
    await this.checkScheduleConflicts(
      practitionerId,
      targetDate,
      defaultStartTime,
      defaultEndTime,
      roomId,
    );

    // Link day setting if one exists for practitioner & date
    const daySetting =
      await this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          eq(practitionerScheduleDaySettings.scheduleDate, targetDate),
        ),
      });

    const [record] = await this.db
      .insert(practitionerScheduleSessions)
      .values({
        practitionerId,
        daySettingId: daySetting?.id || null,
        roomId,
        serviceId: data.serviceId || null,
        scheduleDate: targetDate,
        sessionLabel,
        sessionShift: shift,
        startTime:
          defaultStartTime.length === 5
            ? `${defaultStartTime}:00`
            : defaultStartTime,
        endTime:
          defaultEndTime.length === 5 ? `${defaultEndTime}:00` : defaultEndTime,
        capacity,
        availableSlots: capacity,
        status: data.isAvailable
          ? SchedulePersistenceStatus.OPEN
          : SchedulePersistenceStatus.CLOSED,
        notes: data.notes || null,
      })
      .returning();

    return (await this.findById(record.id)) as ScheduleEntity;
  }

  async findById(id: string): Promise<ScheduleEntity | null> {
    const record = await this.db.query.practitionerScheduleSessions.findFirst({
      where: eq(practitionerScheduleSessions.id, id),
      with: {
        practitioner: {
          with: {
            staffProfile: {
              with: {
                clinicUnit: true,
                user: true,
              },
            },
          },
        },
        clinicRoom: {
          with: {
            clinicUnit: true,
          },
        },
        clinicService: true,
      },
    });

    return record ? this.mapRecordToEntity(record) : null;
  }

  async findAll(
    limit = 20,
    offset = 0,
    filters?: {
      poliklinikId?: string;
      staffId?: string;
      date?: string;
    },
  ): Promise<ScheduleEntity[]> {
    const conditions: any[] = [];
    if (filters?.date) {
      conditions.push(
        eq(practitionerScheduleSessions.scheduleDate, filters.date),
      );
    }

    const records = await this.db.query.practitionerScheduleSessions.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      limit,
      offset,
      orderBy: [
        desc(practitionerScheduleSessions.scheduleDate),
        asc(practitionerScheduleSessions.startTime),
        desc(practitionerScheduleSessions.id),
      ],
      with: {
        practitioner: {
          with: {
            staffProfile: {
              with: {
                clinicUnit: true,
              },
            },
          },
        },
        clinicRoom: {
          with: {
            clinicUnit: true,
          },
        },
        clinicService: true,
      },
    });

    let result = records.map((r) => this.mapRecordToEntity(r));

    if (filters?.poliklinikId) {
      result = result.filter((s) => s.poliklinikId === filters.poliklinikId);
    }
    if (filters?.staffId) {
      result = result.filter((s) => s.staffId === filters.staffId);
    }

    return result;
  }

  async findByStaffId(staffId: string): Promise<ScheduleEntity[]> {
    return this.findMySchedules(staffId);
  }

  async findMySchedules(
    staffId: string,
    filters?: {
      date?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<ScheduleEntity[]> {
    const practitioner = await this.resolvePractitioner(staffId);
    if (!practitioner) {
      return [];
    }
    const targetId = practitioner.id;

    const conditions: any[] = [
      eq(practitionerScheduleSessions.practitionerId, targetId),
    ];

    if (filters?.date) {
      conditions.push(
        eq(practitionerScheduleSessions.scheduleDate, filters.date),
      );
    }
    if (filters?.startDate) {
      conditions.push(
        gte(practitionerScheduleSessions.scheduleDate, filters.startDate),
      );
    }
    if (filters?.endDate) {
      conditions.push(
        lte(practitionerScheduleSessions.scheduleDate, filters.endDate),
      );
    }

    const records = await this.db.query.practitionerScheduleSessions.findMany({
      where: and(...conditions),
      orderBy: [
        asc(practitionerScheduleSessions.scheduleDate),
        asc(practitionerScheduleSessions.startTime),
      ],
      with: {
        practitioner: {
          with: {
            staffProfile: {
              with: {
                clinicUnit: true,
              },
            },
          },
        },
        clinicRoom: {
          with: {
            clinicUnit: true,
          },
        },
        clinicService: true,
      },
    });

    return records.map((r) => this.mapRecordToEntity(r));
  }

  async findByPoliAndDate(poliklinikId: string, date: string): Promise<any[]> {
    const sessions = await this.db.query.practitionerScheduleSessions.findMany({
      where: and(
        eq(practitionerScheduleSessions.scheduleDate, date),
        eq(practitionerScheduleSessions.status, SchedulePersistenceStatus.OPEN),
      ),
      with: {
        practitioner: {
          with: {
            staffProfile: {
              with: {
                clinicUnit: true,
              },
            },
          },
        },
        clinicRoom: {
          with: {
            clinicUnit: true,
          },
        },
        clinicService: true,
      },
    });

    return sessions
      .filter((s) => {
        if (!poliklinikId) return true;
        return (
          s.clinicRoom?.unitId === poliklinikId ||
          s.practitioner?.staffProfile?.primaryUnitId === poliklinikId
        );
      })
      .map((s) => this.mapRecordToEntity(s));
  }

  async update(
    id: string,
    data: Partial<ScheduleEntity>,
  ): Promise<ScheduleEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updateValues: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    let targetDate = existing.scheduleDate || existing.specificDate!;
    if (data.scheduleDate || data.specificDate) {
      targetDate = (data.scheduleDate || data.specificDate)!;
      updateValues.scheduleDate = targetDate;
    }

    let startTime = existing.startTime!;
    if (data.startTime) {
      startTime = data.startTime;
      updateValues.startTime =
        startTime.length === 5 ? `${startTime}:00` : startTime;
    }

    let endTime = existing.endTime!;
    if (data.endTime) {
      endTime = data.endTime;
      updateValues.endTime = endTime.length === 5 ? `${endTime}:00` : endTime;
    }

    let roomId = existing.roomId;
    if (data.roomId !== undefined) {
      roomId = data.roomId;
      updateValues.roomId = roomId;
    }

    if (data.session || data.sessionShift || data.sessionLabel) {
      const shift =
        data.session === 'SIANG' || data.sessionShift === 'afternoon'
          ? 'afternoon'
          : data.session === 'MALAM' || data.sessionShift === 'night'
            ? 'night'
            : 'morning';
      updateValues.sessionLabel =
        data.sessionLabel ||
        (shift === 'afternoon'
          ? 'Siang'
          : shift === 'night'
            ? 'Malam'
            : 'Pagi');
      updateValues.sessionShift = shift;
    }

    if (data.capacity !== undefined) {
      updateValues.capacity = data.capacity;
    }

    if (data.serviceId !== undefined) {
      updateValues.serviceId = data.serviceId;
    }

    if (data.status !== undefined) {
      const requestedStatus = toAdminScheduleStatusRequest(data.status);
      if (!requestedStatus) {
        throw new BadRequestException({
          code: 'INVALID_SCHEDULE_STATUS',
          message: 'status must use canonical values only: OPEN or CLOSED.',
          metadata: { status: data.status },
        });
      }
      const isOpen = requestedStatus === AdminScheduleStatusRequest.OPEN;
      updateValues.status = toDaySessionPersistenceStatus(requestedStatus);
      if (!isOpen) {
        updateValues.availableSlots = 0;
      } else if (
        existing.availableSlots === 0 ||
        existing.availableSlots === null
      ) {
        updateValues.availableSlots = sql`capacity`;
      }
    } else if (data.isAvailable !== undefined) {
      updateValues.status = data.isAvailable
        ? SchedulePersistenceStatus.OPEN
        : SchedulePersistenceStatus.CLOSED;
      if (!data.isAvailable) {
        updateValues.availableSlots = 0;
      } else if (
        existing.availableSlots === 0 ||
        existing.availableSlots === null
      ) {
        updateValues.availableSlots = sql`capacity`;
      }
    }

    if (data.notes !== undefined) {
      updateValues.notes = data.notes;
    }

    // Check conflicts if times or room were modified
    if (
      data.startTime ||
      data.endTime ||
      data.roomId !== undefined ||
      data.scheduleDate
    ) {
      const practitioner = await this.resolvePractitioner(existing.staffId);
      const practitionerId = practitioner ? practitioner.id : existing.staffId;
      await this.checkScheduleConflicts(
        practitionerId,
        targetDate,
        startTime,
        endTime,
        roomId,
        id,
      );
    }

    const [updated] = await this.db
      .update(practitionerScheduleSessions)
      .set(updateValues)
      .where(eq(practitionerScheduleSessions.id, id))
      .returning();

    return updated ? this.findById(updated.id) : null;
  }

  async toggleAvailability(
    id: string,
    isAvailable: boolean,
  ): Promise<ScheduleEntity | null> {
    const existing = await this.findById(id);
    const updateValues: Record<string, any> = {
      status: isAvailable
        ? SchedulePersistenceStatus.OPEN
        : SchedulePersistenceStatus.CLOSED,
      updatedAt: new Date().toISOString(),
    };
    if (!isAvailable) {
      updateValues.availableSlots = 0;
    } else if (!existing || existing.availableSlots === 0) {
      updateValues.availableSlots = sql`capacity`;
    }

    const [record] = await this.db
      .update(practitionerScheduleSessions)
      .set(updateValues)
      .where(eq(practitionerScheduleSessions.id, id))
      .returning();

    return record ? this.findById(record.id) : null;
  }

  async delete(id: string): Promise<boolean> {
    // Relational protection: check for active booked appointments
    const activeAppointments = await this.db.query.appointments.findMany({
      where: and(
        eq(appointments.scheduleSessionId, id),
        inArray(appointments.status, [
          'booked',
          'checked_in',
          'waiting',
          'in_service',
        ]),
      ),
    });

    if (activeAppointments.length > 0) {
      throw new ConflictException({
        code: 'SCHEDULE_HAS_ACTIVE_BOOKINGS',
        message: `Jadwal tidak dapat dihapus karena sudah memiliki ${activeAppointments.length} pasien terdaftar. Batalkan atau jadwalkan ulang janji temu pasien terlebih dahulu.`,
      });
    }

    const existingSession =
      await this.db.query.practitionerScheduleSessions.findFirst({
        where: eq(practitionerScheduleSessions.id, id),
      });

    const res = await this.db
      .delete(practitionerScheduleSessions)
      .where(eq(practitionerScheduleSessions.id, id))
      .returning();

    if (res.length > 0 && existingSession) {
      const remainingOpen =
        await this.db.query.practitionerScheduleSessions.findMany({
          where: and(
            eq(
              practitionerScheduleSessions.practitionerId,
              existingSession.practitionerId,
            ),
            eq(
              practitionerScheduleSessions.scheduleDate,
              existingSession.scheduleDate,
            ),
            eq(
              practitionerScheduleSessions.status,
              SchedulePersistenceStatus.OPEN,
            ),
          ),
        });

      if (remainingOpen.length === 0) {
        await this.db
          .update(practitionerScheduleDaySettings)
          .set({
            leaveReason: null,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(
                practitionerScheduleDaySettings.practitionerId,
                existingSession.practitionerId,
              ),
              eq(
                practitionerScheduleDaySettings.scheduleDate,
                existingSession.scheduleDate,
              ),
              eq(practitionerScheduleDaySettings.isLeave, false),
            ),
          );
      }
    }

    return res.length > 0;
  }

  async getCalendarSummary(
    staffId: string,
    month: string,
  ): Promise<CalendarSummaryResponse> {
    const practitioner = await this.resolvePractitioner(staffId);
    if (!practitioner) {
      return {
        month,
        days: [],
      };
    }
    const practitionerId = practitioner.id;

    // Month format: YYYY-MM
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const startDate = `${month}-01`;
    const endDate = `${month}-${String(daysInMonth).padStart(2, '0')}`;

    // 1. Fetch all sessions in month
    const sessions = await this.db.query.practitionerScheduleSessions.findMany({
      where: and(
        eq(practitionerScheduleSessions.practitionerId, practitionerId),
        gte(practitionerScheduleSessions.scheduleDate, startDate),
        lte(practitionerScheduleSessions.scheduleDate, endDate),
      ),
    });

    // 2. Fetch all day settings in month
    const daySettings =
      await this.db.query.practitionerScheduleDaySettings.findMany({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          gte(practitionerScheduleDaySettings.scheduleDate, startDate),
          lte(practitionerScheduleDaySettings.scheduleDate, endDate),
        ),
      });

    // 3. Aggregate per day
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      const daySessions = sessions.filter((s) => s.scheduleDate === date);
      const daySetting = daySettings.find((ds) => ds.scheduleDate === date);

      const hasSchedule = daySessions.length > 0;
      const isCuti = daySetting?.isLeave ?? false;
      const cutiReason = isCuti ? (daySetting?.leaveReason ?? null) : null;
      const sessionCount = daySessions.length;
      const targetQuota = daySetting?.targetQuota ?? (hasSchedule ? 8 : 0);

      const bookedPatientCount = daySessions.reduce(
        (acc, s) =>
          acc + Math.max(0, (s.capacity ?? 8) - (s.availableSlots ?? 8)),
        0,
      );

      const capacityPercentage =
        targetQuota > 0
          ? Math.min(100, Math.round((bookedPatientCount / targetQuota) * 100))
          : 0;

      const daySessionStatuses = daySessions.map((s) =>
        this.toAdminSessionStatus(
          isCuti,
          isCuti ? 0 : (s.availableSlots ?? s.capacity ?? 8),
          s.status,
        ),
      );

      const dayOpStatus = this.toAdminAggregateStatus({
        isClosedForLeave: isCuti,
        sessionStatuses: daySessionStatuses,
      });

      const isClosed = dayOpStatus === ScheduleOperationalStatus.CLOSED;
      let dayNotes: string | null = null;

      if (isCuti) {
        dayNotes = cutiReason || 'Cuti Dokter';
      } else if (daySessions.length === 0) {
        dayNotes = null;
      } else if (dayOpStatus === ScheduleOperationalStatus.CLOSED) {
        dayNotes =
          daySetting?.leaveReason || 'Jadwal ditutup oleh dokter/admin';
      } else if (dayOpStatus === ScheduleOperationalStatus.OCCUPIED) {
        dayNotes = 'Interval terisi oleh pasien reservasi';
      }

      days.push({
        date,
        hasSchedule,
        isCuti,
        cutiReason,
        sessionCount,
        targetQuota,
        bookedPatientCount,
        capacityPercentage,
        status: dayOpStatus,
        isClosed,
        notes: dayNotes,
      });
    }

    return {
      month,
      days,
    };
  }

  async getDaySettings(
    staffId: string,
    date: string,
  ): Promise<DayScheduleSettingEntity> {
    const practitioner = await this.resolvePractitioner(staffId);
    if (!practitioner) {
      return {
        practitionerId: staffId,
        scheduleDate: date,
        targetQuota: 8,
        isCuti: false,
        cutiReason: null,
        totalBookedPatients: 0,
        capacityPercentage: 0,
      };
    }
    const practitionerId = practitioner.id;

    const daySetting =
      await this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          eq(practitionerScheduleDaySettings.scheduleDate, date),
        ),
      });

    const sessions = await this.db.query.practitionerScheduleSessions.findMany({
      where: and(
        eq(practitionerScheduleSessions.practitionerId, practitionerId),
        eq(practitionerScheduleSessions.scheduleDate, date),
      ),
    });

    const totalBookedPatients = sessions.reduce(
      (acc, s) =>
        acc + Math.max(0, (s.capacity ?? 8) - (s.availableSlots ?? 8)),
      0,
    );

    const targetQuota = daySetting?.targetQuota ?? 8;
    const isCuti = daySetting?.isLeave ?? false;
    const cutiReason = isCuti ? (daySetting?.leaveReason ?? null) : null;
    const capacityPercentage =
      targetQuota > 0
        ? Math.min(100, Math.round((totalBookedPatients / targetQuota) * 100))
        : 0;

    return {
      id: daySetting?.id,
      practitionerId,
      scheduleDate: date,
      targetQuota,
      isCuti,
      cutiReason,
      totalBookedPatients,
      capacityPercentage,
    };
  }

  async upsertDaySettings(
    staffId: string,
    date: string,
    data: {
      targetQuota?: number;
      isCuti?: boolean;
      cutiReason?: string | null;
      userId?: string;
    },
  ): Promise<DayScheduleSettingEntity> {
    const practitioner = await this.resolvePractitioner(staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${staffId} tidak ditemukan`,
      );
    }
    const practitionerId = practitioner.id;

    const existing =
      await this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          eq(practitionerScheduleDaySettings.scheduleDate, date),
        ),
      });

    const targetQuota =
      data.targetQuota !== undefined
        ? data.targetQuota
        : (existing?.targetQuota ?? 8);
    const isLeave =
      data.isCuti !== undefined ? data.isCuti : (existing?.isLeave ?? false);
    const leaveReason =
      data.cutiReason !== undefined
        ? data.cutiReason
        : (existing?.leaveReason ?? null);

    let settingId: string;

    if (existing) {
      const [updated] = await this.db
        .update(practitionerScheduleDaySettings)
        .set({
          targetQuota,
          isLeave,
          leaveReason,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(practitionerScheduleDaySettings.id, existing.id))
        .returning();
      settingId = updated.id;
    } else {
      const [inserted] = await this.db
        .insert(practitionerScheduleDaySettings)
        .values({
          practitionerId,
          scheduleDate: date,
          targetQuota,
          isLeave,
          leaveReason,
          createdBy: data.userId || null,
        })
        .returning();
      settingId = inserted.id;
    }

    // Attach daySettingId to any sessions on that date that do not have one
    await this.db
      .update(practitionerScheduleSessions)
      .set({
        daySettingId: settingId,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(practitionerScheduleSessions.practitionerId, practitionerId),
          eq(practitionerScheduleSessions.scheduleDate, date),
        ),
      );

    return this.getDaySettings(staffId, date);
  }

  async getBookedPatients(
    sessionId?: string,
    date?: string,
    staffId?: string,
  ): Promise<BookedPatientEntity[]> {
    const conditions: any[] = [];

    if (sessionId) {
      conditions.push(eq(appointments.scheduleSessionId, sessionId));
    }
    if (date) {
      conditions.push(eq(appointments.scheduledDate, date));
    }
    if (staffId) {
      const practitioner = await this.resolvePractitioner(staffId);
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

    return appointmentRecords.map((apt) => {
      let ageStr = '-';
      if (apt.patientProfile?.birthDate) {
        const birth = new Date(apt.patientProfile.birthDate);
        const now = new Date();
        let years = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
          years--;
        }
        ageStr = `${Math.max(0, years)} Thn`;
      }

      const queueNumber =
        apt.queueTickets?.[0]?.queueNumber ||
        `#${apt.bookingCode ? apt.bookingCode.slice(-2) : '01'}`;

      const start = apt.scheduledStartTime
        ? apt.scheduledStartTime.slice(0, 5)
        : '08:00';
      const end = apt.scheduledEndTime
        ? apt.scheduledEndTime.slice(0, 5)
        : '09:30';
      const timeSlot = `${start} - ${end} WIB`;

      const sessionTitle = apt.practitionerScheduleSession?.sessionLabel
        ? `Sesi ${apt.practitionerScheduleSession.sessionLabel}`
        : 'Sesi Praktek';

      const room =
        apt.clinicRoom?.name ||
        apt.practitionerScheduleSession?.clinicRoom?.name ||
        'Ruang Periksa';

      const status = apt.status;
      const statusBadgeMap: Record<string, string> = {
        booked: 'Booked',
        checked_in: 'Check In',
        waiting: 'Menunggu',
        in_service: 'Pemeriksaan',
        completed: 'Selesai',
        cancelled: 'Dibatalkan',
      };
      const statusBadge = statusBadgeMap[status] || status;

      return {
        id: apt.patientProfile?.id || apt.patientId,
        appointmentId: apt.id,
        fullName: apt.patientProfile?.fullName || 'Pasien',
        medicalRecordNumber:
          apt.patientProfile?.medicalRecordNumber || 'RM-UNKNOWN',
        age: ageStr,
        gender:
          apt.patientProfile?.gender === 'female' ? 'Perempuan' : 'Laki-laki',
        queueNumber,
        timeSlot,
        sessionTitle,
        room,
        guardian: apt.guardianNameSnapshot || null,
        complaint: apt.complaint || null,
        status,
        statusBadge,
        avatarUrl: apt.patientProfile?.avatarUrl || null,
      };
    });
  }

  async getRooms(
    date?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<ClinicRoomReferenceEntity[]> {
    const rooms = await this.db.query.clinicRooms.findMany({
      where: eq(clinicRooms.isActive, true),
      orderBy: [asc(clinicRooms.floor), asc(clinicRooms.name)],
    });

    if (!date || !startTime || !endTime) {
      return rooms.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        location: r.location,
        floor: r.floor,
        isOccupied: false,
        occupiedBy: null,
      }));
    }

    const formattedStart =
      startTime.length === 5 ? `${startTime}:00` : startTime;
    const formattedEnd = endTime.length === 5 ? `${endTime}:00` : endTime;

    const sessions = await this.db.query.practitionerScheduleSessions.findMany({
      where: and(
        eq(practitionerScheduleSessions.scheduleDate, date),
        eq(practitionerScheduleSessions.status, SchedulePersistenceStatus.OPEN),
      ),
      with: {
        practitioner: {
          with: {
            staffProfile: true,
          },
        },
        clinicRoom: true,
      },
    });

    return rooms.map((r) => {
      const activeSession = sessions.find((s) => {
        if (s.roomId !== r.id) return false;
        const sessStart =
          s.startTime.length === 5 ? `${s.startTime}:00` : s.startTime;
        const sessEnd = s.endTime.length === 5 ? `${s.endTime}:00` : s.endTime;
        return formattedStart < sessEnd && formattedEnd > sessStart;
      });

      if (activeSession) {
        const docName =
          activeSession.practitioner?.staffProfile?.fullName ||
          activeSession.practitioner?.displayName ||
          'Dokter';
        const range = `${activeSession.startTime.slice(0, 5)} - ${activeSession.endTime.slice(0, 5)} WIB`;
        return {
          id: r.id,
          code: r.code,
          name: r.name,
          location: r.location,
          floor: r.floor,
          isOccupied: true,
          occupiedBy: `${docName} (${range})`,
        };
      }

      return {
        id: r.id,
        code: r.code,
        name: r.name,
        location: r.location,
        floor: r.floor,
        isOccupied: false,
        occupiedBy: null,
      };
    });
  }

  async getPolikliniks(): Promise<
    { id: string; code: string; name: string; location?: string | null }[]
  > {
    const units = await this.db.query.clinicUnits.findMany({
      where: eq(clinicUnits.isActive, true),
      orderBy: [asc(clinicUnits.name)],
    });

    return units.map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      location: u.location || null,
    }));
  }

  async getScheduleOptions(): Promise<ScheduleOptionsReferenceEntity> {
    return {
      shifts: [
        {
          id: 'PAGI',
          label: 'Pagi',
          shift: 'morning',
          startTime: '07:00',
          endTime: '12:00',
        },
        {
          id: 'SIANG',
          label: 'Siang',
          shift: 'afternoon',
          startTime: '12:00',
          endTime: '17:00',
        },
        {
          id: 'MALAM',
          label: 'Malam',
          shift: 'night',
          startTime: '17:00',
          endTime: '21:00',
        },
      ],
      statuses: [
        { id: 'OPEN', label: 'Buka' },
        { id: 'CLOSED', label: 'Tutup' },
      ],
      timeSlotIntervals: [DEFAULT_CONSULTATION_DURATION_MINUTES],
      effectiveConsultationDurationMinutes:
        DEFAULT_CONSULTATION_DURATION_MINUTES,
      durationSource: 'PRACTITIONER_CONFIG',
      durationScope: 'practitioner-specific',
      canonicalIntervalStatuses: [
        { id: 'OPEN', label: 'Buka' },
        { id: 'OCCUPIED', label: 'Terisi' },
        { id: 'CLOSED', label: 'Tutup' },
      ],
    };
  }

  async getScheduleContexts(
    staffId: string,
    date: string,
    durationEditableByCurrentUser: boolean,
  ): Promise<ScheduleContextEntity[]> {
    const practitioner = await this.resolvePractitioner(staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${staffId} tidak ditemukan`,
      );
    }

    const policy = this.getPolicy(practitioner);
    return SCHEDULE_CONTEXT_DEFINITIONS.map((context) =>
      this.toScheduleContextEntity(
        practitioner.id,
        date,
        context,
        policy,
        durationEditableByCurrentUser,
      ),
    );
  }

  async projectAvailability(
    staffId: string,
    query: ScheduleProjectionQueryDto,
    durationEditableByCurrentUser: boolean,
  ): Promise<ScheduleProjectionEntity> {
    const practitioner = await this.resolvePractitioner(staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${staffId} tidak ditemukan`,
      );
    }

    const context = this.resolveScheduleContext(query.scheduleContextId);
    const policy = this.getPolicy(practitioner);
    this.validateProjectionRequest(context, query.startTime, policy);

    const fillShift =
      query.fillShift !== undefined
        ? query.fillShift
        : !query.endTime && !query.slotsCount;

    const timing = this.calculateSessionTimeAndCapacity(
      context,
      query.startTime,
      policy,
      {
        endTime: query.endTime,
        slotsCount: query.slotsCount,
        fillShift,
      },
    );

    const projection = await this.buildProjection({
      practitionerId: practitioner.id,
      date: query.date,
      context,
      selectedStartTime: query.startTime,
      boundaryEndTime: timing.endTime,
      policy,
      durationEditableByCurrentUser,
    });

    projection.remainingShiftSlots = timing.remainingShiftSlots;
    return projection;
  }

  async createAvailability(
    staffId: string,
    body: CreateAvailabilityDto,
    options: {
      userId: string;
      durationEditableByCurrentUser: boolean;
    },
  ): Promise<ScheduleAvailabilityMutationResponse> {
    const practitioner = await this.resolvePractitioner(staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${staffId} tidak ditemukan`,
      );
    }

    const context = this.resolveScheduleContext(body.scheduleContextId);
    const policy = this.getPolicy(practitioner);

    // Default: 1 session of doctor's duration (e.g. 02:00 -> 02:30, or 06:00 -> 06:30)
    // unless body.endTime, body.slotsCount, or body.fillShift is explicitly provided.
    const timing = this.calculateSessionTimeAndCapacity(
      context,
      body.startTime,
      policy,
      {
        endTime: body.endTime,
        slotsCount: body.slotsCount,
        fillShift: body.fillShift === true,
      },
    );

    const preview = await this.projectAvailability(
      practitioner.id,
      {
        date: body.date,
        scheduleContextId: body.scheduleContextId,
        startTime: body.startTime,
        endTime: timing.endTime,
        slotsCount: timing.capacity,
        fillShift: false,
        roomId: body.roomId,
        serviceId: body.serviceId,
      },
      options.durationEditableByCurrentUser,
    );

    if (
      preview.intervals.some((interval) => interval.closedReason === 'LEAVE')
    ) {
      throw new ConflictException({
        code: 'DATE_CLOSED',
        message:
          'Availability tidak dapat dibuat karena tanggal ini ditutup untuk cuti.',
        metadata: {
          date: body.date,
          closedReason: 'LEAVE',
        },
      });
    }

    const roomId = await this.resolveRoomId(body.roomId, body.poliklinikId);

    await this.checkScheduleConflicts(
      practitioner.id,
      body.date,
      body.startTime,
      timing.endTime,
      roomId,
    );

    const daySetting =
      await this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitioner.id),
          eq(practitionerScheduleDaySettings.scheduleDate, body.date),
        ),
      });

    const [record] = await this.db
      .insert(practitionerScheduleSessions)
      .values({
        practitionerId: practitioner.id,
        daySettingId: daySetting?.id || null,
        roomId,
        serviceId: body.serviceId || null,
        scheduleDate: body.date,
        sessionLabel: context.contextLabel,
        sessionShift: context.sessionShift,
        startTime: `${body.startTime}:00`,
        endTime: `${timing.endTime}:00`,
        capacity: timing.capacity,
        availableSlots: preview.intervals.filter(
          (interval) => interval.status === 'OPEN',
        ).length,
        status: SchedulePersistenceStatus.OPEN,
        notes: body.notes || null,
      })
      .returning();

    const schedule = (await this.findById(record.id)) as ScheduleEntity;
    const projection = await this.buildProjectionForSession(
      record.id,
      options.durationEditableByCurrentUser,
    );
    projection.remainingShiftSlots = timing.remainingShiftSlots;

    return {
      schedule,
      projection,
    };
  }

  async updatePractitionerSchedulePolicy(
    id: string,
    body: UpdatePractitionerSchedulePolicyDto,
  ): Promise<ScheduleContextEntity[]> {
    const practitioner = await this.resolvePractitioner(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }

    const [updated] = await this.db
      .update(practitioners)
      .set({
        consultationDurationMinutes: body.consultationDurationMinutes,
        startPrecisionMinutes:
          body.startPrecisionMinutes ?? practitioner.startPrecisionMinutes ?? 1,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(practitioners.id, practitioner.id))
      .returning();

    return this.getScheduleContexts(
      updated.id,
      new Date().toISOString().slice(0, 10),
      true,
    );
  }

  private async resolveRoomId(
    roomId?: string | null,
    poliklinikId?: string | null,
  ): Promise<string | null> {
    if (roomId) {
      return roomId;
    }
    if (!poliklinikId) {
      return null;
    }

    const room = await this.db.query.clinicRooms.findFirst({
      where: eq(clinicRooms.unitId, poliklinikId),
    });
    return room?.id ?? null;
  }

  private async buildProjectionForSession(
    sessionId: string,
    durationEditableByCurrentUser: boolean,
  ): Promise<ScheduleProjectionEntity> {
    const session = await this.db.query.practitionerScheduleSessions.findFirst({
      where: eq(practitionerScheduleSessions.id, sessionId),
      with: {
        practitioner: true,
      },
    });

    if (!session?.practitioner) {
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan`,
      );
    }

    const context =
      SCHEDULE_CONTEXT_DEFINITIONS.find(
        (definition) => definition.sessionShift === session.sessionShift,
      ) ?? SCHEDULE_CONTEXT_DEFINITIONS[1];
    const policy = this.getPolicy(session.practitioner);
    const closedReason = isClosedScheduleStatus(session.status)
      ? this.toClosedReason()
      : undefined;

    return this.buildProjection({
      practitionerId: session.practitionerId,
      scheduleId: session.id,
      date: session.scheduleDate,
      context,
      selectedStartTime: session.startTime.slice(0, 5),
      boundaryEndTime: session.endTime.slice(0, 5),
      policy,
      durationEditableByCurrentUser,
      closedReason,
      updatedAt: session.updatedAt,
    });
  }

  private async buildProjection(params: {
    practitionerId: string;
    scheduleId?: string;
    date: string;
    context: ScheduleContextDefinition;
    selectedStartTime: string;
    boundaryEndTime: string;
    policy: { durationMinutes: number; startPrecisionMinutes: number };
    durationEditableByCurrentUser: boolean;
    closedReason?: ScheduleClosedReason;
    updatedAt?: string | null;
  }): Promise<ScheduleProjectionEntity> {
    const dayClosedReason =
      params.closedReason ??
      (await this.getDayClosedReason(params.practitionerId, params.date));
    const appointments = await this.getAppointmentOccupations({
      practitionerId: params.practitionerId,
      date: params.date,
      sessionId: params.scheduleId,
    });
    const projected = projectScheduleIntervals({
      scheduleId: params.scheduleId,
      selectedStartTime: params.selectedStartTime,
      boundaryEndTime: params.boundaryEndTime,
      durationMinutes: params.policy.durationMinutes,
      appointments,
      closedReason: dayClosedReason,
    });

    return {
      scheduleId: params.scheduleId,
      practitionerId: params.practitionerId,
      date: params.date,
      scheduleContextId: params.context.contextId,
      contextLabel: params.context.contextLabel,
      selectedStartTime: params.selectedStartTime,
      boundaryStartTime: params.context.boundaryStartTime,
      boundaryEndTime: params.boundaryEndTime,
      shiftBoundary: {
        startTime: params.context.boundaryStartTime,
        endTime: params.boundaryEndTime,
      },
      projectedEndTime: projected.projectedEndTime,
      effectiveConsultationDurationMinutes: params.policy.durationMinutes,
      durationSource: 'PRACTITIONER_CONFIG',
      durationScope: 'practitioner-specific',
      durationEditableByCurrentUser: params.durationEditableByCurrentUser,
      allowedStartPrecisionMinutes: params.policy.startPrecisionMinutes,
      timezone: CLINIC_TIMEZONE,
      capacity: projected.capacity,
      remainingShiftSlots: Math.max(
        0,
        Math.floor(
          (parseClockTime(params.context.boundaryEndTime) -
            parseClockTime(projected.projectedEndTime)) /
            params.policy.durationMinutes,
        ),
      ),
      intervals: projected.intervals,
      version: params.updatedAt
        ? generateEntityVersion(params.updatedAt)
        : undefined,
      updatedAt: params.updatedAt ?? null,
    };
  }

  private async getDayClosedReason(
    practitionerId: string,
    date: string,
  ): Promise<ScheduleClosedReason | undefined> {
    const daySetting =
      await this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          eq(practitionerScheduleDaySettings.scheduleDate, date),
        ),
      });
    if (daySetting?.isLeave) {
      return 'LEAVE';
    }

    const activeLeave = await this.db.query.practitionerLeavePeriods.findFirst({
      where: and(
        eq(practitionerLeavePeriods.practitionerId, practitionerId),
        lte(practitionerLeavePeriods.startDate, date),
        gte(practitionerLeavePeriods.endDate, date),
      ),
    });

    return activeLeave ? 'LEAVE' : undefined;
  }

  private toClosedReason(): ScheduleClosedReason {
    return 'SCHEDULE_CLOSED';
  }

  private async getAppointmentOccupations(params: {
    practitionerId: string;
    date: string;
    sessionId?: string;
  }): Promise<AppointmentOccupation[]> {
    const conditions = [
      eq(appointments.practitionerId, params.practitionerId),
      eq(appointments.scheduledDate, params.date),
      inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
    ];

    if (params.sessionId) {
      conditions.push(eq(appointments.scheduleSessionId, params.sessionId));
    }

    const records = await this.db.query.appointments.findMany({
      where: and(...conditions),
      with: {
        queueTickets: true,
      },
    });

    return records.map((appointment) => ({
      appointmentId: appointment.id,
      startTime: appointment.scheduledStartTime.slice(0, 5),
      endTime: appointment.scheduledEndTime?.slice(0, 5) ?? null,
      queueNumber: appointment.queueTickets?.[0]?.queueNumber ?? null,
      status: appointment.status,
    }));
  }

  async getOccupancyOverview(
    staffId: string,
    query: ScheduleOccupancyQueryDto,
  ): Promise<ScheduleOccupancyOverviewData> {
    const practitioner = await this.resolvePractitioner(staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${staffId} tidak ditemukan`,
      );
    }

    const practitionerId = practitioner.id;
    const practitionerName =
      practitioner.staffProfile?.fullName ||
      practitioner.displayName ||
      'Dokter';
    const policy = this.getPolicy(practitioner);
    const durationMinutes = policy.durationMinutes;

    // 1. Check if doctor is on leave on target date
    const daySetting =
      await this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          eq(practitionerScheduleDaySettings.scheduleDate, query.date),
        ),
      });

    const activeLeave = await this.db.query.practitionerLeavePeriods.findFirst({
      where: and(
        eq(practitionerLeavePeriods.practitionerId, practitionerId),
        lte(practitionerLeavePeriods.startDate, query.date),
        gte(practitionerLeavePeriods.endDate, query.date),
      ),
    });

    const isCuti = Boolean(daySetting?.isLeave || activeLeave);
    const cutiReason = isCuti
      ? daySetting?.leaveReason || activeLeave?.reason || 'Cuti'
      : null;

    // 2. Resolve room name if roomId provided
    let targetRoomName: string | null = null;
    if (query.roomId) {
      const room = await this.db.query.clinicRooms.findFirst({
        where: eq(clinicRooms.id, query.roomId),
      });
      targetRoomName = room?.name || 'Ruangan';
    }

    // 3. Fetch active sessions on target date (indexed lookup by scheduleDate)
    const activeSessions =
      await this.db.query.practitionerScheduleSessions.findMany({
        where: eq(practitionerScheduleSessions.scheduleDate, query.date),
        with: {
          practitioner: {
            with: {
              staffProfile: true,
            },
          },
          clinicRoom: true,
        },
      });

    // 4. Construct the 4 shifts and their slots
    const shifts: ScheduleShiftOccupancyEntity[] = [];

    for (const ctxDef of SCHEDULE_CONTEXT_DEFINITIONS) {
      const boundaryStartMinutes = parseClockTime(ctxDef.boundaryStartTime);
      const boundaryEndMinutes = parseClockTime(ctxDef.boundaryEndTime);
      const totalShiftMinutes = boundaryEndMinutes - boundaryStartMinutes;
      const totalSlots = Math.max(
        0,
        Math.floor(totalShiftMinutes / durationMinutes),
      );

      const slots: ScheduleShiftSlotEntity[] = [];

      for (let i = 0; i < totalSlots; i++) {
        const slotStartMin = boundaryStartMinutes + i * durationMinutes;
        const slotEndMin = slotStartMin + durationMinutes;
        const startTimeStr = formatClockTime(slotStartMin);
        const endTimeStr = formatClockTime(slotEndMin);
        const timeRangeStr = `${startTimeStr} - ${endTimeStr} WIB`;

        let isAvailable = true;
        let status: ScheduleSlotStatus = 'AVAILABLE';
        let displayLabel = 'Tersedia';
        let conflictInfo: ScheduleSlotConflictInfoEntity | null = null;

        if (isCuti) {
          isAvailable = false;
          status = 'CLOSED_LEAVE';
          displayLabel = 'Cuti';
          conflictInfo = {
            type: 'LEAVE',
            message: cutiReason || 'Dokter tercatat sedang cuti',
            practitionerId,
            practitionerName,
          };
        } else {
          // Check if target doctor has a session overlapping this slot
          const selfSession = activeSessions.find((s) => {
            if (s.practitionerId !== practitionerId) return false;
            const sessStart = parseClockTime(s.startTime.slice(0, 5));
            const sessEnd = parseClockTime(s.endTime.slice(0, 5));
            return sessStart < slotEndMin && sessEnd > slotStartMin;
          });

          if (selfSession) {
            isAvailable = false;
            status = 'OCCUPIED_BY_SELF';
            const roomLabel = selfSession.clinicRoom?.name
              ? ` (${selfSession.clinicRoom.name})`
              : '';
            displayLabel = `Jadwal Anda${roomLabel}`;
            conflictInfo = {
              type: 'SELF',
              message: 'Anda sudah memiliki jadwal di jam ini',
              sessionId: selfSession.id,
              practitionerId,
              practitionerName,
              roomId: selfSession.roomId,
              roomName: selfSession.clinicRoom?.name || null,
            };
          } else if (query.roomId) {
            // Check if another doctor is occupying this room
            const otherSession = activeSessions.find((s) => {
              if (s.roomId !== query.roomId) return false;
              if (s.practitionerId === practitionerId) return false;
              const sessStart = parseClockTime(s.startTime.slice(0, 5));
              const sessEnd = parseClockTime(s.endTime.slice(0, 5));
              return sessStart < slotEndMin && sessEnd > slotStartMin;
            });

            if (otherSession) {
              isAvailable = false;
              status = 'OCCUPIED_BY_OTHER';
              const otherDoctorName =
                otherSession.practitioner?.staffProfile?.fullName ||
                otherSession.practitioner?.displayName ||
                'Dokter lain';
              const roomName =
                otherSession.clinicRoom?.name || targetRoomName || 'Ruangan';
              displayLabel = `Terisi (${otherDoctorName} - ${roomName})`;
              conflictInfo = {
                type: 'OTHER',
                message: `Ruangan telah digunakan oleh ${otherDoctorName}`,
                sessionId: otherSession.id,
                practitionerId: otherSession.practitionerId,
                practitionerName: otherDoctorName,
                roomId: otherSession.roomId,
                roomName,
              };
            }
          }
        }

        slots.push({
          slotIndex: i + 1,
          startTime: startTimeStr,
          endTime: endTimeStr,
          timeRange: timeRangeStr,
          isAvailable,
          status,
          displayLabel,
          conflictInfo,
        });
      }

      const availableSlotsCount = slots.filter((s) => s.isAvailable).length;
      const occupiedSlotsCount = totalSlots - availableSlotsCount;

      shifts.push({
        contextId: ctxDef.contextId,
        contextLabel: ctxDef.contextLabel,
        sessionShift: ctxDef.sessionShift,
        timeRange: `${ctxDef.boundaryStartTime} - ${ctxDef.boundaryEndTime} WIB`,
        boundaryStartTime: ctxDef.boundaryStartTime,
        boundaryEndTime: ctxDef.boundaryEndTime,
        totalSlots,
        availableSlotsCount,
        occupiedSlotsCount,
        slots,
      });
    }

    const totalSlots = shifts.reduce((acc, s) => acc + s.totalSlots, 0);
    const availableSlots = shifts.reduce(
      (acc, s) => acc + s.availableSlotsCount,
      0,
    );
    const occupiedSlots = totalSlots - availableSlots;

    return {
      date: query.date,
      practitionerId,
      practitionerName,
      effectiveConsultationDurationMinutes: durationMinutes,
      roomId: query.roomId || null,
      roomName: targetRoomName,
      isCuti,
      cutiReason,
      summary: {
        totalShifts: shifts.length,
        totalSlots,
        availableSlots,
        occupiedSlots,
      },
      shifts,
    };
  }

  // ==========================================
  // Admin & Clinical Domain Methods (BE-SCHED-001)
  // ==========================================

  private formatIndoDate(dateStr: string): string {
    const INDO_DAYS = [
      'Minggu',
      'Senin',
      'Selasa',
      'Rabu',
      'Kamis',
      'Jumat',
      'Sabtu',
    ];
    const INDO_MONTHS_SHORT = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Mei',
      'Jun',
      'Jul',
      'Agu',
      'Sep',
      'Okt',
      'Nov',
      'Des',
    ];
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dayName = INDO_DAYS[dt.getUTCDay()];
    const monthName = INDO_MONTHS_SHORT[m - 1] || '';
    return `${dayName}, ${d} ${monthName} ${y}`;
  }

  private formatIndoMonthYear(year: number, month1Indexed: number): string {
    const INDO_MONTHS = [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember',
    ];
    const mName = INDO_MONTHS[month1Indexed - 1] || '';
    return `${mName} ${year}`;
  }

  private toAdminSessionStatus(
    isClosedForLeave: boolean,
    availableSlots: number,
    persistedStatus: string,
  ): ScheduleOperationalStatus {
    return resolveSessionOperationalStatus({
      isClosedForLeave,
      availableSlots,
      persistedStatus,
    });
  }

  private toAdminAggregateStatus(params: {
    isClosedForLeave: boolean;
    sessionStatuses: ScheduleOperationalStatus[];
  }): ScheduleOperationalStatus {
    return resolveAggregateOperationalStatus(params);
  }

  private computeUpcomingSchedule(
    targetDate: string,
    todayStr: string,
    sesiHarian: AdminDoctorDailySession[],
    isCuti: boolean,
  ): string {
    if (isCuti) return 'Cuti Dokter';
    if (!sesiHarian || sesiHarian.length === 0) return 'Tidak Ada Jadwal';
    const anyOpen = sesiHarian.some(
      (s) => s.status_sesi !== ScheduleOperationalStatus.CLOSED,
    );
    if (!anyOpen) return 'Praktik Ditutup';

    if (targetDate > todayStr) {
      const first = sesiHarian[0];
      return `${first.nama_sesi} (${first.waktu})`;
    }

    if (targetDate < todayStr) {
      const last = sesiHarian[sesiHarian.length - 1];
      return `${last.nama_sesi} (${last.waktu}) - Selesai`;
    }

    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = currentHours * 60 + now.getMinutes();

    const toMinutes = (timeStr: string) => {
      const [h, m] = (timeStr || '00:00').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };

    const activeSession = sesiHarian.find((s) => {
      const startM = toMinutes(s.jam_mulai);
      const endM = toMinutes(s.jam_selesai);
      return (
        s.status_sesi !== ScheduleOperationalStatus.CLOSED &&
        startM <= currentMinutes &&
        currentMinutes <= endM
      );
    });
    if (activeSession) {
      return `${activeSession.nama_sesi} (${activeSession.waktu}) - Sedang Berlangsung`;
    }

    const upcomingSessions = sesiHarian
      .filter(
        (s) =>
          s.status_sesi !== ScheduleOperationalStatus.CLOSED &&
          toMinutes(s.jam_mulai) > currentMinutes,
      )
      .sort((a, b) => toMinutes(a.jam_mulai) - toMinutes(b.jam_mulai));

    if (upcomingSessions.length > 0) {
      const next = upcomingSessions[0];
      return `${next.nama_sesi} (${next.waktu})`;
    }

    const lastSession = sesiHarian[sesiHarian.length - 1];
    return `${lastSession.nama_sesi} (${lastSession.waktu}) - Selesai`;
  }

  async findAdminDoctorSchedules(
    query: AdminDoctorSchedulesQueryDto,
  ): Promise<AdminDoctorScheduleListResponse> {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    let targetDate = todayStr;

    if (query.date) {
      targetDate = query.date;
    } else if (query.month) {
      if (todayStr.startsWith(query.month)) {
        targetDate = todayStr;
      } else {
        targetDate = `${query.month}-01`;
      }
    }

    const [targetYear, targetMonth] = targetDate.split('-').map(Number);

    const [pracs, allDaySettings, allActiveLeaves, allSessions] =
      await Promise.all([
        this.db.query.practitioners.findMany({
          with: {
            staffProfile: {
              with: {
                clinicUnit: true,
              },
            },
            medicalSpecialty: true,
            clinicRoom: true,
          },
          orderBy: [asc(practitioners.displayName)],
        }),
        this.db.query.practitionerScheduleDaySettings.findMany({
          where: eq(practitionerScheduleDaySettings.scheduleDate, targetDate),
        }),
        this.db.query.practitionerLeavePeriods.findMany({
          where: and(
            lte(practitionerLeavePeriods.startDate, targetDate),
            gte(practitionerLeavePeriods.endDate, targetDate),
          ),
        }),
        this.db.query.practitionerScheduleSessions.findMany({
          where: eq(practitionerScheduleSessions.scheduleDate, targetDate),
          with: {
            clinicRoom: true,
          },
          orderBy: [asc(practitionerScheduleSessions.startTime)],
        }),
      ]);

    const cards: AdminDoctorScheduleCardEntity[] = [];

    for (const p of pracs) {
      const daySetting = allDaySettings.find(
        (ds) => ds.practitionerId === p.id,
      );
      const activeLeave = allActiveLeaves.find(
        (al) => al.practitionerId === p.id,
      );
      const sessions = allSessions.filter((s) => s.practitionerId === p.id);

      const isCuti = Boolean(daySetting?.isLeave || activeLeave);
      const cutiReason = isCuti
        ? daySetting?.leaveReason || activeLeave?.reason || 'Cuti Dokter'
        : null;
      const cutiStart = activeLeave?.startDate || (isCuti ? targetDate : null);
      const cutiEnd = activeLeave?.endDate || (isCuti ? targetDate : null);

      const defaultRoomName = p.clinicRoom
        ? `${p.clinicRoom.name}${p.clinicRoom.location ? `, ${p.clinicRoom.location}` : ''}`
        : 'Belum Ditentukan';

      const sesiHarian: AdminDoctorDailySession[] = sessions.map((s) => {
        const shift = s.sessionShift;
        const sessionLabel =
          s.sessionLabel ||
          (shift === 'afternoon'
            ? 'Sesi Sore'
            : shift === 'night'
              ? 'Sesi Malam'
              : shift === 'early_morning'
                ? 'Shift Dini Hari'
                : 'Sesi Pagi');
        const jamMulai = s.startTime ? s.startTime.slice(0, 5) : '08:00';
        const jamSelesai = s.endTime ? s.endTime.slice(0, 5) : '12:00';
        const capacity = s.capacity ?? 8;
        const availableSlots = isCuti ? 0 : (s.availableSlots ?? capacity);
        const roomName = s.clinicRoom
          ? `${s.clinicRoom.name}${s.clinicRoom.location ? `, ${s.clinicRoom.location}` : ''}`
          : defaultRoomName;

        const sessionOpStatus = this.toAdminSessionStatus(
          isCuti,
          availableSlots,
          s.status,
        );
        const statusSesi = sessionOpStatus;

        const isRescheduleEligible =
          !isCuti && sessionOpStatus !== ScheduleOperationalStatus.CLOSED;
        const rescheduleIneligibilityReason =
          isCuti
            ? 'Sesi tidak dapat di-reschedule karena dokter sedang cuti.'
            : sessionOpStatus === ScheduleOperationalStatus.CLOSED
              ? 'Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi.'
              : null;

        return {
          id: s.id,
          nama_sesi: sessionLabel,
          jam_mulai: jamMulai,
          jam_selesai: jamSelesai,
          waktu: `${jamMulai} - ${jamSelesai}`,
          kuota_pasien: capacity,
          slot_tersedia: availableSlots,
          status_sesi: statusSesi,
          ruang: roomName,
          is_reschedule_eligible: isRescheduleEligible,
          reschedule_ineligibility_reason: rescheduleIneligibilityReason,
        };
      });

      const sessionOpStatuses = sessions.map((s) => {
        const capacity = s.capacity ?? 8;
        const availableSlots = isCuti ? 0 : (s.availableSlots ?? capacity);
        return this.toAdminSessionStatus(isCuti, availableSlots, s.status);
      });

      const totalCapacity =
        sesiHarian.length > 0
          ? sesiHarian.reduce((acc, s) => acc + s.kuota_pasien, 0)
          : (daySetting?.targetQuota ?? 0);
      const totalAvailable = isCuti
        ? 0
        : sesiHarian.reduce((acc, s) => acc + s.slot_tersedia, 0);

      const aggregateOpStatus = this.toAdminAggregateStatus({
        isClosedForLeave: isCuti,
        sessionStatuses: sessionOpStatuses,
      });

      const isClosed = aggregateOpStatus === ScheduleOperationalStatus.CLOSED;
      const scheduleStatus = aggregateOpStatus;

      let slotTerisiAkumulasi = 0;
      let slotKapasitasAkumulasi = 0;
      let displayAkumulasiSlot = '-';
      let jadwalHariIni = '-';
      let jadwalPraktikMendatang = 'Tidak Ada Jadwal';

      if (isCuti) {
        jadwalPraktikMendatang = 'Cuti Dokter';
      } else if (isClosed) {
        jadwalPraktikMendatang =
          sesiHarian.length === 0 ? 'Tidak Ada Jadwal' : 'Praktik Ditutup';
      } else {
        slotTerisiAkumulasi = Math.max(0, totalCapacity - totalAvailable);
        slotKapasitasAkumulasi = totalCapacity;
        displayAkumulasiSlot = `${slotTerisiAkumulasi} / ${slotKapasitasAkumulasi}`;
        jadwalPraktikMendatang = this.computeUpcomingSchedule(
          targetDate,
          todayStr,
          sesiHarian,
          isCuti,
        );
        if (sesiHarian.length > 0) {
          const starts = sesiHarian.map((s) => s.jam_mulai).sort();
          const ends = sesiHarian.map((s) => s.jam_selesai).sort();
          jadwalHariIni = `${starts[0]} - ${ends[ends.length - 1]}`;
        }
      }

      const ruangPraktik =
        sesiHarian.length > 0 ? sesiHarian[0].ruang : defaultRoomName;
      const spesialisasi =
        p.medicalSpecialty?.name ||
        p.staffProfile?.clinicUnit?.name ||
        'Dokter Umum';
      const namaDokter =
        p.staffProfile?.fullName || p.displayName || 'Dokter Amanah';

      // Filters
      if (query.search) {
        const q = query.search.toLowerCase();
        const matchSearch =
          namaDokter.toLowerCase().includes(q) ||
          spesialisasi.toLowerCase().includes(q) ||
          ruangPraktik.toLowerCase().includes(q);
        if (!matchSearch) continue;
      }

      if (query.poli) {
        const poliFilter = query.poli.toLowerCase();
        const matchPoli =
          spesialisasi.toLowerCase().includes(poliFilter) ||
          (p.staffProfile?.clinicUnit?.name || '')
            .toLowerCase()
            .includes(poliFilter);
        if (!matchPoli) continue;
      }

      if (query.status) {
        const statusList = query.status
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const invalidStatuses = statusList.filter(
          (status) =>
            !Object.values(ScheduleOperationalStatus).includes(
              status as ScheduleOperationalStatus,
            ),
        );
        if (invalidStatuses.length > 0) {
          throw new BadRequestException({
            code: 'INVALID_SCHEDULE_STATUS_FILTER',
            message:
              'Status filter must use canonical values: OPEN, OCCUPIED, CLOSED.',
            metadata: { invalidStatuses },
          });
        }
        if (!statusList.includes(scheduleStatus)) continue;
      }

      cards.push({
        id: p.id,
        practitioner_id: p.id,
        nama_dokter: namaDokter,
        spesialisasi,
        status_dokter: scheduleStatus,
        email: p.staffProfile?.email || null,
        nomor_telepon: p.staffProfile?.phone || null,
        ruang_praktik: ruangPraktik,
        tanggal_praktik: this.formatIndoDate(targetDate),
        avatar: this.toAvatarUrl(p.staffProfile),
        slot_tersedia: isClosed ? 0 : totalAvailable,
        kapasitas_per_hari: isClosed ? 0 : totalCapacity,
        jadwal_hari_ini: jadwalHariIni,
        jadwal_praktik_mendatang: jadwalPraktikMendatang,
        slot_terisi_akumulasi: slotTerisiAkumulasi,
        slot_kapasitas_akumulasi: slotKapasitasAkumulasi,
        display_akumulasi_slot: displayAkumulasiSlot,
        status_jadwal: scheduleStatus,
        bulan_jadwal: this.formatIndoMonthYear(targetYear, targetMonth),
        is_cuti: isCuti,
        cuti_reason: cutiReason,
        cuti_start: cutiStart,
        cuti_end: cutiEnd,
        sesi_harian: sesiHarian,
      });
    }

    const page = query.page || 1;
    const limit = query.limit || 6;
    const totalDoctors = cards.length;
    const totalPages = Math.ceil(totalDoctors / limit) || 1;
    const paginated = cards.slice((page - 1) * limit, page * limit);

    return {
      success: true,
      data: {
        doctors: paginated,
        meta: {
          page,
          limit,
          total_doctors: totalDoctors,
          total_pages: totalPages,
        },
      },
    };
  }

  async findAdminDoctorScheduleDetail(
    id: string,
    query: AdminDoctorScheduleDetailQueryDto,
  ): Promise<AdminDoctorScheduleDetailResponse> {
    const practitioner = await this.resolvePractitioner(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }

    const prac = await this.db.query.practitioners.findFirst({
      where: eq(practitioners.id, practitioner.id),
      with: {
        staffProfile: {
          with: {
            clinicUnit: true,
          },
        },
        medicalSpecialty: true,
        clinicRoom: true,
      },
    });

    if (!prac) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }

    const now = new Date();
    let targetYear = now.getFullYear();
    let targetMonth = now.getMonth() + 1; // 1-12

    if (query.date?.includes('-')) {
      const parts = query.date.split('-').map(Number);
      if (
        parts.length >= 2 &&
        !Number.isNaN(parts[0]) &&
        !Number.isNaN(parts[1])
      ) {
        targetYear = parts[0];
        targetMonth = parts[1];
      }
    }

    if (query.year) {
      targetYear = query.year;
    }
    if (query.month) {
      if (query.month.includes('-')) {
        const [y, m] = query.month.split('-').map(Number);
        targetYear = y;
        targetMonth = m;
      } else {
        const mNum = parseInt(query.month, 10);
        if (!Number.isNaN(mNum) && mNum >= 1 && mNum <= 12) {
          targetMonth = mNum;
        }
      }
    }

    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const [monthSettings, monthLeaves, monthSessions] = await Promise.all([
      this.db.query.practitionerScheduleDaySettings.findMany({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, prac.id),
          gte(practitionerScheduleDaySettings.scheduleDate, startDate),
          lte(practitionerScheduleDaySettings.scheduleDate, endDate),
        ),
      }),
      this.db.query.practitionerLeavePeriods.findMany({
        where: and(
          eq(practitionerLeavePeriods.practitionerId, prac.id),
          lte(practitionerLeavePeriods.startDate, endDate),
          gte(practitionerLeavePeriods.endDate, startDate),
        ),
      }),
      this.db.query.practitionerScheduleSessions.findMany({
        where: and(
          eq(practitionerScheduleSessions.practitionerId, prac.id),
          gte(practitionerScheduleSessions.scheduleDate, startDate),
          lte(practitionerScheduleSessions.scheduleDate, endDate),
        ),
        with: {
          clinicRoom: true,
        },
        orderBy: [asc(practitionerScheduleSessions.startTime)],
      }),
    ]);

    const monthlySchedule: AdminDoctorMonthlyDayEntity[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const daySetting = monthSettings.find((s) => s.scheduleDate === dateStr);
      const leave = monthLeaves.find(
        (l) => l.startDate <= dateStr && l.endDate >= dateStr,
      );
      const daySessions = monthSessions.filter(
        (s) => s.scheduleDate === dateStr,
      );

      const isCuti = Boolean(daySetting?.isLeave || leave);
      let dayNotes: string | null = null;

      const daySessionStatuses = daySessions.map((s) =>
        this.toAdminSessionStatus(
          isCuti,
          isCuti ? 0 : (s.availableSlots ?? s.capacity ?? 8),
          s.status,
        ),
      );

      const dayOpStatus = this.toAdminAggregateStatus({
        isClosedForLeave: isCuti,
        sessionStatuses: daySessionStatuses,
      });

      if (isCuti) {
        dayNotes = daySetting?.leaveReason || leave?.reason || 'Cuti Dokter';
      } else if (daySessions.length === 0) {
        dayNotes = null;
      } else if (dayOpStatus === ScheduleOperationalStatus.CLOSED) {
        dayNotes = daySetting?.leaveReason || 'Jadwal ditutup oleh admin';
      } else if (dayOpStatus === ScheduleOperationalStatus.OCCUPIED) {
        dayNotes = 'Interval terisi oleh pasien reservasi';
      }

      monthlySchedule.push({
        day: d,
        date: dateStr,
        status: dayOpStatus,
        notes: dayNotes,
      });
    }

    const todayStr = now.toISOString().slice(0, 10);
    const evalDate =
      query.date ||
      (todayStr.startsWith(
        `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
      )
        ? todayStr
        : startDate);

    const evalDaySetting = monthSettings.find(
      (s) => s.scheduleDate === evalDate,
    );
    const evalLeave = monthLeaves.find(
      (l) => l.startDate <= evalDate && l.endDate >= evalDate,
    );
    const evalSessions = monthSessions.filter(
      (s) => s.scheduleDate === evalDate,
    );

    const isEvalCuti = Boolean(evalDaySetting?.isLeave || evalLeave);
    const evalCutiReason = isEvalCuti
      ? evalDaySetting?.leaveReason || evalLeave?.reason || 'Cuti Dokter'
      : null;
    const evalCutiStart =
      evalLeave?.startDate || (isEvalCuti ? evalDate : null);
    const evalCutiEnd = evalLeave?.endDate || (isEvalCuti ? evalDate : null);

    const defaultRoomName = prac.clinicRoom
      ? `${prac.clinicRoom.name}${prac.clinicRoom.location ? `, ${prac.clinicRoom.location}` : ''}`
      : 'Belum Ditentukan';

    const evalSessionOpStatuses = evalSessions.map((s) => {
      const capacity = s.capacity ?? 8;
      const availableSlots = isEvalCuti ? 0 : (s.availableSlots ?? capacity);
      return this.toAdminSessionStatus(isEvalCuti, availableSlots, s.status);
    });

    const sesiHarian: AdminDoctorDailySession[] = evalSessions.map((s, idx) => {
      const shift = s.sessionShift;
      const sessionLabel =
        s.sessionLabel ||
        (shift === 'afternoon'
          ? 'Sesi Sore'
          : shift === 'night'
            ? 'Sesi Malam'
            : shift === 'early_morning'
              ? 'Shift Dini Hari'
              : 'Sesi Pagi');
      const jamMulai = s.startTime ? s.startTime.slice(0, 5) : '08:00';
      const jamSelesai = s.endTime ? s.endTime.slice(0, 5) : '12:00';
      const capacity = s.capacity ?? 8;
      const availableSlots = isEvalCuti ? 0 : (s.availableSlots ?? capacity);
      const roomName = s.clinicRoom
        ? `${s.clinicRoom.name}${s.clinicRoom.location ? `, ${s.clinicRoom.location}` : ''}`
        : defaultRoomName;

      const sessionOpStatus = evalSessionOpStatuses[idx];
      const statusSesi = sessionOpStatus;

      const isRescheduleEligible =
        !isEvalCuti && sessionOpStatus !== ScheduleOperationalStatus.CLOSED;
      const rescheduleIneligibilityReason =
        isEvalCuti
          ? 'Sesi tidak dapat di-reschedule karena dokter sedang cuti.'
          : sessionOpStatus === ScheduleOperationalStatus.CLOSED
            ? 'Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi.'
            : null;

      return {
        id: s.id,
        nama_sesi: sessionLabel,
        jam_mulai: jamMulai,
        jam_selesai: jamSelesai,
        waktu: `${jamMulai} - ${jamSelesai}`,
        kuota_pasien: capacity,
        slot_tersedia: availableSlots,
        status_sesi: statusSesi,
        ruang: roomName,
        is_reschedule_eligible: isRescheduleEligible,
        reschedule_ineligibility_reason: rescheduleIneligibilityReason,
      };
    });

    const totalCapacity =
      sesiHarian.length > 0
        ? sesiHarian.reduce((acc, s) => acc + s.kuota_pasien, 0)
        : (evalDaySetting?.targetQuota ?? 0);
    const totalAvailable = isEvalCuti
      ? 0
      : sesiHarian.reduce((acc, s) => acc + s.slot_tersedia, 0);

    const evalAggregateOpStatus = this.toAdminAggregateStatus({
      isClosedForLeave: isEvalCuti,
      sessionStatuses: evalSessionOpStatuses,
    });

    const isEvalClosed =
      evalAggregateOpStatus === ScheduleOperationalStatus.CLOSED;
    const statusDokter = evalAggregateOpStatus;

    const timelineIntervals = (
      await Promise.all(
        evalSessions.map(async (session) => {
          const projection = await this.buildProjectionForSession(
            session.id,
            true,
          );
          return projection.intervals;
        }),
      )
    )
      .flat()
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return {
      success: true,
      data: {
        id: prac.id,
        practitioner_id: prac.id,
        nama_dokter:
          prac.staffProfile?.fullName || prac.displayName || 'Dokter Amanah',
        spesialisasi:
          prac.medicalSpecialty?.name ||
          prac.staffProfile?.clinicUnit?.name ||
          'Dokter Umum',
        status_dokter: statusDokter,
        email: prac.staffProfile?.email || null,
        nomor_telepon: prac.staffProfile?.phone || null,
        ruang_praktik:
          sesiHarian.length > 0 ? sesiHarian[0].ruang : defaultRoomName,
        avatar: this.toAvatarUrl(prac.staffProfile),
        slot_tersedia: isEvalClosed ? 0 : totalAvailable,
        kapasitas_per_hari: isEvalClosed ? 0 : totalCapacity,
        bulan_jadwal: this.formatIndoMonthYear(targetYear, targetMonth),
        is_cuti: isEvalCuti,
        cuti_reason: evalCutiReason,
        cuti_start: evalCutiStart,
        cuti_end: evalCutiEnd,
        monthly_schedule: monthlySchedule,
        sesi_harian: sesiHarian,
        timeline_intervals: timelineIntervals,
      },
    };
  }

  async updateAdminDoctorSchedule(
    id: string,
    body: UpdateAdminDoctorScheduleDto,
  ): Promise<any> {
    const practitioner = await this.resolvePractitioner(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }
    const practitionerId = practitioner.id;

    const targetDate =
      body.date || body.cuti_start || new Date().toISOString().slice(0, 10);

    // 0. Ruang Praktik resolution & persistence
    if (body.ruang_praktik) {
      let resolvedRoomId: string | null = null;
      if (this.isUuid(body.ruang_praktik)) {
        const room = await this.db.query.clinicRooms.findFirst({
          where: eq(clinicRooms.id, body.ruang_praktik),
        });
        if (room) resolvedRoomId = room.id;
      } else {
        const room = await this.db.query.clinicRooms.findFirst({
          where: or(
            eq(clinicRooms.name, body.ruang_praktik),
            eq(clinicRooms.code, body.ruang_praktik),
            sql`lower(${clinicRooms.name}) LIKE lower(${`%${body.ruang_praktik.split(',')[0].trim()}%`})`,
          ),
        });
        if (room) resolvedRoomId = room.id;
      }

      if (resolvedRoomId) {
        await this.db
          .update(practitioners)
          .set({
            defaultRoomId: resolvedRoomId,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(practitioners.id, practitionerId));

        await this.db
          .update(practitionerScheduleSessions)
          .set({
            roomId: resolvedRoomId,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(practitionerScheduleSessions.practitionerId, practitionerId),
              eq(practitionerScheduleSessions.scheduleDate, targetDate),
            ),
          );
      }
    }

    // 1. Cuti override
    if (body.is_cuti !== undefined) {
      const existingSetting =
        await this.db.query.practitionerScheduleDaySettings.findFirst({
          where: and(
            eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
            eq(practitionerScheduleDaySettings.scheduleDate, targetDate),
          ),
        });

      if (existingSetting) {
        await this.db
          .update(practitionerScheduleDaySettings)
          .set({
            isLeave: body.is_cuti,
            leaveReason:
              body.cuti_reason || (body.is_cuti ? 'Cuti Dokter' : null),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(practitionerScheduleDaySettings.id, existingSetting.id));
      } else {
        await this.db.insert(practitionerScheduleDaySettings).values({
          practitionerId,
          scheduleDate: targetDate,
          targetQuota: body.kapasitas_per_hari || 8,
          isLeave: body.is_cuti,
          leaveReason:
            body.cuti_reason || (body.is_cuti ? 'Cuti Dokter' : null),
        });
      }

      if (body.is_cuti && body.cuti_start && body.cuti_end) {
        await this.db.insert(practitionerLeavePeriods).values({
          practitionerId,
          startDate: body.cuti_start,
          endDate: body.cuti_end,
          reason: body.cuti_reason || 'Cuti Operasional',
        });
      }

      // Update sessions on target date
      await this.db
        .update(practitionerScheduleSessions)
        .set({
          status: body.is_cuti
            ? SchedulePersistenceStatus.CLOSED
            : SchedulePersistenceStatus.OPEN,
          availableSlots: body.is_cuti ? 0 : sql`capacity`,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(practitionerScheduleSessions.practitionerId, practitionerId),
            eq(practitionerScheduleSessions.scheduleDate, targetDate),
          ),
        );
    }

    // 2. Schedule status override
    if (body.status_jadwal) {
      const requestedStatus = toAdminScheduleStatusRequest(
        body.status_jadwal,
      );
      if (!requestedStatus) {
        throw new BadRequestException({
          code: 'INVALID_SCHEDULE_STATUS',
          message:
            'status_jadwal must use canonical values only: OPEN or CLOSED.',
          metadata: { status_jadwal: body.status_jadwal },
        });
      }
      const sessionStatus = toDaySessionPersistenceStatus(requestedStatus);

      const updateValues: Record<string, any> = {
        status: sessionStatus,
        updatedAt: new Date().toISOString(),
      };

      if (requestedStatus === AdminScheduleStatusRequest.CLOSED) {
        updateValues.availableSlots = 0;
      } else if (body.slot_tersedia !== undefined) {
        if (body.kapasitas_per_hari !== undefined) {
          updateValues.capacity = body.kapasitas_per_hari;
          updateValues.availableSlots = Math.min(
            body.slot_tersedia,
            body.kapasitas_per_hari,
          );
        } else {
          updateValues.availableSlots = sql`LEAST(${body.slot_tersedia}, capacity)`;
        }
      } else {
        updateValues.availableSlots = sql`capacity`;
      }

      await this.db
        .update(practitionerScheduleSessions)
        .set(updateValues)
        .where(
          and(
            eq(practitionerScheduleSessions.practitionerId, practitionerId),
            eq(practitionerScheduleSessions.scheduleDate, targetDate),
          ),
        );

      await this.db
        .update(practitionerScheduleDaySettings)
        .set({
          isLeave: false,
          leaveReason: null,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
            eq(practitionerScheduleDaySettings.scheduleDate, targetDate),
          ),
        );
    }

    // 3. Quota & slots override
    if (body.kapasitas_per_hari !== undefined) {
      await this.db
        .update(practitionerScheduleDaySettings)
        .set({
          targetQuota: body.kapasitas_per_hari,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
            eq(practitionerScheduleDaySettings.scheduleDate, targetDate),
          ),
        );
    }

    return this.findAdminDoctorScheduleDetail(practitionerId, {
      date: targetDate,
    });
  }

  async updateAdminDayStatus(
    id: string,
    date: string,
    status: string,
    notes?: string,
  ): Promise<any> {
    const practitioner = await this.resolvePractitioner(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }
    const practitionerId = practitioner.id;

    const requestedStatus = toAdminScheduleStatusRequest(status);
    if (!requestedStatus) {
      throw new BadRequestException({
        code: 'INVALID_SCHEDULE_STATUS',
        message: 'status must use canonical values only: OPEN or CLOSED.',
        metadata: { status },
      });
    }
    const isClosed = requestedStatus === AdminScheduleStatusRequest.CLOSED;

    const existingSetting =
      await this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          eq(practitionerScheduleDaySettings.scheduleDate, date),
        ),
      });

    const leaveReason = isClosed ? (notes ?? null) : null;

    if (existingSetting) {
      await this.db
        .update(practitionerScheduleDaySettings)
        .set({
          isLeave: false,
          leaveReason,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(practitionerScheduleDaySettings.id, existingSetting.id));
    } else {
      await this.db.insert(practitionerScheduleDaySettings).values({
        practitionerId,
        scheduleDate: date,
        targetQuota: 8,
        isLeave: false,
        leaveReason,
      });
    }

    const sessionStatus = toDaySessionPersistenceStatus(requestedStatus);
    const updateValues: Record<string, any> = {
      status: sessionStatus,
      updatedAt: new Date().toISOString(),
    };
    if (isClosed) {
      updateValues.availableSlots = 0;
    } else {
      updateValues.availableSlots = sql`capacity`;
    }

    const updatedSessions = await this.db
      .update(practitionerScheduleSessions)
      .set(updateValues)
      .where(
        and(
          eq(practitionerScheduleSessions.practitionerId, practitionerId),
          eq(practitionerScheduleSessions.scheduleDate, date),
        ),
      )
      .returning();

    // 2. Soft-cancel active appointments if day is closed
    let cancelledAppointmentsCount = 0;
    if (isClosed) {
      const activeAppts = await this.db.query.appointments.findMany({
        where: and(
          eq(appointments.practitionerId, practitionerId),
          eq(appointments.scheduledDate, date),
          inArray(appointments.status, ['booked', 'checked_in', 'waiting']),
        ),
      });

      cancelledAppointmentsCount = activeAppts.length;
      if (activeAppts.length > 0) {
        const cancelReason = notes
          ? `[PENUTUPAN_JADWAL] ${notes}`
          : 'Jadwal praktik dokter ditutup operasional oleh admin klinik.';

        await this.db
          .update(appointments)
          .set({
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelReason,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(appointments.practitionerId, practitionerId),
              eq(appointments.scheduledDate, date),
              inArray(appointments.status, ['booked', 'checked_in', 'waiting']),
            ),
          );
      }
    }

    return {
      success: true,
      message: isClosed
        ? 'Jadwal hari berhasil ditutup dan seluruh sesi dinonaktifkan (pasien aktif dibatalkan secara soft delete)'
        : 'Jadwal hari berhasil dibuka kembali dan seluruh sesi diaktifkan',
      data: {
        date,
        status: toAdminDayStatusResponseLabel(requestedStatus),
        notes: notes || null,
        affectedSessionsCount: updatedSessions.length,
        cancelledAppointmentsCount,
      },
    };
  }

  async createAdminDoctorSession(
    id: string,
    body: CreateAdminDoctorSessionDto,
  ): Promise<any> {
    const practitioner = await this.resolvePractitioner(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }
    const practitionerId = practitioner.id;

    let roomId: string | null = null;
    if (body.ruang) {
      if (this.isUuid(body.ruang)) {
        const room = await this.db.query.clinicRooms.findFirst({
          where: eq(clinicRooms.id, body.ruang),
        });
        if (room) roomId = room.id;
      } else {
        const room = await this.db.query.clinicRooms.findFirst({
          where: or(
            eq(clinicRooms.name, body.ruang),
            eq(clinicRooms.code, body.ruang),
            sql`lower(${clinicRooms.name}) LIKE lower(${`%${body.ruang.split(',')[0].trim()}%`})`,
          ),
        });
        if (room) roomId = room.id;
      }
    }
    if (!roomId) {
      roomId = practitioner.defaultRoomId || null;
    }
    if (!roomId) {
      const defaultRoom = await this.db.query.clinicRooms.findFirst({
        where: eq(clinicRooms.isActive, true),
      });
      if (defaultRoom) roomId = defaultRoom.id;
    }

    const startTimeFormatted =
      body.jam_mulai.length === 5 ? `${body.jam_mulai}:00` : body.jam_mulai;
    const endTimeFormatted =
      body.jam_selesai.length === 5
        ? `${body.jam_selesai}:00`
        : body.jam_selesai;

    await this.checkScheduleConflicts(
      practitionerId,
      body.schedule_date,
      startTimeFormatted,
      endTimeFormatted,
      roomId,
    );

    const nameLower = body.nama_sesi.toLowerCase();
    const shift: 'morning' | 'afternoon' | 'night' | 'early_morning' =
      nameLower.includes('siang') || nameLower.includes('sore')
        ? 'afternoon'
        : nameLower.includes('malam')
          ? 'night'
          : nameLower.includes('dini')
            ? 'early_morning'
            : 'morning';

    const requestedStatus = toAdminScheduleStatusRequest(
      body.status_sesi ?? AdminScheduleStatusRequest.OPEN,
    );
    if (!requestedStatus) {
      throw new BadRequestException({
        code: 'INVALID_SESSION_STATUS',
        message: 'status_sesi must use canonical values only: OPEN or CLOSED.',
        metadata: { status_sesi: body.status_sesi },
      });
    }
    const status = toDaySessionPersistenceStatus(requestedStatus);

    const capacity = body.kuota_pasien;
    const availableSlots =
      status === SchedulePersistenceStatus.CLOSED
        ? 0
        : body.slot_tersedia !== undefined
          ? body.slot_tersedia
          : capacity;

    const [session] = await this.db
      .insert(practitionerScheduleSessions)
      .values({
        practitionerId,
        scheduleDate: body.schedule_date,
        sessionLabel: body.nama_sesi,
        sessionShift: shift,
        startTime: startTimeFormatted,
        endTime: endTimeFormatted,
        capacity,
        availableSlots,
        roomId,
        status,
      })
      .returning();

    return {
      success: true,
      message: 'Sesi jadwal berhasil ditambahkan',
      data: session,
    };
  }

  async getAdminDoctorScheduleFilterOptions(): Promise<any> {
    const [units, specs] = await Promise.all([
      this.db.query.clinicUnits.findMany({
        where: eq(clinicUnits.isActive, true),
        orderBy: [asc(clinicUnits.name)],
      }),
      this.db.query.medicalSpecialties.findMany({
        orderBy: [asc(medicalSpecialties.name)],
      }),
    ]);

    return {
      success: true,
      data: {
        poliklinik: units.map((u) => ({
          id: u.id,
          name: u.name,
          code: u.code,
        })),
        spesialisasi: specs.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
        })),
        statuses: [
          { id: ScheduleOperationalStatus.OPEN, label: 'Buka' },
          { id: ScheduleOperationalStatus.OCCUPIED, label: 'Terisi' },
          { id: ScheduleOperationalStatus.CLOSED, label: 'Tutup' },
        ],
      },
    };
  }

  async deleteAdminDoctorSession(id: string, sessionId: string): Promise<any> {
    throw new ForbiddenException({
      code: 'ADMIN_SCHEDULE_DELETION_PROHIBITED',
      message:
        'Admin tidak diizinkan menghapus sesi jadwal dokter demi integritas data dan riwayat rekam medis klinis. Silakan nonaktifkan sesi dengan status CLOSED atau lakukan Reschedule.',
    });
  }

  async rescheduleAdminDoctorSession(
    id: string,
    sessionId: string,
    body: RescheduleAdminDoctorSessionDto,
  ): Promise<any> {
    const practitioner = await this.resolvePractitioner(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }

    const session = await this.db.query.practitionerScheduleSessions.findFirst({
      where: and(
        eq(practitionerScheduleSessions.id, sessionId),
        eq(practitionerScheduleSessions.practitionerId, practitioner.id),
      ),
    });

    if (!session) {
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan untuk dokter ini`,
      );
    }

    if (isClosedScheduleStatus(session.status)) {
      throw new UnprocessableEntityException({
        code: 'SESSION_NOT_ELIGIBLE_FOR_RESCHEDULE',
        message:
          'Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi.',
        metadata: {
          sessionId: session.id,
          status: session.status,
        },
      });
    }

    // Determine target schedule context ID
    let targetContextId = body.targetScheduleContextId;
    if (!targetContextId) {
      const startMin = parseClockTime(body.targetStartTime);
      if (startMin >= 0 && startMin < 360) {
        targetContextId = 'early_morning';
      } else if (startMin >= 360 && startMin < 720) {
        targetContextId = 'morning';
      } else if (startMin >= 720 && startMin < 1020) {
        targetContextId = 'afternoon';
      } else {
        targetContextId = 'night';
      }
    }

    const context = this.resolveScheduleContext(targetContextId);
    const targetRoomId =
      body.targetRoomId || session.roomId || practitioner.defaultRoomId || null;

    // Calculate target end time preserving the original session's duration
    const sessionDurationMinutes =
      parseClockTime(session.endTime) - parseClockTime(session.startTime);
    const targetEndMinutes =
      parseClockTime(body.targetStartTime) + sessionDurationMinutes;
    const targetEndTime = formatClockTime(targetEndMinutes);

    // Calculate projection for the target date and time preserving duration/slots
    const preview = await this.projectAvailability(
      practitioner.id,
      {
        date: body.targetDate,
        scheduleContextId: targetContextId,
        startTime: body.targetStartTime,
        endTime: targetEndTime,
        slotsCount: session.capacity,
        fillShift: false,
        roomId: targetRoomId || undefined,
      },
      true,
    );

    if (
      preview.intervals.some((interval) => interval.closedReason === 'LEAVE')
    ) {
      throw new ConflictException({
        code: 'DATE_CLOSED',
        message:
          'Jadwal tidak dapat di-reschedule karena dokter tercatat sedang cuti pada tanggal target.',
        metadata: {
          targetDate: body.targetDate,
          closedReason: 'LEAVE',
        },
      });
    }

    // Check conflicts on target date, excluding this session
    await this.checkScheduleConflicts(
      practitioner.id,
      body.targetDate,
      body.targetStartTime,
      preview.projectedEndTime,
      targetRoomId,
      sessionId,
    );

    // Fetch active appointments attached to this session
    const activeAppointments = await this.db.query.appointments.findMany({
      where: and(
        eq(appointments.scheduleSessionId, sessionId),
        inArray(appointments.status, [
          'booked',
          'checked_in',
          'waiting',
          'in_service',
        ]),
      ),
      orderBy: [asc(appointments.scheduledStartTime)],
    });

    const previousSchedule = {
      date: session.scheduleDate,
      startTime: session.startTime.slice(0, 5),
      endTime: session.endTime.slice(0, 5),
      roomId: session.roomId,
    };

    // Execute atomic transaction for reschedule
    const updatedSession = await this.db.transaction(async (tx) => {
      // 1. Shift active appointments if requested
      if (
        body.rescheduleActiveAppointments !== false &&
        activeAppointments.length > 0
      ) {
        const duration = preview.effectiveConsultationDurationMinutes;
        const startMin = parseClockTime(body.targetStartTime);

        for (let i = 0; i < activeAppointments.length; i++) {
          const appt = activeAppointments[i];
          const apptStartMin = startMin + i * duration;
          const apptEndMin = apptStartMin + duration;
          const apptStartTime = formatClockTime(apptStartMin);
          const apptEndTime = formatClockTime(apptEndMin);

          await tx
            .update(appointments)
            .set({
              scheduledDate: body.targetDate,
              scheduledStartTime: `${apptStartTime}:00`,
              scheduledEndTime: `${apptEndTime}:00`,
              roomId: targetRoomId || appt.roomId,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(appointments.id, appt.id));
        }
      }

      // 2. Update practitionerScheduleSessions
      const startTimeFormatted =
        body.targetStartTime.length === 5
          ? `${body.targetStartTime}:00`
          : body.targetStartTime;
      const endTimeFormatted =
        preview.projectedEndTime.length === 5
          ? `${preview.projectedEndTime}:00`
          : preview.projectedEndTime;

      const [rescheduled] = await tx
        .update(practitionerScheduleSessions)
        .set({
          scheduleDate: body.targetDate,
          startTime: startTimeFormatted,
          endTime: endTimeFormatted,
          sessionLabel: context.contextLabel,
          sessionShift: context.sessionShift,
          capacity: preview.capacity,
          availableSlots: Math.max(
            0,
            preview.capacity - activeAppointments.length,
          ),
          roomId: targetRoomId,
          notes:
            body.notes || body.reason
              ? `[RESCHEDULED] ${body.notes || body.reason}`
              : session.notes,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(practitionerScheduleSessions.id, sessionId))
        .returning();

      // 3. Cascade synchronize source date when no open sessions remain.
      const remainingOpenOnSource =
        await tx.query.practitionerScheduleSessions.findMany({
          where: and(
            eq(practitionerScheduleSessions.practitionerId, practitioner.id),
            eq(practitionerScheduleSessions.scheduleDate, previousSchedule.date),
            eq(
              practitionerScheduleSessions.status,
              SchedulePersistenceStatus.OPEN,
            ),
          ),
        });

      if (remainingOpenOnSource.length === 0) {
        await tx
          .update(practitionerScheduleDaySettings)
          .set({
            leaveReason: null,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(
                practitionerScheduleDaySettings.practitionerId,
                practitioner.id,
              ),
              eq(
                practitionerScheduleDaySettings.scheduleDate,
                previousSchedule.date,
              ),
              eq(practitionerScheduleDaySettings.isLeave, false),
            ),
          );
      }

      return rescheduled;
    });

    const updatedProjection = await this.buildProjectionForSession(
      sessionId,
      true,
    );

    return {
      success: true,
      message: 'Jadwal dokter berhasil dijadwalkan ulang (rescheduled)',
      data: {
        sessionId,
        practitionerId: practitioner.id,
        previousSchedule,
        rescheduledSchedule: {
          id: updatedSession.id,
          scheduleDate: updatedSession.scheduleDate,
          startTime: updatedSession.startTime.slice(0, 5),
          endTime: updatedSession.endTime.slice(0, 5),
          timeRange: `${updatedSession.startTime.slice(0, 5)} - ${updatedSession.endTime.slice(0, 5)} WIB`,
          sessionLabel: updatedSession.sessionLabel,
          sessionShift: updatedSession.sessionShift,
          capacity: updatedSession.capacity,
          availableSlots: updatedSession.availableSlots,
          status: updatedSession.status,
          roomId: updatedSession.roomId,
          notes: updatedSession.notes,
          version: generateEntityVersion(updatedSession.updatedAt),
        },
        rescheduledAppointmentsCount: activeAppointments.length,
        projection: updatedProjection,
      },
    };
  }

  async checkRescheduleEligibility(
    id: string,
    sessionId: string,
    query: CheckRescheduleEligibilityQueryDto,
  ): Promise<RescheduleEligibilityEntity> {
    const practitioner = await this.resolvePractitioner(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
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
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan untuk dokter ini`,
      );
    }

    const sourceDate = session.scheduleDate;
    const [sourceDaySetting, sourceLeave, activeAppts] = await Promise.all([
      this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitioner.id),
          eq(practitionerScheduleDaySettings.scheduleDate, sourceDate),
        ),
      }),
      this.db.query.practitionerLeavePeriods.findFirst({
        where: and(
          eq(practitionerLeavePeriods.practitionerId, practitioner.id),
          lte(practitionerLeavePeriods.startDate, sourceDate),
          gte(practitionerLeavePeriods.endDate, sourceDate),
        ),
      }),
      this.db.query.appointments.findMany({
        where: and(
          eq(appointments.scheduleSessionId, sessionId),
          inArray(appointments.status, [
            'booked',
            'checked_in',
            'waiting',
            'in_service',
          ]),
        ),
      }),
    ]);

    const isSourceCuti = Boolean(sourceDaySetting?.isLeave || sourceLeave);
    const sourceStatus = this.toAdminSessionStatus(
      isSourceCuti,
      session.availableSlots ?? 0,
      session.status,
    );
    const isSourceClosed = sourceStatus === ScheduleOperationalStatus.CLOSED;

    let isSourceEligible = true;
    let rejectionReason: string | null = null;

    if (isSourceClosed) {
      isSourceEligible = false;
      rejectionReason =
        'Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi.';
    } else if (isSourceCuti) {
      isSourceEligible = false;
      rejectionReason =
        'Sesi berstatus Cuti. Cuti dokter tidak dapat di-reschedule.';
    }

    let roomName = 'Belum Ditentukan';
    if (session.clinicRoom) {
      roomName = `${session.clinicRoom.name}${session.clinicRoom.location ? `, ${session.clinicRoom.location}` : ''}`;
    } else if (session.roomId || practitioner.defaultRoomId) {
      const room = await this.db.query.clinicRooms.findFirst({
        where: eq(
          clinicRooms.id,
          (session.roomId || practitioner.defaultRoomId)!,
        ),
      });
      if (room) {
        roomName = `${room.name}${room.location ? `, ${room.location}` : ''}`;
      }
    }

    const sourceSessionInfo: RescheduleSourceSessionInfo = {
      id: session.id,
      scheduleDate: session.scheduleDate,
      startTime: session.startTime.slice(0, 5),
      endTime: session.endTime.slice(0, 5),
      timeRange: `${session.startTime.slice(0, 5)} - ${session.endTime.slice(0, 5)} WIB`,
      status: session.status,
      statusLabel: sourceStatus,
      sessionLabel: session.sessionLabel || 'Sesi Praktik',
      sessionShift: session.sessionShift || 'morning',
      roomName,
      activeAppointmentsCount: activeAppts.length,
      isSourceEligible,
      rejectionReason,
    };

    let targetValidation = {
      evaluated: false,
      targetDate: query.targetDate || null,
      targetStartTime: query.targetStartTime || null,
      projectedEndTime: null as string | null,
      targetRoomId: query.targetRoomId || null,
      targetRoomName: null as string | null,
      isTargetEligible: true,
      conflictCode: null as string | null,
      conflictMessage: null as string | null,
      conflictMetadata: null as Record<string, any> | null,
    };

    if (query.targetDate && query.targetStartTime) {
      targetValidation.evaluated = true;

      let targetContextId: string;
      const startMin = parseClockTime(query.targetStartTime);
      if (startMin >= 0 && startMin < 360) {
        targetContextId = 'early_morning';
      } else if (startMin >= 360 && startMin < 720) {
        targetContextId = 'morning';
      } else if (startMin >= 720 && startMin < 1020) {
        targetContextId = 'afternoon';
      } else {
        targetContextId = 'night';
      }

      const sessionDurationMinutes =
        parseClockTime(session.endTime) - parseClockTime(session.startTime);
      const targetEndMinutes = startMin + sessionDurationMinutes;
      const targetEndTime = formatClockTime(targetEndMinutes);
      targetValidation.projectedEndTime = targetEndTime;

      const targetRoomId =
        query.targetRoomId ||
        session.roomId ||
        practitioner.defaultRoomId ||
        null;
      targetValidation.targetRoomId = targetRoomId;

      if (targetRoomId) {
        const room = await this.db.query.clinicRooms.findFirst({
          where: eq(clinicRooms.id, targetRoomId),
        });
        if (room) {
          targetValidation.targetRoomName = `${room.name}${room.location ? `, ${room.location}` : ''}`;
        }
      }

      try {
        const [targetDaySetting, targetLeave] = await Promise.all([
          this.db.query.practitionerScheduleDaySettings.findFirst({
            where: and(
              eq(
                practitionerScheduleDaySettings.practitionerId,
                practitioner.id,
              ),
              eq(
                practitionerScheduleDaySettings.scheduleDate,
                query.targetDate,
              ),
            ),
          }),
          this.db.query.practitionerLeavePeriods.findFirst({
            where: and(
              eq(practitionerLeavePeriods.practitionerId, practitioner.id),
              lte(practitionerLeavePeriods.startDate, query.targetDate),
              gte(practitionerLeavePeriods.endDate, query.targetDate),
            ),
          }),
        ]);

        if (targetDaySetting?.isLeave || targetLeave) {
          targetValidation.isTargetEligible = false;
          targetValidation.conflictCode = 'DATE_CLOSED';
          targetValidation.conflictMessage =
            'Jadwal tidak dapat di-reschedule karena dokter tercatat sedang cuti pada tanggal target.';
          targetValidation.conflictMetadata = {
            targetDate: query.targetDate,
            closedReason: 'LEAVE',
          };
        } else {
          const context = this.resolveScheduleContext(targetContextId);
          const boundaryStart = parseClockTime(context.boundaryStartTime);
          const boundaryEnd = parseClockTime(context.boundaryEndTime);

          if (startMin < boundaryStart || startMin >= boundaryEnd) {
            targetValidation.isTargetEligible = false;
            targetValidation.conflictCode = 'START_OUTSIDE_BOUNDARY';
            targetValidation.conflictMessage = `Jam mulai (${query.targetStartTime}) berada di luar batas operasional shift ${context.contextLabel} (${context.boundaryStartTime} - ${context.boundaryEndTime} WIB).`;
          } else {
            await this.checkScheduleConflicts(
              practitioner.id,
              query.targetDate,
              query.targetStartTime,
              targetEndTime,
              targetRoomId,
              sessionId,
            );
          }
        }
      } catch (err: any) {
        targetValidation.isTargetEligible = false;
        targetValidation.conflictCode =
          err.response?.code || err.code || 'CONFLICT';
        targetValidation.conflictMessage =
          err.response?.message || err.message || 'Konflik jadwal terdeteksi';
        targetValidation.conflictMetadata = err.response?.metadata || null;
      }
    }

    const isEligible =
      isSourceEligible &&
      (!targetValidation.evaluated || targetValidation.isTargetEligible);

    let actionableGuidance: string;
    if (!isSourceEligible) {
      actionableGuidance = rejectionReason!;
    } else if (
      targetValidation.evaluated &&
      !targetValidation.isTargetEligible
    ) {
      actionableGuidance = targetValidation.conflictMessage!;
    } else if (
      targetValidation.evaluated &&
      targetValidation.isTargetEligible
    ) {
      actionableGuidance =
        'Sesi dan target waktu memenuhi syarat untuk di-reschedule. Silakan lanjutkan konfirmasi.';
    } else {
      actionableGuidance =
        'Sesi memenuhi syarat untuk di-reschedule. Silakan tentukan tanggal dan jam target baru.';
    }

    const practitionerName =
      practitioner.staffProfile?.fullName ||
      practitioner.displayName ||
      'Dokter Amanah';

    return {
      sessionId: session.id,
      practitionerId: practitioner.id,
      practitionerName,
      isEligible,
      sourceSession: sourceSessionInfo,
      targetValidation,
      actionableGuidance,
    };
  }

  async updateAdminDoctorSession(
    id: string,
    sessionId: string,
    body: UpdateAdminDoctorSessionDto,
  ): Promise<any> {
    const practitioner = await this.resolvePractitioner(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }

    const existingSession =
      await this.db.query.practitionerScheduleSessions.findFirst({
        where: and(
          eq(practitionerScheduleSessions.id, sessionId),
          eq(practitionerScheduleSessions.practitionerId, practitioner.id),
        ),
      });

    if (!existingSession) {
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan untuk dokter ini`,
      );
    }

    const startTimeFormatted = body.jam_mulai
      ? body.jam_mulai.length === 5
        ? `${body.jam_mulai}:00`
        : body.jam_mulai
      : existingSession.startTime;
    const endTimeFormatted = body.jam_selesai
      ? body.jam_selesai.length === 5
        ? `${body.jam_selesai}:00`
        : body.jam_selesai
      : existingSession.endTime;

    let roomId = existingSession.roomId;
    if (body.ruang) {
      if (this.isUuid(body.ruang)) {
        const room = await this.db.query.clinicRooms.findFirst({
          where: eq(clinicRooms.id, body.ruang),
        });
        if (room) roomId = room.id;
      } else {
        const room = await this.db.query.clinicRooms.findFirst({
          where: or(
            eq(clinicRooms.name, body.ruang),
            eq(clinicRooms.code, body.ruang),
            sql`lower(${clinicRooms.name}) LIKE lower(${`%${body.ruang.split(',')[0].trim()}%`})`,
          ),
        });
        if (room) roomId = room.id;
      }
    }

    if (body.jam_mulai || body.jam_selesai || body.ruang) {
      await this.checkScheduleConflicts(
        practitioner.id,
        existingSession.scheduleDate,
        startTimeFormatted,
        endTimeFormatted,
        roomId,
        sessionId,
      );
    }

    const updateValues: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.nama_sesi) {
      updateValues.sessionLabel = body.nama_sesi;
      const nameLower = body.nama_sesi.toLowerCase();
      const shift: 'morning' | 'afternoon' | 'night' | 'early_morning' =
        nameLower.includes('siang') || nameLower.includes('sore')
          ? 'afternoon'
          : nameLower.includes('malam')
            ? 'night'
            : nameLower.includes('dini')
              ? 'early_morning'
              : 'morning';
      updateValues.sessionShift = shift;
    }

    if (body.jam_mulai) updateValues.startTime = startTimeFormatted;
    if (body.jam_selesai) updateValues.endTime = endTimeFormatted;
    if (body.ruang) updateValues.roomId = roomId;

    if (body.kuota_pasien !== undefined) {
      updateValues.capacity = body.kuota_pasien;
    }

    if (body.status_sesi) {
      const requestedStatus = toAdminScheduleStatusRequest(body.status_sesi);
      if (!requestedStatus) {
        throw new BadRequestException({
          code: 'INVALID_SESSION_STATUS',
          message:
            'status_sesi must use canonical values only: OPEN or CLOSED.',
          metadata: { status_sesi: body.status_sesi },
        });
      }
      const status = toDaySessionPersistenceStatus(requestedStatus);
      updateValues.status = status;
      if (status === SchedulePersistenceStatus.CLOSED) {
        updateValues.availableSlots = 0;
      } else if (
        body.slot_tersedia === undefined &&
        (existingSession.availableSlots === 0 ||
          existingSession.availableSlots === null)
      ) {
        updateValues.availableSlots = sql`capacity`;
      }
    }

    if (body.slot_tersedia !== undefined) {
      updateValues.availableSlots = body.slot_tersedia;
    }

    const [updated] = await this.db
      .update(practitionerScheduleSessions)
      .set(updateValues)
      .where(eq(practitionerScheduleSessions.id, sessionId))
      .returning();

    return {
      success: true,
      message: 'Sesi jadwal berhasil diperbarui',
      data: updated,
    };
  }

  async findClinicalPractitioners(
    query: ClinicalPractitionersQueryDto,
  ): Promise<ClinicalPractitionerEntity[]> {
    const targetDate = query.date || new Date().toISOString().slice(0, 10);

    const pracs = await this.db.query.practitioners.findMany({
      where: eq(practitioners.isAcceptingAppointments, true),
      with: {
        staffProfile: {
          with: {
            clinicUnit: true,
          },
        },
        medicalSpecialty: true,
        clinicRoom: true,
      },
      orderBy: [asc(practitioners.displayName)],
    });

    const results: ClinicalPractitionerEntity[] = [];

    for (const p of pracs) {
      const spec =
        p.medicalSpecialty?.name ||
        p.staffProfile?.clinicUnit?.name ||
        'Dokter Umum';

      if (query.service) {
        const q = query.service.toLowerCase();
        const matchService =
          spec.toLowerCase().includes(q) ||
          (p.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!matchService) continue;
      }

      const daySetting =
        await this.db.query.practitionerScheduleDaySettings.findFirst({
          where: and(
            eq(practitionerScheduleDaySettings.practitionerId, p.id),
            eq(practitionerScheduleDaySettings.scheduleDate, targetDate),
          ),
        });

      const activeLeave =
        await this.db.query.practitionerLeavePeriods.findFirst({
          where: and(
            eq(practitionerLeavePeriods.practitionerId, p.id),
            lte(practitionerLeavePeriods.startDate, targetDate),
            gte(practitionerLeavePeriods.endDate, targetDate),
          ),
        });

      const isCuti = Boolean(daySetting?.isLeave || activeLeave);

      const openSessions =
        await this.db.query.practitionerScheduleSessions.findMany({
          where: and(
            eq(practitionerScheduleSessions.practitionerId, p.id),
            eq(practitionerScheduleSessions.scheduleDate, targetDate),
            eq(
              practitionerScheduleSessions.status,
              SchedulePersistenceStatus.OPEN,
            ),
            sql`available_slots > 0`,
          ),
        });

      const isAvailable = !isCuti && openSessions.length > 0;
      const location = p.clinicRoom
        ? `${p.clinicRoom.name}${p.clinicRoom.location ? `, ${p.clinicRoom.location}` : ''}`
        : 'Poli Umum, Ruang 101';

      results.push({
        id: p.id,
        name: p.staffProfile?.fullName || p.displayName || 'Dokter Amanah',
        spec,
        avatar: this.toAvatarUrl(p.staffProfile),
        location,
        rating: p.rating ? String(p.rating) : '5.0',
        tags: p.tags?.length ? p.tags : [spec],
        schedule: 'Senin - Sabtu (07:30 - 17:30)',
        is_available: isAvailable,
      });
    }

    return results;
  }

  async getAdminSessionPatients(
    practitionerId: string,
    sessionId: string,
    query: GetSessionPatientsQueryDto,
  ): Promise<AdminSessionPatientsResponse> {
    const practitioner = await this.resolvePractitioner(practitionerId);
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

    const conditions: any[] = [eq(appointments.scheduleSessionId, sessionId)];

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

    let mappedPatients: AdminSessionPatientItem[] = aptRecords.map((apt) => {
      let ageStr = '-';
      if (apt.patientProfile?.birthDate) {
        const birth = new Date(apt.patientProfile.birthDate);
        const now = new Date();
        let years = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
          years--;
        }
        ageStr = `${Math.max(0, years)} Thn`;
      }

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

      const statusBadgeMap: Record<string, string> = {
        booked: 'Booked',
        checked_in: 'Menunggu',
        waiting: 'Menunggu',
        in_service: 'Di Sesi',
        completed: 'Selesai',
        cancelled: 'Batal',
        no_show: 'Terlambat',
      };
      const statusBadge = statusBadgeMap[apt.status] || apt.status;

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
    const practitioner = await this.resolvePractitioner(practitionerId);
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
