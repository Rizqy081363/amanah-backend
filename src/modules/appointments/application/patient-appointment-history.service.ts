import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  appointmentCallAttempts,
  appointments,
  childImmunizationIntakes,
  clinicServices,
  maternalHealthIntakes,
  medicalIntakeSubmissions,
  practitioners,
} from '../../../database/schema';
import { PatientAppointmentHistoryQueryDto } from '../presentation/dto/patient-appointment-history-query.dto';

export interface HistoricalAppointmentItem {
  id: string;
  bookingCode: string;
  status: string;
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
  hasAssociatedForm: boolean;
  associatedFormType?: 'maternal' | 'immunization' | 'general' | null;
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

    const conditions = [eq(appointments.patientId, patientProfileId)];

    if (query.status) {
      conditions.push(eq(appointments.status, query.status));
    }
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

    const appointmentIds = rows.map((r) => r.id);
    const attemptCounts = new Map<string, number>();
    const formInfoMap = new Map<
      string,
      { type: 'maternal' | 'immunization' | 'general' }
    >();

    if (appointmentIds.length > 0) {
      const [counts, maternalList, immunizationList, generalList] =
        await Promise.all([
          this.db
            .select({
              appointmentId: appointmentCallAttempts.appointmentId,
              count: sql<number>`count(*)::int`,
            })
            .from(appointmentCallAttempts)
            .where(
              inArray(appointmentCallAttempts.appointmentId, appointmentIds),
            )
            .groupBy(appointmentCallAttempts.appointmentId),
          this.db
            .select({ appointmentId: maternalHealthIntakes.appointmentId })
            .from(maternalHealthIntakes)
            .where(
              inArray(maternalHealthIntakes.appointmentId, appointmentIds),
            ),
          this.db
            .select({ appointmentId: childImmunizationIntakes.appointmentId })
            .from(childImmunizationIntakes)
            .where(
              inArray(childImmunizationIntakes.appointmentId, appointmentIds),
            ),
          this.db
            .select({ appointmentId: medicalIntakeSubmissions.appointmentId })
            .from(medicalIntakeSubmissions)
            .where(
              inArray(medicalIntakeSubmissions.appointmentId, appointmentIds),
            ),
        ]);

      for (const row of counts) {
        attemptCounts.set(row.appointmentId, row.count);
      }
      for (const m of maternalList) {
        if (m.appointmentId) {
          formInfoMap.set(m.appointmentId, { type: 'maternal' });
        }
      }
      for (const im of immunizationList) {
        if (im.appointmentId) {
          formInfoMap.set(im.appointmentId, { type: 'immunization' });
        }
      }
      for (const g of generalList) {
        if (g.appointmentId && !formInfoMap.has(g.appointmentId)) {
          formInfoMap.set(g.appointmentId, { type: 'general' });
        }
      }
    }

    const data: HistoricalAppointmentItem[] = rows.map((r) => {
      const formInfo = formInfoMap.get(r.id);
      return {
        id: r.id,
        bookingCode: r.bookingCode,
        status: r.status,
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
        hasAssociatedForm: Boolean(formInfo),
        associatedFormType: formInfo?.type ?? null,
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }
}
