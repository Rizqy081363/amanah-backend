import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, or, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  clinicServices,
  practitioners,
  queueTickets,
} from '../../../../database/schema';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { AppointmentRepository } from '../../domain/repositories/appointment.repository';

@Injectable()
export class AppointmentDrizzleRepository implements AppointmentRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapDbToEntity(
    apt: typeof appointments.$inferSelect,
    ticket?: typeof queueTickets.$inferSelect | null,
    poliklinikId?: string,
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

    return {
      id: apt.id,
      patientId: apt.patientId,
      poliklinikId: poliklinikId || '',
      layananId: apt.serviceId,
      staffId: apt.practitionerId || null,
      appointmentDate: apt.scheduledDate,
      session,
      queueNumber: ticket?.queueNumber || 'P-001',
      status: entityStatus,
      visitType:
        apt.visitType === 'follow_up' ? 'Kontrol Ulang' : 'Pemeriksaan Baru',
      complaint: apt.complaint || null,
      calledAt: ticket?.calledAt ? new Date(ticket.calledAt) : null,
      completedAt: apt.completedAt ? new Date(apt.completedAt) : null,
      createdAt: new Date(apt.createdAt),
      updatedAt: new Date(apt.updatedAt),
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

    return this.mapDbToEntity(apt, ticket, data.poliklinikId);
  }

  async findById(id: string): Promise<AppointmentEntity | null> {
    const apt = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, id),
      with: {
        queueTickets: true,
      },
    });
    if (!apt) return null;
    return this.mapDbToEntity(apt, apt.queueTickets?.[0]);
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
        appointment: true,
      },
    });
    if (!ticket || !ticket.appointment) return null;
    return this.mapDbToEntity(ticket.appointment, ticket);
  }

  async findByPatientId(patientId: string): Promise<AppointmentEntity[]> {
    const records = await this.db.query.appointments.findMany({
      where: eq(appointments.patientId, patientId),
      with: {
        queueTickets: true,
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
        clinicRoom: true,
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

  async updateStatus(
    id: string,
    status: AppointmentEntity['status'],
    staffId?: string,
  ): Promise<AppointmentEntity | null> {
    let dbStatus: typeof appointments.$inferSelect.status = 'booked';
    let ticketStatus: typeof queueTickets.$inferSelect.status = 'waiting';
    const nowStr = new Date().toISOString();

    const updateApt: Record<string, any> = {
      updatedAt: nowStr,
    };
    const updateTicket: Record<string, any> = {
      updatedAt: nowStr,
    };

    if (status === 'SEDANG_DIPERIKSA') {
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
      updateTicket.status = ticketStatus;
    }

    const [updatedApt] = await this.db
      .update(appointments)
      .set(updateApt)
      .where(eq(appointments.id, id))
      .returning();

    if (!updatedApt) return null;

    const [updatedTicket] = await this.db
      .update(queueTickets)
      .set(updateTicket)
      .where(eq(queueTickets.appointmentId, id))
      .returning();

    return this.mapDbToEntity(updatedApt, updatedTicket);
  }

  async getNextQueueIndex(
    poliklinikId: string,
    date: string,
    _session: string,
  ): Promise<number> {
    const [result] = await this.db
      .select({ val: count() })
      .from(queueTickets)
      .where(eq(queueTickets.queueDate, date));

    return Number(result?.val || 0) + 1;
  }
}
