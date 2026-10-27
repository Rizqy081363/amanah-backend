import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import { attendanceQrSessions } from '../../../../../database/schema';
import { QrSessionEntity } from '../../../domain/entities/qr-session.entity';
import { AttendanceMapper } from '../mappers/attendance.mapper';

@Injectable()
export class AttendanceQrDrizzleRepo {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async createQrSession(data: {
    codeHash: string;
    sessionType: 'location_check_in' | 'staff_identity';
    shift: string;
    rotationSeconds: number;
    context: string;
    validFrom: string;
    validUntil: string;
    createdBy?: string | null;
  }): Promise<QrSessionEntity> {
    // Invalidate previous active sessions for this sessionType upon rotation
    await this.db
      .update(attendanceQrSessions)
      .set({ isActive: false })
      .where(
        and(
          eq(attendanceQrSessions.sessionType, data.sessionType),
          eq(attendanceQrSessions.isActive, true),
        ),
      );

    const [created] = await this.db
      .insert(attendanceQrSessions)
      .values({
        codeHash: data.codeHash,
        manualPinHash: data.codeHash,
        sessionType: data.sessionType,
        shift: data.shift as any,
        rotationSeconds: data.rotationSeconds,
        context: data.context,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        isActive: true,
        createdBy: data.createdBy || null,
      })
      .returning();

    return AttendanceMapper.toQrSessionEntity(created);
  }

  async findActiveQrSession(
    sessionType: string = 'location_check_in',
  ): Promise<QrSessionEntity | null> {
    const nowIso = new Date().toISOString();
    const active = await this.db
      .select()
      .from(attendanceQrSessions)
      .where(
        and(
          eq(
            attendanceQrSessions.sessionType,
            sessionType as 'location_check_in' | 'staff_identity',
          ),
          eq(attendanceQrSessions.isActive, true),
          gte(attendanceQrSessions.validUntil, nowIso),
        ),
      )
      .orderBy(desc(attendanceQrSessions.validUntil))
      .limit(1);

    return active.length > 0
      ? AttendanceMapper.toQrSessionEntity(active[0])
      : null;
  }

  async findQrSessionByToken(token: string): Promise<QrSessionEntity | null> {
    const trimmed = token.trim().toUpperCase();
    const nowIso = new Date().toISOString();
    const sessions = await this.db
      .select()
      .from(attendanceQrSessions)
      .where(
        and(
          or(
            eq(attendanceQrSessions.codeHash, trimmed),
            eq(attendanceQrSessions.manualPinHash, trimmed),
          ),
          eq(attendanceQrSessions.isActive, true),
          gte(attendanceQrSessions.validUntil, nowIso),
        ),
      )
      .orderBy(desc(attendanceQrSessions.validUntil))
      .limit(1);

    return sessions.length > 0
      ? AttendanceMapper.toQrSessionEntity(sessions[0])
      : null;
  }
}
