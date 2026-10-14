import { ClinicConfigService } from '@common/clinic-config';
import { RedisService } from '@common/redis/redis.service';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicSettings,
  doctorAssignments,
  masterDays,
  sessionDefs,
  sessionSchedules,
} from '@database/schema';
import { ScheduleShiftRegistry } from '@modules/schedules/domain/constants/schedule-shift.constants';
import {
  EvaluateScheduleImpactDto,
  ScheduleConfigurationImpactResultDto,
  UpdateClinicSettingItemDto,
  UpdateScheduleConfigurationBatchDto,
  UpdateSessionDefDto,
  UpdateWeeklyTemplateItemDto,
} from '@modules/schedules/presentation/dto/admin-schedule-configuration.dto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  ClinicSettingCategory,
  ClinicSettingControlType,
  ClinicSettingOptionDescriptor,
  getClinicSettingMetadata,
} from './admin-clinic-setting-metadata';
import { DrizzleScheduleConfigurationImpactEvaluator } from './drizzle-schedule-configuration-impact.evaluator';

export interface CanonicalDayInfo {
  dow: number;
  label: string;
  isActive: boolean;
}

export interface CanonicalSessionDefConfig {
  id: string;
  code: string;
  labelKey: string;
  label: string;
  timeRange: string;
  codePrefix: string;
  sortOrder: number;
  isActive: boolean;
  defaultStartsAt: string;
  defaultEndsAt: string;
}

export interface CanonicalWeeklyTemplateConfig {
  id: string;
  sessionId: string;
  sessionCode: string;
  sessionLabel: string;
  dow: number;
  dowLabel: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  isMasterActive: boolean;
}

export interface CanonicalClinicSettingConfig {
  key: string;
  scopeType: string;
  value: any;
  category: ClinicSettingCategory;
  label: string;
  description: string;
  controlType: ClinicSettingControlType;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: ClinicSettingOptionDescriptor[];
  isAdminFacing: boolean;
}

export interface ScheduleConfigurationData {
  days: CanonicalDayInfo[];
  sessionDefs: CanonicalSessionDefConfig[];
  weeklyTemplates: CanonicalWeeklyTemplateConfig[];
  clinicSettings: CanonicalClinicSettingConfig[];
}

