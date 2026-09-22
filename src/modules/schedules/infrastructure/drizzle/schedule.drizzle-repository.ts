import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
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
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  clinicUnits,
  medicalSpecialties,
  practitionerLeavePeriods,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
  practitioners,
} from '../../../../database/schema';
import {
  AdminDoctorDailySession,
  AdminDoctorMonthlyDayEntity,
  AdminDoctorScheduleCardEntity,
  AdminDoctorScheduleDetailResponse,
  AdminDoctorScheduleListResponse,
  BookedPatientEntity,
  CalendarSummaryResponse,
  ClinicalPractitionerEntity,
  ClinicRoomReferenceEntity,
  DayScheduleSettingEntity,
  ScheduleEntity,
  ScheduleOptionsReferenceEntity,
} from '../../domain/entities/schedule.entity';
import { ScheduleRepository } from '../../domain/repositories/schedule.repository';
import { AdminDoctorScheduleDetailQueryDto } from '../../presentation/dto/admin-doctor-schedule-detail-query.dto';
import { AdminDoctorSchedulesQueryDto } from '../../presentation/dto/admin-doctor-schedules-query.dto';
import { ClinicalPractitionersQueryDto } from '../../presentation/dto/clinical-practitioners-query.dto';
import { CreateAdminDoctorSessionDto } from '../../presentation/dto/create-admin-doctor-session.dto';
import { UpdateAdminDoctorScheduleDto } from '../../presentation/dto/update-admin-doctor-schedule.dto';
import { UpdateAdminDoctorSessionDto } from '../../presentation/dto/update-admin-doctor-session.dto';

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
      user?: { imageUrl?: string | null } | null;
    } | null,
  ): string {
    return staffProfile?.avatarUrl ?? staffProfile?.user?.imageUrl ?? '';
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

    const capacity = r.capacity ?? 8;
    const availableSlots = r.availableSlots ?? capacity;
    const bookedPatientCount = Math.max(0, capacity - availableSlots);

    const isAvailable = r.status === 'open';
    const status = isAvailable ? 'Buka' : 'Tutup';

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
      status,
      rawStatus: r.status,
      isAvailable,
      notes: r.notes || null,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
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
        status: data.isAvailable ? 'open' : 'closed',
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
        eq(practitionerScheduleSessions.status, 'open'),
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
      updateValues.status =
        data.status.toLowerCase() === 'buka' ||
        data.status.toLowerCase() === 'open'
          ? 'open'
          : 'closed';
    } else if (data.isAvailable !== undefined) {
      updateValues.status = data.isAvailable ? 'open' : 'closed';
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
    const [record] = await this.db
      .update(practitionerScheduleSessions)
      .set({
        status: isAvailable ? 'open' : 'closed',
        updatedAt: new Date().toISOString(),
      })
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

    const res = await this.db
      .delete(practitionerScheduleSessions)
      .where(eq(practitionerScheduleSessions.id, id))
      .returning();

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

      days.push({
        date,
        hasSchedule,
        isCuti,
        cutiReason,
        sessionCount,
        targetQuota,
        bookedPatientCount,
        capacityPercentage,
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
        eq(practitionerScheduleSessions.status, 'open'),
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
        { id: 'open', label: 'Buka' },
        { id: 'closed', label: 'Tutup' },
        { id: 'pending', label: 'Menunggu' },
      ],
      timeSlotIntervals: [15, 30, 45, 60],
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

        let statusSesi = 'Buka';
        if (isCuti) statusSesi = 'Cuti';
        else if (availableSlots === 0) statusSesi = 'Penuh';
        else if (s.status === 'closed') statusSesi = 'Tutup';

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
        };
      });

      const totalCapacity =
        sesiHarian.length > 0
          ? sesiHarian.reduce((acc, s) => acc + s.kuota_pasien, 0)
          : (daySetting?.targetQuota ?? 0);
      const totalAvailable = isCuti
        ? 0
        : sesiHarian.reduce((acc, s) => acc + s.slot_tersedia, 0);

      let scheduleStatus = 'Buka';
      if (isCuti) {
        scheduleStatus = 'Cuti';
      } else if (sesiHarian.length === 0) {
        scheduleStatus = 'Tutup';
      } else if (totalAvailable === 0) {
        scheduleStatus = 'Penuh';
      } else {
        const hasOpen = sesiHarian.some((s) => s.status_sesi === 'Buka');
        scheduleStatus = hasOpen ? 'Buka' : 'Tutup';
      }

      let jadwalHariIni = '-';
      if (sesiHarian.length > 0) {
        const starts = sesiHarian.map((s) => s.jam_mulai).sort();
        const ends = sesiHarian.map((s) => s.jam_selesai).sort();
        jadwalHariIni = `${starts[0]} - ${ends[ends.length - 1]}`;
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
          .map((s) => s.trim().toLowerCase());
        const matchStatus = statusList.includes(scheduleStatus.toLowerCase());
        if (!matchStatus) continue;
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
        slot_tersedia: totalAvailable,
        kapasitas_per_hari: totalCapacity,
        jadwal_hari_ini: jadwalHariIni,
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
            user: true,
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
      let dayStatus: 'Buka' | 'Penuh' | 'Cuti' | 'Tutup' = 'Tutup';
      let dayNotes: string | null = null;

      if (isCuti) {
        dayStatus = 'Cuti';
        dayNotes = daySetting?.leaveReason || leave?.reason || 'Cuti Dokter';
      } else if (daySessions.length === 0) {
        if (
          daySetting &&
          !daySetting.isLeave &&
          (daySetting.leaveReason === 'Buka' ||
            daySetting.leaveReason === 'open')
        ) {
          dayStatus = 'Buka';
          dayNotes = 'Status dibuka oleh admin';
        } else {
          dayStatus = 'Tutup';
        }
      } else {
        const totalAvail = daySessions.reduce(
          (acc, s) => acc + (s.availableSlots ?? s.capacity ?? 8),
          0,
        );
        if (totalAvail === 0) {
          dayStatus = 'Penuh';
          dayNotes = 'Slot terisi penuh oleh pasien reservasi';
        } else {
          const anyOpen = daySessions.some((s) => s.status === 'open');
          dayStatus = anyOpen ? 'Buka' : 'Tutup';
        }
      }

      monthlySchedule.push({
        day: d,
        date: dateStr,
        status: dayStatus,
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

    const sesiHarian: AdminDoctorDailySession[] = evalSessions.map((s) => {
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

      let statusSesi = 'Buka';
      if (isEvalCuti) statusSesi = 'Cuti';
      else if (availableSlots === 0) statusSesi = 'Penuh';
      else if (s.status === 'closed') statusSesi = 'Tutup';

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
      };
    });

    const totalCapacity =
      sesiHarian.length > 0
        ? sesiHarian.reduce((acc, s) => acc + s.kuota_pasien, 0)
        : (evalDaySetting?.targetQuota ?? 0);
    const totalAvailable = isEvalCuti
      ? 0
      : sesiHarian.reduce((acc, s) => acc + s.slot_tersedia, 0);

    let statusDokter = 'Buka';
    if (isEvalCuti) statusDokter = 'Cuti';
    else if (sesiHarian.length === 0) statusDokter = 'Tutup';
    else if (totalAvailable === 0) statusDokter = 'Penuh';

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
        slot_tersedia: totalAvailable,
        kapasitas_per_hari: totalCapacity,
        bulan_jadwal: this.formatIndoMonthYear(targetYear, targetMonth),
        is_cuti: isEvalCuti,
        cuti_reason: evalCutiReason,
        cuti_start: evalCutiStart,
        cuti_end: evalCutiEnd,
        monthly_schedule: monthlySchedule,
        sesi_harian: sesiHarian,
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
          status: body.is_cuti ? 'leave' : 'open',
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

    // 2. Schedule status override (Tutup / Buka / Penuh)
    if (body.status_jadwal) {
      const statusLower = body.status_jadwal.toLowerCase();
      const sessionStatus =
        statusLower === 'buka' || statusLower === 'open'
          ? 'open'
          : statusLower === 'cuti' || statusLower === 'leave'
            ? 'leave'
            : 'closed';

      const updateValues: Record<string, any> = {
        status: sessionStatus,
        updatedAt: new Date().toISOString(),
      };

      if (statusLower === 'penuh' || statusLower === 'full') {
        updateValues.availableSlots = 0;
      } else if (statusLower === 'cuti') {
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

    const statusLower = status.toLowerCase();
    const isCuti = statusLower === 'cuti';
    const isPenuh = statusLower === 'penuh' || statusLower === 'full';
    const isTutup = statusLower === 'tutup' || statusLower === 'closed';
    const isBuka = statusLower === 'buka' || statusLower === 'open';

    const existingSetting =
      await this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          eq(practitionerScheduleDaySettings.scheduleDate, date),
        ),
      });

    const leaveReason = isCuti
      ? notes || 'Cuti Dokter'
      : isBuka
        ? 'Buka'
        : null;

    if (existingSetting) {
      await this.db
        .update(practitionerScheduleDaySettings)
        .set({
          isLeave: isCuti,
          leaveReason,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(practitionerScheduleDaySettings.id, existingSetting.id));
    } else {
      await this.db.insert(practitionerScheduleDaySettings).values({
        practitionerId,
        scheduleDate: date,
        targetQuota: 8,
        isLeave: isCuti,
        leaveReason,
      });
    }

    const sessionStatus = isCuti ? 'leave' : isTutup ? 'closed' : 'open';
    const updateValues: Record<string, any> = {
      status: sessionStatus,
      updatedAt: new Date().toISOString(),
    };
    if (isCuti || isPenuh) {
      updateValues.availableSlots = 0;
    }

    await this.db
      .update(practitionerScheduleSessions)
      .set(updateValues)
      .where(
        and(
          eq(practitionerScheduleSessions.practitionerId, practitionerId),
          eq(practitionerScheduleSessions.scheduleDate, date),
        ),
      );

    return {
      success: true,
      message: 'Status hari berhasil diperbarui',
      data: {
        date,
        status,
        notes: notes || null,
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

    const statusLower = (body.status_sesi || 'buka').toLowerCase();
    const status: 'open' | 'closed' | 'leave' | 'full' =
      statusLower === 'cuti'
        ? 'leave'
        : statusLower === 'tutup'
          ? 'closed'
          : statusLower === 'penuh'
            ? 'full'
            : 'open';

    const capacity = body.kuota_pasien;
    const availableSlots =
      status === 'leave' || status === 'full'
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
          { id: 'buka', label: 'Buka' },
          { id: 'cuti', label: 'Cuti' },
          { id: 'tutup', label: 'Tutup' },
          { id: 'penuh', label: 'Penuh' },
        ],
      },
    };
  }

  async deleteAdminDoctorSession(id: string, sessionId: string): Promise<any> {
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
    });

    if (activeAppointments.length > 0) {
      throw new ConflictException({
        code: 'SESSION_HAS_ACTIVE_BOOKINGS',
        message: `Sesi jadwal tidak dapat dihapus karena sudah memiliki ${activeAppointments.length} pasien terdaftar. Batalkan atau jadwalkan ulang janji temu pasien terlebih dahulu.`,
      });
    }

    await this.db
      .delete(practitionerScheduleSessions)
      .where(eq(practitionerScheduleSessions.id, sessionId));

    return {
      success: true,
      message: 'Sesi jadwal berhasil dihapus',
      data: {
        sessionId,
      },
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
      const statusLower = body.status_sesi.toLowerCase();
      const status: 'open' | 'closed' | 'leave' | 'full' =
        statusLower === 'cuti'
          ? 'leave'
          : statusLower === 'tutup'
            ? 'closed'
            : statusLower === 'penuh'
              ? 'full'
              : 'open';
      updateValues.status = status;
      if (status === 'leave' || status === 'full') {
        updateValues.availableSlots = 0;
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
            user: true,
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
            eq(practitionerScheduleSessions.status, 'open'),
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
}
