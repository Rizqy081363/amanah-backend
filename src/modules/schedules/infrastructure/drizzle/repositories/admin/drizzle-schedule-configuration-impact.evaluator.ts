import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  doctorAssignments,
  masterDays,
  sessionDefs,
} from '@database/schema';
import {
  EvaluateScheduleImpactDto,
  ScheduleConfigurationImpactResultDto,
  UpdateSessionDefDto,
  UpdateWeeklyTemplateItemDto,
} from '@modules/schedules/presentation/dto/admin-schedule-configuration.dto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';

@Injectable()
export class DrizzleScheduleConfigurationImpactEvaluator {
  private readonly activeStatuses = [
    'booked',
    'checked_in',
    'waiting',
    'in_service',
  ] as const;

  constructor(@Inject(DRIZZLE_SOURCE) private readonly db: DrizzleDatabase) {}

  async evaluate(
    dto: EvaluateScheduleImpactDto,
  ): Promise<ScheduleConfigurationImpactResultDto> {
    const affectedDoctorIds = new Set<string>();
    const warnings: string[] = [];
    const todayStr = new Date().toISOString().slice(0, 10);

    // 1. Evaluasi penonaktifan shift master (sessionDefs)
    const sessionApptCount = await this.evaluateSessionDefsImpact(
      dto.sessionDefs,
      todayStr,
      affectedDoctorIds,
      warnings,
    );

    // 2. Evaluasi penonaktifan template mingguan (weeklyTemplates)
    const templateApptCount = await this.evaluateWeeklyTemplatesImpact(
      dto.weeklyTemplates,
      todayStr,
      affectedDoctorIds,
      warnings,
    );

    // 3. Evaluasi penonaktifan hari operasional klinik (operatingDays)
    const operatingDayApptCount = await this.evaluateOperatingDaysImpact(
      dto.operatingDays,
      todayStr,
      affectedDoctorIds,
      warnings,
    );

    const affectedAppointmentsCount =
      sessionApptCount + templateApptCount + operatingDayApptCount;
    const affectedDoctorsCount = affectedDoctorIds.size;

    let severity: 'NONE' | 'LOW' | 'HIGH' = 'NONE';
    if (affectedAppointmentsCount > 0 || affectedDoctorsCount > 0) {
      severity = 'HIGH';
    } else if (warnings.length > 0) {
      severity = 'LOW';
    }

    return {
      severity,
      affectedDoctorsCount,
      affectedAppointmentsCount,
      warnings,
    };
  }

  /**
   * Evaluator Atomik: Shift Operasional Master
   */
  private async evaluateSessionDefsImpact(
    sessionDefsList: UpdateSessionDefDto[] | undefined,
    todayStr: string,
    affectedDoctorIds: Set<string>,
    warnings: string[],
  ): Promise<number> {
    if (!sessionDefsList || sessionDefsList.length === 0) return 0;
    const deactivating = sessionDefsList.filter((def) => def.isActive === false);
    let count = 0;

    for (const targetDef of deactivating) {
      const [dbDef] = await this.db
        .select()
        .from(sessionDefs)
        .where(eq(sessionDefs.id, targetDef.id))
        .limit(1);

      if (!dbDef) continue;

      const assignedDocs = await this.db
        .select({ doctorId: doctorAssignments.doctorId })
        .from(doctorAssignments)
        .where(
          and(
            eq(doctorAssignments.sessionId, targetDef.id),
            eq(doctorAssignments.isActive, true),
          ),
        );

      for (const doc of assignedDocs) {
        affectedDoctorIds.add(doc.doctorId);
      }

      const docIds = assignedDocs.map((doc) => doc.doctorId);
      let apptCount = 0;
      if (docIds.length > 0) {
        const [result] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(appointments)
          .where(
            and(
              inArray(appointments.practitionerId, docIds),
              gte(appointments.scheduledDate, todayStr),
              gte(appointments.scheduledStartTime, dbDef.defaultStartsAt),
              lt(appointments.scheduledStartTime, dbDef.defaultEndsAt),
              inArray(appointments.status, this.activeStatuses as any),
            ),
          );
        apptCount = result?.count ?? 0;
      }
      count += apptCount;

      const shiftName = dbDef.code;
      if (assignedDocs.length > 0 || apptCount > 0) {
        const msg =
          apptCount > 0
            ? `Shift "${shiftName}": Terdapat ${apptCount} janji temu pasien aktif yang akan terdampak.`
            : `Penonaktifan shift "${shiftName}" akan menutup jadwal seluruh dokter pada shift ini.`;
        warnings.push(msg);
      }
    }

    return count;
  }

