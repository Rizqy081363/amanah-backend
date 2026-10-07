import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { appointmentCheckIns } from '../../../../database/schema/amanah.schema';
import type {
  AppointmentCheckInRepositoryPort,
  CreateCheckInRecordInput,
} from '../../application/ports/appointment-check-in.repository.port';
import type { AppointmentCheckInEntity } from '../../domain/entities/appointment-check-in.entity';

@Injectable()
export class AppointmentCheckInDrizzleRepository
  implements AppointmentCheckInRepositoryPort
{
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private toEntity(
    record: typeof appointmentCheckIns.$inferSelect,
  ): AppointmentCheckInEntity {
    return {
      id: record.id,
      appointmentId: record.appointmentId,
      token: record.token,
      manualCode: record.manualCode,
      expiresAt: new Date(record.expiresAt),
      isUsed: record.isUsed,
      usedAt: record.usedAt ? new Date(record.usedAt) : null,
      usedByUserId: record.usedByUserId,
      createdBy: record.createdBy,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    };
  }

  async createCheckIn(
    input: CreateCheckInRecordInput,
  ): Promise<AppointmentCheckInEntity> {
    const [record] = await this.db
      .insert(appointmentCheckIns)
      .values({
        appointmentId: input.appointmentId,
        token: input.token,
        manualCode: input.manualCode,
        expiresAt: input.expiresAt.toISOString(),
        createdBy: input.createdBy || null,
      })
      .returning();

    return this.toEntity(record);
  }

  async findActiveByAppointmentId(
    appointmentId: string,
  ): Promise<AppointmentCheckInEntity | null> {
    const nowIso = new Date().toISOString();
    const [record] = await this.db
      .select()
      .from(appointmentCheckIns)
      .where(
        and(
          eq(appointmentCheckIns.appointmentId, appointmentId),
          eq(appointmentCheckIns.isUsed, false),
          gt(appointmentCheckIns.expiresAt, nowIso),
        ),
      )
      .orderBy(desc(appointmentCheckIns.createdAt))
      .limit(1);

    return record ? this.toEntity(record) : null;
  }

  async findByToken(token: string): Promise<AppointmentCheckInEntity | null> {
    const [record] = await this.db
      .select()
      .from(appointmentCheckIns)
      .where(eq(appointmentCheckIns.token, token))
      .limit(1);

    return record ? this.toEntity(record) : null;
  }

  async findByManualCode(
    manualCode: string,
  ): Promise<AppointmentCheckInEntity | null> {
    const cleanedCode = manualCode.trim().toUpperCase();
    const [record] = await this.db
      .select()
      .from(appointmentCheckIns)
      .where(
        and(
          eq(appointmentCheckIns.manualCode, cleanedCode),
          eq(appointmentCheckIns.isUsed, false),
        ),
      )
      .orderBy(desc(appointmentCheckIns.createdAt))
      .limit(1);

    return record ? this.toEntity(record) : null;
  }

  async markAsUsed(
    id: string,
    usedByUserId?: string | null,
    usedAt: Date = new Date(),
  ): Promise<void> {
    await this.db
      .update(appointmentCheckIns)
      .set({
        isUsed: true,
        usedAt: usedAt.toISOString(),
        usedByUserId: usedByUserId || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(appointmentCheckIns.id, id));
  }

  async invalidateExistingTokens(appointmentId: string): Promise<void> {
    await this.db
      .update(appointmentCheckIns)
      .set({
        isUsed: true,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(appointmentCheckIns.appointmentId, appointmentId),
          eq(appointmentCheckIns.isUsed, false),
        ),
      );
  }
}
