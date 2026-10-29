import { ClinicConfigService } from '@common/clinic-config';
import { RedisService } from '@common/redis/redis.service';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  clinicRooms,
  clinicSettings,
  doctorAssignments,
  leaveRequestSessions,
  masterDays,
  medicalSpecialties,
  practitioners,
  queueCounters,
  queueTickets,
  replacementOpportunities,
  sessionDefs,
  sessionSchedules,
  staffRosters,
} from '@database/schema';
import {
  CreateSessionDefDto,
  DeleteSessionDefDto,
  EvaluateScheduleImpactDto,
  ScheduleConfigurationImpactResultDto,
  SessionDefImpactDoctorDto,
  SessionDefImpactResultDto,
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
  NotFoundException,
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
        label: sessionDefs.label,
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
          label: ed.label,
          sortOrder: ed.sortOrder,
          isActive: ed.isActive,
          startsAt: ed.defaultStartsAt,
          endsAt: ed.defaultEndsAt,
        };
      }
      return {
        id: ed.id,
        code: ed.code,
        label: incoming.label || ed.label,
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

  async getSessionDefById(id: string): Promise<CanonicalSessionDefConfig> {
    const existing = await this.db
      .select({
        id: sessionDefs.id,
        code: sessionDefs.code,
        labelKey: sessionDefs.labelKey,
        label: sessionDefs.label,
        codePrefix: sessionDefs.codePrefix,
        sortOrder: sessionDefs.sortOrder,
        isActive: sessionDefs.isActive,
        defaultStartsAt: sessionDefs.defaultStartsAt,
        defaultEndsAt: sessionDefs.defaultEndsAt,
      })
      .from(sessionDefs)
      .where(eq(sessionDefs.id, id))
      .limit(1);

    if (!existing || existing.length === 0) {
      throw new NotFoundException(`Shift operasional dengan ID '${id}' tidak ditemukan.`);
    }

    const current = existing[0];
    const startTimeStr = current.defaultStartsAt
      ? current.defaultStartsAt.slice(0, 5)
      : '';
    const endTimeStr = current.defaultEndsAt
      ? current.defaultEndsAt.slice(0, 5)
      : '';
    const displayLabel = current.label || current.code;

    return {
      id: current.id,
      code: current.code,
      labelKey: current.code,
      label: displayLabel,
      timeRange:
        startTimeStr && endTimeStr ? `${startTimeStr} - ${endTimeStr}` : '',
      codePrefix: current.codePrefix,
      sortOrder: current.sortOrder,
      isActive: current.isActive,
      defaultStartsAt: current.defaultStartsAt,
      defaultEndsAt: current.defaultEndsAt,
      canonicalStartsAt: current.defaultStartsAt,
      canonicalEndsAt: current.defaultEndsAt,
    };
  }

  async getSessionDefImpact(id: string): Promise<SessionDefImpactResultDto> {
    const existing = await this.db
      .select({
        id: sessionDefs.id,
        code: sessionDefs.code,
        label: sessionDefs.label,
      })
      .from(sessionDefs)
      .where(eq(sessionDefs.id, id))
      .limit(1);

    if (!existing || existing.length === 0) {
      throw new NotFoundException(`Shift operasional dengan ID '${id}' tidak ditemukan.`);
    }

    const shift = existing[0];
    const shiftLabel = shift.label || shift.code;

    // 1. Query all assignments for this session joined with practitioners, specialties, rooms, and master_days
    const assignments = await this.db
      .select({
        assignmentId: doctorAssignments.id,
        doctorId: doctorAssignments.doctorId,
        dow: doctorAssignments.dow,
        isActive: doctorAssignments.isActive,
        doctorDisplayName: practitioners.displayName,
        specialtyName: medicalSpecialties.name,
        dayName: masterDays.nameId,
        roomName: clinicRooms.name,
      })
      .from(doctorAssignments)
      .innerJoin(practitioners, eq(doctorAssignments.doctorId, practitioners.id))
      .leftJoin(medicalSpecialties, eq(practitioners.specialtyId, medicalSpecialties.id))
      .leftJoin(clinicRooms, eq(doctorAssignments.preferredRoomId, clinicRooms.id))
      .leftJoin(masterDays, eq(doctorAssignments.dow, masterDays.dow))
      .where(eq(doctorAssignments.sessionId, id));

    // Group assignments by doctor
    const doctorMap = new Map<
      string,
      {
        id: string;
        displayName: string;
        specialty: string | null;
        activeDays: Array<{
          dow: number;
          dayName: string;
          roomName?: string | null;
        }>;
      }
    >();

    const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    for (const a of assignments) {
      if (!doctorMap.has(a.doctorId)) {
        doctorMap.set(a.doctorId, {
          id: a.doctorId,
          displayName: a.doctorDisplayName,
          specialty: a.specialtyName ?? null,
          activeDays: [],
        });
      }

      if (a.dow !== null && a.dow !== undefined) {
        const resolvedDayName = a.dayName || DAY_NAMES[a.dow] || `Hari ${a.dow}`;
        doctorMap.get(a.doctorId)!.activeDays.push({
          dow: a.dow,
          dayName: resolvedDayName,
          roomName: a.roomName ?? null,
        });
      }
    }

    // Sort active days by dow for each doctor
    const affectedDoctors: SessionDefImpactDoctorDto[] = Array.from(
      doctorMap.values(),
    ).map((doc) => ({
      ...doc,
      activeDays: doc.activeDays.sort((d1, d2) => d1.dow - d2.dow),
    }));

    // 2. Count weekly templates
    const templates = await this.db
      .select({ id: sessionSchedules.id })
      .from(sessionSchedules)
      .where(eq(sessionSchedules.sessionId, id));

    // 3. Count active queue tickets
    const tickets = await this.db
      .select({ id: queueTickets.id })
      .from(queueTickets)
      .where(eq(queueTickets.sessionId, id));

    return {
      shiftId: shift.id,
      shiftLabel,
      shiftCode: shift.code,
      totalAssignmentsCount: assignments.length,
      affectedDoctorsCount: affectedDoctors.length,
      affectedDoctors,
      weeklyTemplatesCount: templates.length,
      hasActiveTickets: tickets.length > 0,
      activeTicketsCount: tickets.length,
    };
  }

  async deleteSessionDef(
    id: string,
    options?: { cascade?: boolean; confirmText?: string },
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
      throw new NotFoundException({
        code: 'SESSION_DEF_NOT_FOUND',
        message: 'Shift yang akan dihapus tidak ditemukan.',
      });
    }

    const shift = existing[0];
    const shiftLabel = shift.label || shift.code;
    const isCascade = options?.cascade === true;

    if (isCascade) {
      // High-Impact Friction Guard: Validate confirmText
      const expectedText = shiftLabel.trim().toLowerCase();
      const providedText = options?.confirmText?.trim().toLowerCase();

      if (!providedText || providedText !== expectedText) {
        throw new BadRequestException({
          code: 'INVALID_CONFIRMATION_TEXT',
          message: `Teks konfirmasi tidak cocok. Harap ketik '${shiftLabel}' untuk melanjutkan penghapusan.`,
        });
      }

      // Execute deep atomic cleanup in transaction
      await this.db.transaction(async (tx) => {
        // 1. Delete dependent doctor assignments
        await tx
          .delete(doctorAssignments)
          .where(eq(doctorAssignments.sessionId, id));

        // 2. Delete staff rosters for this session
        await tx.delete(staffRosters).where(eq(staffRosters.sessionId, id));

        // 3. Delete queue counters for this session
        await tx.delete(queueCounters).where(eq(queueCounters.sessionId, id));

        // 4. Delete leave request sessions and replacement opportunities
        await tx
          .delete(leaveRequestSessions)
          .where(eq(leaveRequestSessions.sessionId, id));
        await tx
          .delete(replacementOpportunities)
          .where(eq(replacementOpportunities.sessionId, id));

        // 5. Delete weekly templates for this session
        await tx
          .delete(sessionSchedules)
          .where(eq(sessionSchedules.sessionId, id));

        // 6. Delete the session definition
        await tx.delete(sessionDefs).where(eq(sessionDefs.id, id));
      });

      await this.invalidateCaches();

      return {
        success: true,
        message: `Shift '${shiftLabel}' beserta seluruh penugasan dokter dan template terkait berhasil dihapus secara permanen.`,
      };
    }

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
      const impact = await this.getSessionDefImpact(id);
      throw new BadRequestException({
        code: 'SHIFT_IN_USE_BY_DOCTOR',
        message: `Shift '${shiftLabel}' tidak dapat dihapus karena masih ditugaskan pada dokter yang aktif. Silakan nonaktifkan shift atau pindahkan penugasan dokter terlebih dahulu.`,
        impact,
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


}
