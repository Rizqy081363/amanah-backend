import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  doctorAssignments,
  sessionSchedules,
  staffRosters,
} from '@database/schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

/**
 * Use Case: CascadeScheduleDeactivationUseCase
 * Bertanggung jawab atas aturan bisnis kaskade penonaktifan jadwal:
 * 1. Saat hari operasional dinonaktifkan (tutup), otomatis nonaktifkan template mingguan dan roster staf pada hari tersebut.
 * 2. Saat shift template mingguan dinonaktifkan, otomatis nonaktifkan penugasan staf pada hari & shift terkait.
 */
@Injectable()
export class CascadeScheduleDeactivationUseCase {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  /**
   * Kaskade saat Hari Operasional Klinik dinonaktifkan (tutup):
   * Menonaktifkan session_schedules (template mingguan), doctor_assignments, dan staff_rosters pada DOW terkait.
   */
  async cascadeOperatingDayDeactivation(
    dow: number,
    executor: any = this.db,
  ): Promise<void> {
    const now = new Date().toISOString();

    await executor
      .update(sessionSchedules)
      .set({ isActive: false, updatedAt: now })
      .where(eq(sessionSchedules.dow, dow));

    await executor
      .update(doctorAssignments)
      .set({ isActive: false, updatedAt: now })
      .where(eq(doctorAssignments.dow, dow));

    await executor
      .update(staffRosters)
      .set({ isActive: false, updatedAt: now })
      .where(eq(staffRosters.dow, dow));
  }

  /**
   * Kaskade saat Shift Template Mingguan dinonaktifkan:
   * Menonaktifkan doctor_assignments dan staff_rosters pada (DOW, sessionId) terkait.
   */
  async cascadeWeeklyTemplateDeactivation(
    dow: number,
    sessionId: string,
    executor: any = this.db,
  ): Promise<void> {
    const now = new Date().toISOString();

    await executor
      .update(doctorAssignments)
      .set({ isActive: false, updatedAt: now })
      .where(
        and(
          eq(doctorAssignments.dow, dow),
          eq(doctorAssignments.sessionId, sessionId),
        ),
      );

    await executor
      .update(staffRosters)
      .set({ isActive: false, updatedAt: now })
      .where(
        and(
          eq(staffRosters.dow, dow),
          eq(staffRosters.sessionId, sessionId),
        ),
      );
  }
}
