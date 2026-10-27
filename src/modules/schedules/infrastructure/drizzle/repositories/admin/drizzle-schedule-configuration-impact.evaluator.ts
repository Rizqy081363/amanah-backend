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
} from '@modules/schedules/presentation/dto/admin-schedule-configuration.dto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';

@Injectable()
export class DrizzleScheduleConfigurationImpactEvaluator {
  constructor(@Inject(DRIZZLE_SOURCE) private readonly db: DrizzleDatabase) {}

  async evaluate(
    dto: EvaluateScheduleImpactDto,
  ): Promise<ScheduleConfigurationImpactResultDto> {
    const affectedDoctorIds = new Set<string>();
    let affectedAppointmentsCount = 0;
    const warnings: string[] = [];

    const todayStr = new Date().toISOString().slice(0, 10);
    const activeStatuses = ['booked', 'checked_in', 'waiting'] as const;

    // 1. Evaluasi penonaktifan shift operasional master (sessionDefs)
    if (dto.sessionDefs && dto.sessionDefs.length > 0) {
      const deactivatingDefs = dto.sessionDefs.filter(
        (def) => def.isActive === false,
      );

      for (const targetDef of deactivatingDefs) {
        const [dbDef] = await this.db
          .select()
          .from(sessionDefs)
          .where(eq(sessionDefs.id, targetDef.id))
          .limit(1);

        if (!dbDef) continue;

        // Hitung dokter yang terikat pada shift ini
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

        // Hitung janji temu pasien aktif di masa depan pada shift ini
        const docIds = assignedDocs.map((doc) => doc.doctorId);
        let apptCount = 0;
        if (docIds.length > 0) {
          const apptCountResult = await this.db
            .select({ count: sql<number>`count(*)::int` })
            .from(appointments)
            .where(
              and(
                inArray(appointments.practitionerId, docIds),
                gte(appointments.scheduledDate, todayStr),
                gte(appointments.scheduledStartTime, dbDef.defaultStartsAt),
                lt(appointments.scheduledStartTime, dbDef.defaultEndsAt),
                inArray(appointments.status, activeStatuses as any),
              ),
            );
          apptCount = apptCountResult[0]?.count ?? 0;
        }
        affectedAppointmentsCount += apptCount;

        const shiftName = dbDef.code;

        if (assignedDocs.length > 0 || apptCount > 0) {
          warnings.push(
            `Penonaktifan shift "${shiftName}" akan menutup jadwal seluruh dokter pada shift ini.`,
          );
        }
      }
    }

    // 2. Evaluasi penonaktifan template mingguan (weeklyTemplates)
    if (dto.weeklyTemplates && dto.weeklyTemplates.length > 0) {
      const deactivatingTemplates = dto.weeklyTemplates.filter(
        (tpl) => tpl.isActive === false,
      );

      for (const targetTpl of deactivatingTemplates) {
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

        // Hitung dokter yang terikat pada jadwal hari dan shift ini
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

        // Hitung janji temu aktif di masa depan pada hari spesifik ini
        if (dbDef) {
          const apptCountResult = await this.db
            .select({ count: sql<number>`count(*)::int` })
            .from(appointments)
            .where(
              and(
                gte(appointments.scheduledDate, todayStr),
                sql`EXTRACT(DOW FROM ${appointments.scheduledDate}::date) = ${targetTpl.dow}`,
                inArray(appointments.status, activeStatuses as any),
              ),
            );

          const apptCount = apptCountResult[0]?.count ?? 0;
          affectedAppointmentsCount += apptCount;

          if (assignedDayDocs.length > 0 || apptCount > 0) {
            warnings.push(
              `Jadwal praktik dokter pada ${dayLabel} (${shiftLabel}) akan dinonaktifkan.`,
            );
          }
        }
      }
    }

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
}