  /**
   * Evaluator Atomik: Template Mingguan
   */
  private async evaluateWeeklyTemplatesImpact(
    weeklyTemplatesList: UpdateWeeklyTemplateItemDto[] | undefined,
    todayStr: string,
    affectedDoctorIds: Set<string>,
    warnings: string[],
  ): Promise<number> {
    if (!weeklyTemplatesList || weeklyTemplatesList.length === 0) return 0;
    const deactivating = weeklyTemplatesList.filter((tpl) => tpl.isActive === false);
    let count = 0;

    for (const targetTpl of deactivating) {
      const [dayInfo] = await this.db
        .select()
        .from(masterDays)
        .where(eq(masterDays.dow, targetTpl.dow))
        .limit(1);

      const [dbDef] = await this.db
        .select()
        .from(sessionDefs)
        .where(eq(sessionDefs.id, targetTpl.sessionId))
        .limit(1);

      const dayLabel = dayInfo?.nameId ?? `Hari ${targetTpl.dow}`;
      const shiftLabel = dbDef?.code;

      const assignedDayDocs = await this.db
        .select({ doctorId: doctorAssignments.doctorId })
        .from(doctorAssignments)
        .where(
          and(
            eq(doctorAssignments.sessionId, targetTpl.sessionId),
            eq(doctorAssignments.isActive, true),
            sql`(${doctorAssignments.dow} IS NULL OR ${doctorAssignments.dow} = ${targetTpl.dow})`,
          ),
        );

      for (const doc of assignedDayDocs) {
        affectedDoctorIds.add(doc.doctorId);
      }

      if (dbDef) {
        const [result] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(appointments)
          .where(
            and(
              gte(appointments.scheduledDate, todayStr),
              sql`EXTRACT(DOW FROM ${appointments.scheduledDate}::date) = ${targetTpl.dow}`,
              inArray(appointments.status, this.activeStatuses as any),
            ),
          );

        const apptCount = result?.count ?? 0;
        count += apptCount;

        if (assignedDayDocs.length > 0 || apptCount > 0) {
          const msg =
            apptCount > 0
              ? `Jadwal ${dayLabel} (${shiftLabel}): Terdapat ${apptCount} janji temu pasien aktif yang akan ditutup.`
              : `Jadwal praktik dokter pada ${dayLabel} (${shiftLabel}) akan dinonaktifkan.`;
          warnings.push(msg);
        }
      }
    }

    return count;
  }

  /**
   * Evaluator Atomik: Hari Operasional Klinik
   */
  private async evaluateOperatingDaysImpact(
    operatingDaysList: Array<{ dow: number; isActive: boolean }> | undefined,
    todayStr: string,
    affectedDoctorIds: Set<string>,
    warnings: string[],
  ): Promise<number> {
    if (!operatingDaysList || operatingDaysList.length === 0) return 0;
    const deactivating = operatingDaysList.filter((d) => d.isActive === false);
    let count = 0;

    for (const targetDay of deactivating) {
      const [dayInfo] = await this.db
        .select()
        .from(masterDays)
        .where(eq(masterDays.dow, targetDay.dow))
        .limit(1);

      const dayLabel = dayInfo?.nameId ?? `Hari ${targetDay.dow}`;

      const assignedDayDocs = await this.db
        .select({ doctorId: doctorAssignments.doctorId })
        .from(doctorAssignments)
        .where(
          and(
            eq(doctorAssignments.isActive, true),
            sql`(${doctorAssignments.dow} IS NULL OR ${doctorAssignments.dow} = ${targetDay.dow})`,
          ),
        );

      for (const doc of assignedDayDocs) {
        affectedDoctorIds.add(doc.doctorId);
      }

      const [result] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(appointments)
        .where(
          and(
            gte(appointments.scheduledDate, todayStr),
            sql`EXTRACT(DOW FROM ${appointments.scheduledDate}::date) = ${targetDay.dow}`,
            inArray(appointments.status, this.activeStatuses as any),
          ),
        );

      const apptCount = result?.count ?? 0;
      count += apptCount;

      if (assignedDayDocs.length > 0 || apptCount > 0) {
        const detailMsg =
          apptCount > 0
            ? `Hari ${dayLabel}: Terdapat ${apptCount} pasien yang sudah membuat janji / menunggu pada hari ini.`
            : `Penonaktifan ${dayLabel} akan menutup seluruh operasional klinik dan jadwal dokter pada hari ini.`;
        warnings.push(detailMsg);
      }
    }

    return count;
  }
}
