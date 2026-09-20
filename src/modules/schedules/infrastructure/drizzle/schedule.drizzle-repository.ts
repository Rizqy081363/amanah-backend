import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, not, or, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  clinicServices,
  clinicUnits,
  patientProfiles,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
  practitioners,
  queueTickets,
} from '../../../../database/schema';
import {
  BookedPatientEntity,
  CalendarSummaryResponse,
  ClinicRoomReferenceEntity,
  DayScheduleSettingEntity,
  ScheduleEntity,
  ScheduleOptionsReferenceEntity,
} from '../../domain/entities/schedule.entity';
import { ScheduleRepository } from '../../domain/repositories/schedule.repository';

@Injectable()
export class ScheduleDrizzleRepository implements ScheduleRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private async resolvePractitioner(staffOrPractitionerId: string) {
    if (!staffOrPractitionerId) return null;
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
    const formattedStart = startTime.length === 5 ? `${startTime}:00` : startTime;
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
      doctorConditions.push(not(eq(practitionerScheduleSessions.id, excludeSessionId)));
    }

    const doctorSessions = await this.db.query.practitionerScheduleSessions.findMany({
      where: and(...doctorConditions),
    });

    for (const sess of doctorSessions) {
      const sessStart = sess.startTime.length === 5 ? `${sess.startTime}:00` : sess.startTime;
      const sessEnd = sess.endTime.length === 5 ? `${sess.endTime}:00` : sess.endTime;

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
        roomConditions.push(not(eq(practitionerScheduleSessions.id, excludeSessionId)));
      }

      const roomSessions = await this.db.query.practitionerScheduleSessions.findMany({
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
        const sessStart = sess.startTime.length === 5 ? `${sess.startTime}:00` : sess.startTime;
        const sessEnd = sess.endTime.length === 5 ? `${sess.endTime}:00` : sess.endTime;

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
    const daySetting = await this.db.query.practitionerScheduleDaySettings.findFirst({
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
        startTime: defaultStartTime.length === 5 ? `${defaultStartTime}:00` : defaultStartTime,
        endTime: defaultEndTime.length === 5 ? `${defaultEndTime}:00` : defaultEndTime,
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
      updateValues.endTime =
        endTime.length === 5 ? `${endTime}:00` : endTime;
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
        data.sessionLabel || (shift === 'afternoon' ? 'Siang' : shift === 'night' ? 'Malam' : 'Pagi');
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
        data.status.toLowerCase() === 'buka' || data.status.toLowerCase() === 'open'
          ? 'open'
          : 'closed';
    } else if (data.isAvailable !== undefined) {
      updateValues.status = data.isAvailable ? 'open' : 'closed';
    }

    if (data.notes !== undefined) {
      updateValues.notes = data.notes;
    }

    // Check conflicts if times or room were modified
    if (data.startTime || data.endTime || data.roomId !== undefined || data.scheduleDate) {
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
      const cutiReason = isCuti ? daySetting?.leaveReason ?? null : null;
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
    const cutiReason = isCuti ? daySetting?.leaveReason ?? null : null;
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

    const targetQuota = data.targetQuota !== undefined ? data.targetQuota : (existing?.targetQuota ?? 8);
    const isLeave = data.isCuti !== undefined ? data.isCuti : (existing?.isLeave ?? false);
    const leaveReason = data.cutiReason !== undefined ? data.cutiReason : (existing?.leaveReason ?? null);

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

      const sessionTitle =
        apt.practitionerScheduleSession?.sessionLabel
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

    const formattedStart = startTime.length === 5 ? `${startTime}:00` : startTime;
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
        const sessStart = s.startTime.length === 5 ? `${s.startTime}:00` : s.startTime;
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
}

