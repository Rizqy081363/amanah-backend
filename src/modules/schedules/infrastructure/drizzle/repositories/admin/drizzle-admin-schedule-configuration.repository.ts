import { ClinicConfigService } from '@common/clinic-config';
import { RedisService } from '@common/redis/redis.service';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  clinicSettings,
  doctorAssignments,
  masterDays,
  queueTickets,
  sessionDefs,
  sessionSchedules,
} from '@database/schema';
import {
  CreateSessionDefDto,
  EvaluateScheduleImpactDto,
  ScheduleConfigurationImpactResultDto,
  UpdateClinicSettingItemDto,
  UpdateScheduleConfigurationBatchDto,
  UpdateSessionDefDto,
  UpdateSingleSessionDefDto,
  UpdateWeeklyTemplateItemDto,
} from '@modules/schedules/presentation/dto/admin-schedule-configuration.dto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import {
  validateSessionDefsNonOverlap,
  validateWeeklyTemplatesNonOverlap,
} from '@modules/schedules/domain/services/shift-overlap.validator';
import { and, asc, eq } from 'drizzle-orm';
import {
  ClinicSettingCategory,
  ClinicSettingControlType,
  ClinicSettingOptionDescriptor,
  getClinicSettingMetadata,
} from './admin-clinic-setting-metadata';
import { DrizzleScheduleConfigurationImpactEvaluator } from './drizzle-schedule-configuration-impact.evaluator';

interface CanonicalDayInfo {
  dow: number;
  label: string;
  isActive: boolean;
}

interface CanonicalSessionDefConfig {
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
  canonicalStartsAt?: string;
  canonicalEndsAt?: string;
}

