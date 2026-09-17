import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, lt, or } from 'drizzle-orm';
import {
  ConcurrentModificationConflictException,
  generateEntityVersion,
  matchesVersion,
  PreconditionFailedException,
} from '../../../../common/occ';
import { decodeCursor, encodeCursor } from '../../../../common/pagination';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  clinicServices,
  clinicUnits,
  patientProfiles,
  practitioners,
  queueTickets,
} from '../../../../database/schema';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import {
  AppointmentFindAllResult,
  AppointmentRepository,
} from '../../domain/repositories/appointment.repository';

@Injectable()
export class AppointmentDrizzleRepository implements AppointmentRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapDbToEntity(
    apt: any,
    ticket?: any | null,
    poliklinikIdOverride?: string,
  ): AppointmentEntity {
    let entityStatus: AppointmentEntity['status'] = 'SUDAH_BUAT_JANJI';
    if (apt.status === 'in_service') {
      entityStatus = 'SEDANG_DIPERIKSA';
    } else if (apt.status === 'completed') {
      entityStatus = 'SELESAI';
    } else if (apt.status === 'cancelled') {
      entityStatus = 'BATAL';
    } else if (apt.status === 'waiting' || apt.status === 'checked_in') {
      entityStatus = 'MENUNGGU';
    }

    const hour = parseInt((apt.scheduledStartTime || '08:00').slice(0, 2), 10);
    const session: 'PAGI' | 'SIANG' | 'MALAM' =
      hour >= 18 ? 'MALAM' : hour >= 13 ? 'SIANG' : 'PAGI';

    const poliId =
      poliklinikIdOverride ||
      apt.clinicRoom?.unitId ||
      apt.clinicRoom?.clinicUnit?.id ||
      '';

    return {
      id: apt.id,
      patientId: apt.patientId,
      patientName: apt.patientProfile?.fullName || 'Pasien Amanah',
      poliklinikId: poliId,
      poliklinikName: apt.clinicRoom?.clinicUnit?.name || 'Poliklinik Amanah',
      layananId: apt.serviceId,
      layananName: apt.clinicService?.name || 'Konsultasi Dokter',
      staffId: apt.practitionerId || null,
      doctorName:
        apt.practitioner?.staffProfile?.fullName ||
        apt.practitioner?.name ||
        null,
      appointmentDate: apt.scheduledDate,
      session,
      queueNumber: ticket?.queueNumber || 'P-001',
      ticketStatus: ticket?.status || 'waiting',
      status: entityStatus,
      visitType:
        apt.visitType === 'follow_up' ? 'Kontrol Ulang' : 'Pemeriksaan Baru',
      complaint: apt.complaint || null,
      cancellationReason: apt.cancelReason || null,
      calledAt: ticket?.calledAt ? new Date(ticket.calledAt) : null,
      completedAt: apt.completedAt ? new Date(apt.completedAt) : null,
      createdAt: new Date(apt.createdAt),
      updatedAt: new Date(apt.updatedAt),
      version: generateEntityVersion(apt.updatedAt),
    };
  }

  async create(
    data: Omit<AppointmentEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AppointmentEntity> {
    const bookingCode = `BOOK-${Date.now().toString(36).toUpperCase()}-${Math.floor(
      Math.random() * 1000,
    )}`;

    const startTime =
      data.session === 'SIANG'
        ? '13:00:00'
        : data.session === 'MALAM'
          ? '18:00:00'
          : '08:00:00';
    const endTime =
      data.session === 'SIANG'
        ? '17:00:00'
        : data.session === 'MALAM'
          ? '21:00:00'
          : '12:00:00';

    let room: typeof clinicRooms.$inferSelect | undefined;
    if (data.poliklinikId) {
      room = await this.db.query.clinicRooms.findFirst({
        where: eq(clinicRooms.unitId, data.poliklinikId),
      });
    }

    let practitionerId: string | null = null;
    if (data.staffId) {
      const prac = await this.db.query.practitioners.findFirst({
        where: or(
          eq(practitioners.id, data.staffId),
          eq(practitioners.staffProfileId, data.staffId),
        ),
      });
      practitionerId = prac ? prac.id : data.staffId;
    }

    const [apt] = await this.db
      .insert(appointments)
      .values({
        bookingCode,
        patientId: data.patientId,
        practitionerId: practitionerId || null,
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

    const [ticket] = await this.db
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

    const fullApt = await this.findById(apt.id);
    return fullApt || this.mapDbToEntity(apt, ticket, data.poliklinikId);
  }

  async findById(id: string): Promise<AppointmentEntity | null> {
    const apt = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, id),
      with: {
        queueTickets: true,
        patientProfile: true,
        clinicService: true,
        clinicRoom: {
          with: {
            clinicUnit: true,
          },
        },
        practitioner: {
          with: {
            staffProfile: true,
          },
        },
      },
    });
    if (!apt) return null;
    return this.mapDbToEntity(apt, apt.queueTickets?.[0]);
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
        clinicRoom: {
          with: {
            clinicUnit: true,
          },
        },
        practitioner: {
          with: {
            staffProfile: true,
          },
        },
      },
    });

    let results = records.map((apt) =>
      this.mapDbToEntity(apt, apt.queueTickets?.[0]),
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
            clinicRoom: { with: { clinicUnit: true } },
            practitioner: { with: { staffProfile: true } },
            queueTickets: true,
          },
        },
      },
    });
    if (!ticket || !ticket.appointment) return null;
    return this.mapDbToEntity(ticket.appointment, ticket);
  }

  async findByPatientId(patientId: string): Promise<AppointmentEntity[]> {
    const records = await this.db.query.appointments.findMany({
      where: eq(appointments.patientId, patientId),
      orderBy: [desc(appointments.scheduledDate)],
      with: {
        queueTickets: true,
        patientProfile: true,
        clinicService: true,
        clinicRoom: { with: { clinicUnit: true } },
        practitioner: { with: { staffProfile: true } },
      },
    });
    return records.map((apt) => this.mapDbToEntity(apt, apt.queueTickets?.[0]));
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
        clinicRoom: { with: { clinicUnit: true } },
        patientProfile: true,
        clinicService: true,
        practitioner: { with: { staffProfile: true } },
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
          const hour = parseInt(
            (apt.scheduledStartTime || '08:00').slice(0, 2),
            10,
          );
          const aptSession =
            hour >= 18 ? 'MALAM' : hour >= 13 ? 'SIANG' : 'PAGI';
          if (aptSession !== session) return false;
        }
        return true;
      })
      .map((apt) =>
        this.mapDbToEntity(apt, apt.queueTickets?.[0], poliklinikId),
      );
  }

  async findDisplayQueue(date: string, poliklinikId?: string): Promise<any> {
    const dailyAppointments = await this.findDailyQueue(
      poliklinikId || '',
      date,
    );

    const currentlyCalled = dailyAppointments.find(
      (a) => a.status === 'SEDANG_DIPERIKSA',
    );
    const waitingList = dailyAppointments.filter(
      (a) => a.status === 'MENUNGGU' || a.status === 'SUDAH_BUAT_JANJI',
    );
    const completedList = dailyAppointments.filter(
      (a) => a.status === 'SELESAI',
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
            calledAt: currentlyCalled.calledAt,
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
    const existing = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, id),
    });
    if (!existing) return null;

    if (
      expectedVersion !== undefined &&
      expectedVersion !== null &&
      expectedVersion !== ''
    ) {
      const currentVersion = generateEntityVersion(existing.updatedAt);
      if (
        !matchesVersion(expectedVersion, currentVersion, existing.updatedAt)
      ) {
        throw new PreconditionFailedException(
          currentVersion,
          expectedVersion,
          `Precondition failed: Appointment with ID ${id} has been modified since version "${expectedVersion}". Current version is "${currentVersion}".`,
        );
      }
    }

    let dbStatus: typeof appointments.$inferSelect.status = 'booked';
    let ticketStatus: typeof queueTickets.$inferSelect.status = 'waiting';
    const nowStr = new Date().toISOString();

    const updateApt: Record<string, any> = {
      updatedAt: nowStr,
    };
    const updateTicket: Record<string, any> = {
      updatedAt: nowStr,
    };

    if (status === 'SUDAH_DATANG' || status === 'MENUNGGU') {
      dbStatus = 'waiting';
      ticketStatus = 'waiting';
      updateApt.status = dbStatus;
      updateTicket.status = ticketStatus;
    } else if (status === 'SEDANG_DIPERIKSA') {
      dbStatus = 'in_service';
      ticketStatus = 'in_service';
      updateApt.status = dbStatus;
      updateApt.startedAt = nowStr;
      if (staffId) {
        const prac = await this.db.query.practitioners.findFirst({
          where: or(
            eq(practitioners.id, staffId),
            eq(practitioners.staffProfileId, staffId),
          ),
        });
        updateApt.practitionerId = prac ? prac.id : staffId;
      }
      updateTicket.status = ticketStatus;
      updateTicket.calledAt = nowStr;
      updateTicket.startedAt = nowStr;
    } else if (status === 'SELESAI') {
      dbStatus = 'completed';
      ticketStatus = 'completed';
      updateApt.status = dbStatus;
      updateApt.completedAt = nowStr;
      updateTicket.status = ticketStatus;
      updateTicket.completedAt = nowStr;
    } else if (status === 'BATAL') {
      dbStatus = 'cancelled';
      ticketStatus = 'cancelled';
      updateApt.status = dbStatus;
      updateApt.cancelledAt = nowStr;
      if (cancellationReason) {
        updateApt.cancelReason = cancellationReason;
      }
      updateTicket.status = ticketStatus;
    }

    const whereConditions = [eq(appointments.id, id)];
    if (
      expectedVersion !== undefined &&
      expectedVersion !== null &&
      expectedVersion !== ''
    ) {
      whereConditions.push(eq(appointments.updatedAt, existing.updatedAt));
    }

    const [updatedApt] = await this.db
      .update(appointments)
      .set(updateApt)
      .where(and(...whereConditions))
      .returning();

    if (!updatedApt) {
      if (
        expectedVersion !== undefined &&
        expectedVersion !== null &&
        expectedVersion !== ''
      ) {
        const latest = await this.db.query.appointments.findFirst({
          where: eq(appointments.id, id),
        });
        if (latest) {
          const latestVersion = generateEntityVersion(latest.updatedAt);
          throw new ConcurrentModificationConflictException(
            latestVersion,
            `Concurrent modification detected: Appointment with ID ${id} was modified by another transaction. Current version is "${latestVersion}".`,
          );
        }
      }
      return null;
    }

    const [updatedTicket] = await this.db
      .update(queueTickets)
      .set(updateTicket)
      .where(eq(queueTickets.appointmentId, id))
      .returning();

    return this.findById(id);
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
      'BATAL',
      undefined,
      'Dihapus oleh pengguna',
    );
    return updated !== null;
  }
}
