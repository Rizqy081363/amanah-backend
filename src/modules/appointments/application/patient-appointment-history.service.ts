import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  appointmentCallAttempts,
  appointments,
  clinicServices,
  practitioners,
} from '../../../database/schema';
import { PatientAppointmentHistoryQueryDto } from '../presentation/dto/patient-appointment-history-query.dto';
import { DB_APPOINTMENT_STATUS } from '../domain/constants/appointment-lifecycle.constants';

export interface HistoricalAppointmentItem {
  id: string;
  bookingCode: string;
  status:
    | typeof DB_APPOINTMENT_STATUS.COMPLETED
    | typeof DB_APPOINTMENT_STATUS.CANCELLED
    | typeof DB_APPOINTMENT_STATUS.NO_SHOW;
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime?: string | null;
  estimatedDurationMinutes?: number;
  poliklinikName?: string | null;
  doctorName?: string | null;
  complaint?: string | null;
  callAttemptsCount: number;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  updatedAt?: string | null;
}

export interface PatientAppointmentHistoryResult {
  data: HistoricalAppointmentItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class PatientAppointmentHistoryService {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async getHistory(
    patientProfileId: string,
    query: PatientAppointmentHistoryQueryDto,
  ): Promise<PatientAppointmentHistoryResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const terminalStatuses = ['completed', 'cancelled', 'no_show'] as const;
    const statusCondition = query.status
      ? eq(appointments.status, query.status)
      : inArray(appointments.status, terminalStatuses as any);

    const conditions = [
      eq(appointments.patientId, patientProfileId),
      statusCondition,
    ];

    if (query.startDate) {
      conditions.push(gte(appointments.scheduledDate, query.startDate));
    }
    if (query.endDate) {
      conditions.push(lte(appointments.scheduledDate, query.endDate));
    }

    const whereClause = and(...conditions);

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(appointments)
      .where(whereClause);

    const total = countResult?.count ?? 0;
    const totalPages = Math.ceil(total / limit);

    if (total === 0) {
      return {
        data: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }

    const rows = await this.db
      .select({
        id: appointments.id,
        bookingCode: appointments.bookingCode,
        status: appointments.status,
        scheduledDate: appointments.scheduledDate,
        scheduledStartTime: appointments.scheduledStartTime,
        scheduledEndTime: appointments.scheduledEndTime,
        complaint: appointments.complaint,
        completedAt: appointments.completedAt,
        cancelledAt: appointments.cancelledAt,
        cancelReason: appointments.cancelReason,
        updatedAt: appointments.updatedAt,
        poliklinikName: clinicServices.name,
        doctorName: practitioners.displayName,
        estimatedDurationMinutes: sql<number>`coalesce(${practitioners.consultationDurationMinutes}, 30)::int`,
      })
      .from(appointments)
      .leftJoin(clinicServices, eq(clinicServices.id, appointments.serviceId))
      .leftJoin(
        practitioners,
        eq(practitioners.id, appointments.practitionerId),
      )
      .where(whereClause)
      .orderBy(
        desc(appointments.scheduledDate),
        desc(appointments.scheduledStartTime),
      )
      .limit(limit)
      .offset(offset);

    // Fetch call attempt counts for the retrieved appointments
    const appointmentIds = rows.map((r) => r.id);
    const attemptCounts = new Map<string, number>();

    if (appointmentIds.length > 0) {
      const counts = await this.db
        .select({
          appointmentId: appointmentCallAttempts.appointmentId,
          count: sql<number>`count(*)::int`,
        })
        .from(appointmentCallAttempts)
        .where(inArray(appointmentCallAttempts.appointmentId, appointmentIds))
        .groupBy(appointmentCallAttempts.appointmentId);

      for (const row of counts) {
        attemptCounts.set(row.appointmentId, row.count);
      }
    }

    const data: HistoricalAppointmentItem[] = rows.map((r) => ({
      id: r.id,
      bookingCode: r.bookingCode,
      status: r.status as 'completed' | 'cancelled' | 'no_show',
      scheduledDate: r.scheduledDate,
      scheduledStartTime: r.scheduledStartTime,
      scheduledEndTime: r.scheduledEndTime,
      estimatedDurationMinutes: r.estimatedDurationMinutes ?? 30,
      poliklinikName: r.poliklinikName,
      doctorName: r.doctorName,
      complaint: r.complaint,
      callAttemptsCount: attemptCounts.get(r.id) ?? 0,
      completedAt: r.completedAt,
      cancelledAt: r.cancelledAt,
      cancelReason: r.cancelReason,
      updatedAt: r.updatedAt,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }
}