interface CanonicalWeeklyTemplateConfig {
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

interface CanonicalClinicSettingConfig {
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
        'schedule:ref',
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
          sessionLabelKey: sessionDefs.code,
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
        const startTimeStr = sd.defaultStartsAt
          ? sd.defaultStartsAt.slice(0, 5)
          : '';
        const endTimeStr = sd.defaultEndsAt
          ? sd.defaultEndsAt.slice(0, 5)
          : '';
        const canonicalLabel = sd.label || sd.code;
        return {
          id: sd.id,
          code: sd.code,
          labelKey: sd.code,
          label: canonicalLabel,
          timeRange:
            startTimeStr && endTimeStr ? `${startTimeStr} - ${endTimeStr}` : '',
          codePrefix: sd.codePrefix,
          sortOrder: sd.sortOrder,
          isActive: sd.isActive,
          defaultStartsAt: sd.defaultStartsAt,
          defaultEndsAt: sd.defaultEndsAt,
          canonicalStartsAt: sd.defaultStartsAt,
          canonicalEndsAt: sd.defaultEndsAt,
        };
      },
    );

    const weeklyTemplates: CanonicalWeeklyTemplateConfig[] = [];

    for (const day of days) {
      for (const def of rawSessionDefs) {
        const found = rawWeeklySchedules.find(
          (ws) => ws.dow === day.dow && ws.sessionId === def.id,
        );

        const sessionLabel = def.label || def.code;

        if (found) {
          weeklyTemplates.push({
            id: found.id,
            sessionId: found.sessionId,
            sessionCode: found.sessionCode,
            sessionLabel: sessionLabel,
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
            sessionLabel: sessionLabel,
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

    // 1. Validasi invariant non-overlap pada seluruh master shift aktif
    const existingDefs = await executor
      .select({
        id: sessionDefs.id,
        code: sessionDefs.code,
        labelKey: sessionDefs.code,
        sortOrder: sessionDefs.sortOrder,
        isActive: sessionDefs.isActive,
        defaultStartsAt: sessionDefs.defaultStartsAt,
        defaultEndsAt: sessionDefs.defaultEndsAt,
      })
      .from(sessionDefs);

    const mergedDefs = existingDefs.map((ed: any) => {
      const incoming = defs.find((d) => d.id === ed.id);
      if (!incoming) {
        return {
          id: ed.id,
          code: ed.code,
          label: ed.code,
          sortOrder: ed.sortOrder,
          isActive: ed.isActive,
          startsAt: ed.defaultStartsAt,
          endsAt: ed.defaultEndsAt,
        };
      }
      return {
        id: ed.id,
        code: ed.code,
        label: ed.code,
        sortOrder:
          typeof incoming.sortOrder === 'number'
            ? incoming.sortOrder
            : ed.sortOrder,
        isActive:
          typeof incoming.isActive === 'boolean'
            ? incoming.isActive
            : ed.isActive,
        startsAt: incoming.defaultStartsAt || ed.defaultStartsAt,
        endsAt: incoming.defaultEndsAt || ed.defaultEndsAt,
      };
    });

    validateSessionDefsNonOverlap(mergedDefs);

    for (const def of defs) {
      const updateData: any = {
        ...(typeof def.isActive === 'boolean' && { isActive: def.isActive }),
        ...(typeof def.sortOrder === 'number' && {
          sortOrder: def.sortOrder,
        }),
        ...(def.defaultStartsAt && { defaultStartsAt: def.defaultStartsAt }),
        ...(def.defaultEndsAt && { defaultEndsAt: def.defaultEndsAt }),
        updatedAt: now,
      };

      await executor
        .update(sessionDefs)
        .set(updateData)
        .where(eq(sessionDefs.id, def.id));

      // Cascade perubahan jam baku master ke seluruh jadwal mingguan (session_schedule)
      const hasTimeUpdate = Boolean(def.defaultStartsAt) || Boolean(def.defaultEndsAt);
      if (hasTimeUpdate) {
        await executor
          .update(sessionSchedules)
          .set({
            ...(def.defaultStartsAt && { startsAt: def.defaultStartsAt }),
            ...(def.defaultEndsAt && { endsAt: def.defaultEndsAt }),
            updatedAt: now,
          })
          .where(eq(sessionSchedules.sessionId, def.id));
      }
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

    // Validasi non-overlap antar shift aktif pada hari yang sama (DOW)
    validateWeeklyTemplatesNonOverlap(
      templates.map((t) => ({
        sessionId: t.sessionId,
        dow: t.dow,
        startsAt: t.startsAt,
        endsAt: t.endsAt,
        isActive: t.isActive,
      })),
    );

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

  async createSessionDef(
    dto: CreateSessionDefDto,
  ): Promise<CanonicalSessionDefConfig> {
    const rawCode =
      dto.code && dto.code.trim() !== ''
        ? dto.code.trim().toLowerCase()
        : dto.label
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');

    // Check duplicate code
    const existing = await this.db
      .select({ id: sessionDefs.id })
      .from(sessionDefs)
      .where(eq(sessionDefs.code, rawCode))
      .limit(1);

    if (existing && existing.length > 0) {
      throw new BadRequestException({
        code: 'DUPLICATE_SESSION_CODE',
        message: `Shift dengan kode '${rawCode}' sudah ada. Silakan gunakan nama atau kode lain.`,
      });
    }

    // Determine sort order
    let sortOrder = dto.sortOrder;
    if (typeof sortOrder !== 'number') {
      const allSorted = await this.db
        .select({ sortOrder: sessionDefs.sortOrder })
        .from(sessionDefs)
        .orderBy(asc(sessionDefs.sortOrder));
      const maxSort =
        allSorted.length > 0
          ? Math.max(...allSorted.map((s) => s.sortOrder))
          : 0;
      sortOrder = maxSort + 1;
    }

    const isActive = dto.isActive ?? true;

    // Validate non-overlap with active shifts
    const existingActive = await this.db
      .select({
        id: sessionDefs.id,
        code: sessionDefs.code,
        label: sessionDefs.label,
        sortOrder: sessionDefs.sortOrder,
        isActive: sessionDefs.isActive,
        defaultStartsAt: sessionDefs.defaultStartsAt,
        defaultEndsAt: sessionDefs.defaultEndsAt,
      })
      .from(sessionDefs)
      .where(eq(sessionDefs.isActive, true));

    const checkList = [
      ...existingActive.map((e) => ({
        id: e.id,
        code: e.code,
        label: e.label || e.code,
        sortOrder: e.sortOrder,
        isActive: e.isActive,
        startsAt: e.defaultStartsAt,
        endsAt: e.defaultEndsAt,
      })),
      {
        id: 'new-shift',
        code: rawCode,
        label: dto.label,
        sortOrder,
        isActive,
        startsAt: dto.defaultStartsAt,
        endsAt: dto.defaultEndsAt,
      },
    ];

    validateSessionDefsNonOverlap(checkList);

    const now = new Date().toISOString();
    let createdId = '';

    await this.db.transaction(async (tx) => {
      const insertRes = await tx
        .insert(sessionDefs)
        .values({
          code: rawCode,
          label: dto.label,
          labelKey: `session.${rawCode}`,
          codePrefix: dto.codePrefix.toUpperCase(),
          sortOrder,
          isActive,
          defaultStartsAt: dto.defaultStartsAt,
          defaultEndsAt: dto.defaultEndsAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: sessionDefs.id });

      createdId = insertRes[0].id;

      // Populate weekly template (session_schedule) for active days
      const days = await tx
        .select({ dow: masterDays.dow })
        .from(masterDays)
        .where(eq(masterDays.isActive, true));

      for (const day of days) {
        await tx.insert(sessionSchedules).values({
          sessionId: createdId,
          dow: day.dow,
          startsAt: dto.defaultStartsAt,
          endsAt: dto.defaultEndsAt,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    await this.invalidateCaches();

    const startTimeStr = dto.defaultStartsAt
      ? dto.defaultStartsAt.slice(0, 5)
      : '';
    const endTimeStr = dto.defaultEndsAt
      ? dto.defaultEndsAt.slice(0, 5)
      : '';

    return {
      id: createdId,
      code: rawCode,
      labelKey: rawCode,
      label: dto.label,
      timeRange:
        startTimeStr && endTimeStr ? `${startTimeStr} - ${endTimeStr}` : '',
      codePrefix: dto.codePrefix.toUpperCase(),
      sortOrder,
      isActive,
      defaultStartsAt: dto.defaultStartsAt,
      defaultEndsAt: dto.defaultEndsAt,
      canonicalStartsAt: dto.defaultStartsAt,
      canonicalEndsAt: dto.defaultEndsAt,
    };
  }

  async updateSingleSessionDef(
    id: string,
    dto: UpdateSingleSessionDefDto,
  ): Promise<CanonicalSessionDefConfig> {
    const existing = await this.db
      .select()
      .from(sessionDefs)
      .where(eq(sessionDefs.id, id))
      .limit(1);

    if (!existing || existing.length === 0) {
      throw new BadRequestException({
        code: 'SESSION_DEF_NOT_FOUND',
        message: 'Definisi shift tidak ditemukan.',
      });
    }

    const current = existing[0];
    const newStartsAt = dto.defaultStartsAt || current.defaultStartsAt;
    const newEndsAt = dto.defaultEndsAt || current.defaultEndsAt;
    const newIsActive =
      typeof dto.isActive === 'boolean' ? dto.isActive : current.isActive;
    const newSortOrder =
      typeof dto.sortOrder === 'number' ? dto.sortOrder : current.sortOrder;
    const newLabel = dto.label || current.label || current.code;
    const newPrefix = (dto.codePrefix || current.codePrefix).toUpperCase();

    // Check overlap if active
    if (newIsActive) {
      const allActive = await this.db
        .select()
        .from(sessionDefs)
        .where(eq(sessionDefs.isActive, true));

      const merged = allActive
        .filter((d) => d.id !== id)
        .map((d) => ({
          id: d.id,
          code: d.code,
          label: d.label || d.code,
          sortOrder: d.sortOrder,
          isActive: true,
          startsAt: d.defaultStartsAt,
          endsAt: d.defaultEndsAt,
        }));

      merged.push({
        id,
        code: current.code,
        label: newLabel,
        sortOrder: newSortOrder,
        isActive: true,
        startsAt: newStartsAt,
        endsAt: newEndsAt,
      });

      validateSessionDefsNonOverlap(merged);
    }

    const now = new Date().toISOString();

    await this.db.transaction(async (tx) => {
      await tx
        .update(sessionDefs)
        .set({
          label: newLabel,
          codePrefix: newPrefix,
          defaultStartsAt: newStartsAt,
          defaultEndsAt: newEndsAt,
          sortOrder: newSortOrder,
          isActive: newIsActive,
          updatedAt: now,
        })
        .where(eq(sessionDefs.id, id));

      const timeChanged =
        newStartsAt !== current.defaultStartsAt ||
        newEndsAt !== current.defaultEndsAt;

      if (timeChanged) {
        await tx
          .update(sessionSchedules)
          .set({
            startsAt: newStartsAt,
            endsAt: newEndsAt,
            updatedAt: now,
          })
          .where(eq(sessionSchedules.sessionId, id));
      }
    });

    await this.invalidateCaches();

    const startTimeStr = newStartsAt ? newStartsAt.slice(0, 5) : '';
    const endTimeStr = newEndsAt ? newEndsAt.slice(0, 5) : '';

    return {
      id,
      code: current.code,
      labelKey: current.code,
      label: newLabel,
      timeRange:
        startTimeStr && endTimeStr ? `${startTimeStr} - ${endTimeStr}` : '',
      codePrefix: newPrefix,
      sortOrder: newSortOrder,
      isActive: newIsActive,
      defaultStartsAt: newStartsAt,
      defaultEndsAt: newEndsAt,
      canonicalStartsAt: newStartsAt,
      canonicalEndsAt: newEndsAt,
    };
  }

  async deleteSessionDef(
    id: string,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await this.db
      .select({
        id: sessionDefs.id,
        label: sessionDefs.label,
        code: sessionDefs.code,
      })
      .from(sessionDefs)
      .where(eq(sessionDefs.id, id))
      .limit(1);

    if (!existing || existing.length === 0) {
      throw new BadRequestException({
        code: 'SESSION_DEF_NOT_FOUND',
        message: 'Shift yang akan dihapus tidak ditemukan.',
      });
    }

    const shift = existing[0];
    const shiftLabel = shift.label || shift.code;

    // Invariant check: Check active doctor assignments
    const activeAssignments = await this.db
      .select({ id: doctorAssignments.id })
      .from(doctorAssignments)
      .where(
        and(
          eq(doctorAssignments.sessionId, id),
          eq(doctorAssignments.isActive, true),
        ),
      )
      .limit(1);

    if (activeAssignments && activeAssignments.length > 0) {
      throw new BadRequestException({
        code: 'SHIFT_IN_USE_BY_DOCTOR',
        message: `Shift '${shiftLabel}' tidak dapat dihapus karena masih ditugaskan pada dokter yang aktif. Silakan nonaktifkan shift atau pindahkan penugasan dokter terlebih dahulu.`,
      });
    }

    // Invariant check: Check active queue tickets
    const activeTickets = await this.db
      .select({ id: queueTickets.id })
      .from(queueTickets)
      .where(eq(queueTickets.sessionId, id))
      .limit(1);

    if (activeTickets && activeTickets.length > 0) {
      throw new BadRequestException({
        code: 'SHIFT_IN_USE_BY_QUEUE',
        message: `Shift '${shiftLabel}' tidak dapat dihapus karena memiliki riwayat atau antrean tiket pasien. Silakan nonaktifkan shift (isActive: false) untuk menjaga integritas data klinis.`,
      });
    }

    await this.db.transaction(async (tx) => {
      // 1. Delete weekly templates for this session
      await tx
        .delete(sessionSchedules)
        .where(eq(sessionSchedules.sessionId, id));
      // 2. Delete the session definition
      await tx.delete(sessionDefs).where(eq(sessionDefs.id, id));
    });

    await this.invalidateCaches();

    return {
      success: true,
      message: `Shift '${shiftLabel}' berhasil dihapus.`,
    };
  }

  async applyPreset(presetName: string): Promise<ScheduleConfigurationData> {
    const PRESETS: Record<
      string,
      Array<{
        code: string;
        label: string;
        codePrefix: string;
        startsAt: string;
        endsAt: string;
        sortOrder: number;
      }>
    > = {
      '2-shifts': [
        {
          code: 'pagi',
          label: 'Sesi Pagi',
          codePrefix: 'P',
          startsAt: '08:00:00',
          endsAt: '14:00:00',
          sortOrder: 1,
        },
        {
          code: 'sore',
          label: 'Sesi Sore',
          codePrefix: 'S',
          startsAt: '14:00:00',
          endsAt: '20:00:00',
          sortOrder: 2,
        },
      ],
      '3-shifts': [
        {
          code: 'pagi',
          label: 'Sesi Pagi',
          codePrefix: 'P',
          startsAt: '07:00:00',
          endsAt: '14:00:00',
          sortOrder: 1,
        },
        {
          code: 'siang',
          label: 'Sesi Siang',
          codePrefix: 'S',
          startsAt: '14:00:00',
          endsAt: '21:00:00',
          sortOrder: 2,
        },
        {
          code: 'malam',
          label: 'Sesi Malam',
          codePrefix: 'M',
          startsAt: '21:00:00',
          endsAt: '24:00:00',
          sortOrder: 3,
        },
      ],
      '4-shifts': [
        {
          code: 'dini_hari',
          label: 'Sesi Dini Hari',
          codePrefix: 'DH',
          startsAt: '00:30:00',
          endsAt: '04:30:00',
          sortOrder: 1,
        },
        {
          code: 'pagi',
          label: 'Sesi Pagi',
          codePrefix: 'P',
          startsAt: '06:00:00',
          endsAt: '12:00:00',
          sortOrder: 2,
        },
        {
          code: 'siang',
          label: 'Sesi Siang',
          codePrefix: 'S',
          startsAt: '14:30:00',
          endsAt: '18:00:00',
          sortOrder: 3,
        },
        {
          code: 'malam',
          label: 'Sesi Malam',
          codePrefix: 'M',
          startsAt: '18:00:00',
          endsAt: '24:00:00',
          sortOrder: 4,
        },
      ],
      custom: [
        {
          code: 'pagi_buta',
          label: 'Sesi Pagi Buta',
          codePrefix: 'PB',
          startsAt: '04:00:00',
          endsAt: '08:00:00',
          sortOrder: 1,
        },
        {
          code: 'layanan_senja',
          label: 'Layanan Senja',
          codePrefix: 'LS',
          startsAt: '16:00:00',
          endsAt: '21:00:00',
          sortOrder: 2,
        },
      ],
    };

    const defs = PRESETS[presetName];
    if (!defs) {
      throw new BadRequestException({
        code: 'INVALID_PRESET',
        message: `Preset '${presetName}' tidak dikenali. Pilihan: ${Object.keys(PRESETS).join(', ')}`,
      });
    }

    await this.db.transaction(async (tx) => {
      // 1. Flush existing schedule data
      await tx.delete(sessionSchedules);
      await tx.delete(sessionDefs);

      // 2. Insert preset definitions
      const created: Array<{ id: string; startsAt: string; endsAt: string }> =
        [];
      const now = new Date().toISOString();

      for (const d of defs) {
        const ins = await tx
          .insert(sessionDefs)
          .values({
            code: d.code,
            label: d.label,
            labelKey: `session.${d.code}`,
            codePrefix: d.codePrefix,
            sortOrder: d.sortOrder,
            isActive: true,
            defaultStartsAt: d.startsAt,
            defaultEndsAt: d.endsAt,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: sessionDefs.id });
        created.push({ id: ins[0].id, startsAt: d.startsAt, endsAt: d.endsAt });
      }

      // 3. Populate session_schedule for active days
      const days = await tx
        .select({ dow: masterDays.dow })
        .from(masterDays)
        .where(eq(masterDays.isActive, true));

      for (const day of days) {
        for (const s of created) {
          await tx.insert(sessionSchedules).values({
            sessionId: s.id,
            dow: day.dow,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    });

    await this.invalidateCaches();
    return this.getConfiguration();
  }
}
