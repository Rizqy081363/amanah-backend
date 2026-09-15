import { Injectable, Inject } from '@nestjs/common';
import { eq, and, sql, count } from 'drizzle-orm';
import { AppointmentRepository } from '../../domain/repositories/appointment.repository';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { kunjunganPasien } from '../../../../database/schema';

@Injectable()
export class AppointmentDrizzleRepository implements AppointmentRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async create(
    data: Omit<AppointmentEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AppointmentEntity> {
    const [record] = await this.db
      .insert(kunjunganPasien)
      .values({
        patientId: data.patientId,
        poliklinikId: data.poliklinikId,
        layananId: data.layananId,
        staffId: data.staffId || null,
        appointmentDate: data.appointmentDate,
        session: data.session,
        queueNumber: data.queueNumber,
        status: data.status,
        visitType: data.visitType,
        complaint: data.complaint,
      })
      .returning();

    return record as AppointmentEntity;
  }

  async findById(id: string): Promise<AppointmentEntity | null> {
    const record = await this.db.query.kunjunganPasien.findFirst({
      where: eq(kunjunganPasien.id, id),
    });
    return (record as AppointmentEntity) || null;
  }

  async findByQueueNumber(
    queueNumber: string,
    date: string,
  ): Promise<AppointmentEntity | null> {
    const record = await this.db.query.kunjunganPasien.findFirst({
      where: and(
        eq(kunjunganPasien.queueNumber, queueNumber),
        eq(kunjunganPasien.appointmentDate, date),
      ),
    });
    return (record as AppointmentEntity) || null;
  }

  async findByPatientId(patientId: string): Promise<AppointmentEntity[]> {
    const records = await this.db.query.kunjunganPasien.findMany({
      where: eq(kunjunganPasien.patientId, patientId),
    });
    return records as AppointmentEntity[];
  }

  async findDailyQueue(
    poliklinikId: string,
    date: string,
    session?: string,
  ): Promise<AppointmentEntity[]> {
    const conditions = [
      eq(kunjunganPasien.poliklinikId, poliklinikId),
      eq(kunjunganPasien.appointmentDate, date),
    ];

    if (session) {
      conditions.push(eq(kunjunganPasien.session, session as any));
    }

    const records = await this.db.query.kunjunganPasien.findMany({
      where: and(...conditions),
    });
    return records as AppointmentEntity[];
  }

  async updateStatus(
    id: string,
    status: AppointmentEntity['status'],
    staffId?: string,
  ): Promise<AppointmentEntity | null> {
    const updateValues: Record<string, any> = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'SEDANG_DIPERIKSA') {
      updateValues.calledAt = new Date();
      if (staffId) {
        updateValues.staffId = staffId;
      }
    } else if (status === 'SELESAI') {
      updateValues.completedAt = new Date();
    }

    const [updated] = await this.db
      .update(kunjunganPasien)
      .set(updateValues)
      .where(eq(kunjunganPasien.id, id))
      .returning();

    return (updated as AppointmentEntity) || null;
  }

  async getNextQueueIndex(
    poliklinikId: string,
    date: string,
    session: string,
  ): Promise<number> {
    const [result] = await this.db
      .select({ val: count() })
      .from(kunjunganPasien)
      .where(
        and(
          eq(kunjunganPasien.poliklinikId, poliklinikId),
          eq(kunjunganPasien.appointmentDate, date),
          eq(kunjunganPasien.session, session as any),
        ),
      );

    return Number(result?.val || 0) + 1;
  }
}