@Injectable()
export class DrizzleAdminScheduleConfigurationRepository {
  private readonly logger = new Logger(
    DrizzleAdminScheduleConfigurationRepository.name,
  );

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly clinicConfigService: ClinicConfigService,
    private readonly impactEvaluator: DrizzleScheduleConfigurationImpactEvaluator,
    @Optional()
    @Inject(RedisService)
    private readonly redisService?: RedisService,
  ) {}

  private async invalidateCaches(): Promise<void> {
    this.clinicConfigService.invalidateCache();
    if (!this.redisService) return;
    try {
      await this.redisService.invalidateTags(
        'schedule',
        'schedule:list',
        'schedule:detail',
        'schedule:patients',
        'booking',
      );
    } catch {
      // Safe fallback when redis is unreachable
    }
  }

  async getConfiguration(): Promise<ScheduleConfigurationData> {
    const [
      rawSessionDefs,
      rawWeeklySchedules,
      rawClinicSettings,
      rawMasterDays,
    ] = await Promise.all([
      this.db.select().from(sessionDefs).orderBy(asc(sessionDefs.sortOrder)),
      this.db
        .select({
          id: sessionSchedules.id,
          sessionId: sessionSchedules.sessionId,
          sessionCode: sessionDefs.code,
          sessionLabelKey: sessionDefs.labelKey,
          dow: sessionSchedules.dow,
          startsAt: sessionSchedules.startsAt,
          endsAt: sessionSchedules.endsAt,
          isActive: sessionSchedules.isActive,
        })
        .from(sessionSchedules)
        .innerJoin(sessionDefs, eq(sessionSchedules.sessionId, sessionDefs.id))
        .orderBy(asc(sessionSchedules.dow), asc(sessionDefs.sortOrder)),
      this.db.select().from(clinicSettings).orderBy(asc(clinicSettings.key)),
      this.db
        .select({
          dow: masterDays.dow,
          label: masterDays.nameId,
          isActive: masterDays.isActive,
        })
        .from(masterDays)
        .orderBy(asc(masterDays.sortOrder)),
    ]);

    const days: CanonicalDayInfo[] = rawMasterDays;

    const sessionDefsConfig: CanonicalSessionDefConfig[] = rawSessionDefs.map(
      (sd) => {
        const descriptor = ScheduleShiftRegistry.find(sd.code);
        const startTimeStr = sd.defaultStartsAt
          ? sd.defaultStartsAt.slice(0, 5)
          : (descriptor?.defaultStartTime ?? '');
        const endTimeStr = sd.defaultEndsAt
          ? sd.defaultEndsAt.slice(0, 5)
          : (descriptor?.defaultEndTime ?? '');
        return {
          id: sd.id,
          code: sd.code,
          labelKey: sd.labelKey,
          label: descriptor?.label ?? sd.code,
          timeRange:
            startTimeStr && endTimeStr ? `${startTimeStr} - ${endTimeStr}` : '',
          codePrefix: sd.codePrefix,
          sortOrder: sd.sortOrder,
          isActive: sd.isActive,
          defaultStartsAt: sd.defaultStartsAt,
          defaultEndsAt: sd.defaultEndsAt,
        };
      },
    );

    const weeklyTemplates: CanonicalWeeklyTemplateConfig[] = [];

    for (const day of days) {
      for (const def of rawSessionDefs) {
        const descriptor = ScheduleShiftRegistry.find(def.code);
        const found = rawWeeklySchedules.find(
          (ws) => ws.dow === day.dow && ws.sessionId === def.id,
        );

        if (found) {
          weeklyTemplates.push({
            id: found.id,
            sessionId: found.sessionId,
            sessionCode: found.sessionCode,
            sessionLabel: descriptor?.label ?? found.sessionCode,
            dow: found.dow,
            dowLabel: day.label,
            startsAt: found.startsAt,
            endsAt: found.endsAt,
            isActive: found.isActive,
            isMasterActive: def.isActive,
          });
        } else {
          weeklyTemplates.push({
            id: '',
            sessionId: def.id,
            sessionCode: def.code,
            sessionLabel: descriptor?.label ?? def.code,
            dow: day.dow,
            dowLabel: day.label,
            startsAt: def.defaultStartsAt,
            endsAt: def.defaultEndsAt,
            isActive: false,
            isMasterActive: def.isActive,
          });
        }
      }
    }

    const clinicSettingsConfig: CanonicalClinicSettingConfig[] =
      rawClinicSettings
        .map((cs) => {
          const meta = getClinicSettingMetadata(cs.key);
          return {
            key: cs.key,
            scopeType: cs.scopeType,
            value: cs.value,
            category: meta.category,
            label: meta.label,
            description: meta.description,
            controlType: meta.controlType,
            unit: meta.unit,
            min: meta.min,
            max: meta.max,
            step: meta.step,
            options: meta.options,
            isAdminFacing: meta.isAdminFacing,
          };
        })
        .filter((item) => item.isAdminFacing);

    return {
      days,
      sessionDefs: sessionDefsConfig,
      weeklyTemplates,
      clinicSettings: clinicSettingsConfig,
    };
  }

  async updateSessionDefs(
    defs: UpdateSessionDefDto[],
    executor: any = this.db,
  ): Promise<void> {
    if (!defs || defs.length === 0) return;
    const now = new Date().toISOString();
    for (const def of defs) {
      await executor
        .update(sessionDefs)
        .set({
          ...(typeof def.isActive === 'boolean' && { isActive: def.isActive }),
          ...(typeof def.sortOrder === 'number' && {
            sortOrder: def.sortOrder,
          }),
          updatedAt: now,
        })
        .where(eq(sessionDefs.id, def.id));
    }
    if (executor === this.db) {
      await this.invalidateCaches();
    }
  }

  async updateWeeklyTemplates(
    templates: UpdateWeeklyTemplateItemDto[],
    executor: any = this.db,
  ): Promise<void> {
    if (!templates || templates.length === 0) return;
    const now = new Date().toISOString();

    const allDefs = await executor
      .select({
        id: sessionDefs.id,
        code: sessionDefs.code,
        isActive: sessionDefs.isActive,
      })
      .from(sessionDefs);
    const defMap = new Map<
      string,
      { id: string; code: string; isActive: boolean }
    >(allDefs.map((d: any) => [d.id, d]));

    for (const item of templates) {
      if (item.isActive) {
        const master = defMap.get(item.sessionId);
        if (master && !master.isActive) {
          throw new BadRequestException(
            `Shift master '${master.code}' sedang nonaktif. Template jadwal mingguan tidak dapat diaktifkan.`,
          );
        }
      }

      if (item.startsAt >= item.endsAt) {
        throw new BadRequestException(
          `Waktu mulai (${item.startsAt}) harus lebih awal dari waktu selesai (${item.endsAt})`,
        );
      }

      const existing =
        item.id && item.id.trim() !== ''
          ? await executor
              .select()
              .from(sessionSchedules)
              .where(eq(sessionSchedules.id, item.id))
              .limit(1)
          : await executor
              .select()
              .from(sessionSchedules)
              .where(
                and(
                  eq(sessionSchedules.sessionId, item.sessionId),
                  eq(sessionSchedules.dow, item.dow),
                ),
              )
              .limit(1);

      if (existing && existing.length > 0) {
        await executor
          .update(sessionSchedules)
          .set({
            startsAt: item.startsAt,
            endsAt: item.endsAt,
            isActive: item.isActive,
            updatedAt: now,
          })
          .where(eq(sessionSchedules.id, existing[0].id));
      } else {
        await executor.insert(sessionSchedules).values({
          sessionId: item.sessionId,
          dow: item.dow,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          isActive: item.isActive,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    if (executor === this.db) {
      await this.invalidateCaches();
    }
  }

  async updateClinicSettings(
    settings: UpdateClinicSettingItemDto[],
    executor: any = this.db,
  ): Promise<void> {
    if (!settings || settings.length === 0) return;
    const now = new Date().toISOString();

    for (const item of settings) {
      await executor
        .update(clinicSettings)
        .set({
          value: item.value,
          updatedAt: now,
        })
        .where(eq(clinicSettings.key, item.key));
    }
    if (executor === this.db) {
      await this.invalidateCaches();
    }
  }

  async batchUpdateConfiguration(
    dto: UpdateScheduleConfigurationBatchDto,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (dto.sessionDefs && dto.sessionDefs.length > 0) {
        await this.updateSessionDefs(dto.sessionDefs, tx);
      }
      if (dto.weeklyTemplates && dto.weeklyTemplates.length > 0) {
        await this.updateWeeklyTemplates(dto.weeklyTemplates, tx);
      }
      if (dto.clinicSettings && dto.clinicSettings.length > 0) {
        await this.updateClinicSettings(dto.clinicSettings, tx);
      }
      if (dto.operatingDays && dto.operatingDays.length > 0) {
        const now = new Date().toISOString();
        for (const item of dto.operatingDays) {
          await tx
            .update(masterDays)
            .set({
              isActive: item.isActive,
              updatedAt: now,
            })
            .where(eq(masterDays.dow, item.dow));
        }
      }
    });
    await this.invalidateCaches();
  }

  async evaluateImpact(
    dto: EvaluateScheduleImpactDto,
  ): Promise<ScheduleConfigurationImpactResultDto> {
    return this.impactEvaluator.evaluate(dto);
  }
}
