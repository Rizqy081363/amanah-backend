import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE_SOURCE } from '../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../database/drizzle/drizzle.provider';
import { clinicProfiles, clinicSettings } from '../../database/schema';
import {
  ClinicProfileData,
  ClinicSchedulePolicyData,
  DurationPriorsData,
  EtaConfigData,
  QueueThresholdsData,
  ScopeQuery,
} from './clinic-config.types';

interface SettingCacheEntry {
  key: string;
  scopeType: string;
  scopeId: string | null;
  value: any;
}

export class MissingConfigKeyError extends Error {
  constructor(public readonly key: string) {
    super(
      `Missing required configuration key: '${key}'. All clinic settings must be defined in database table clinic_setting.`,
    );
    this.name = 'MissingConfigKeyError';
  }
}

const DEFAULT_SCHEDULE_POLICY: ClinicSchedulePolicyData = Object.freeze({
  id: 'default',
  code: 'default',
  defaultConsultationDurationMinutes: 30,
  defaultStartPrecisionMinutes: 1,
  earlyMorningStart: '00:00',
  earlyMorningEnd: '06:00',
  morningStart: '06:00',
  morningEnd: '12:00',
  afternoonStart: '12:00',
  afternoonEnd: '18:00',
  nightStart: '18:00',
  nightEnd: '24:00',
  checkInWindowHours: 24,
});

@Injectable()
export class ClinicConfigService {
  private readonly logger = new Logger(ClinicConfigService.name);
  private settingsCache: Map<string, SettingCacheEntry[]> = new Map();
  private policyCache: ClinicSchedulePolicyData | null = null;
  private profileCache: ClinicProfileData | null = null;
  private lastFetchTime = 0;
  private readonly TTL_MS = 60_000; // 60 seconds cache TTL

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  public invalidateCache(): void {
    this.lastFetchTime = 0;
    this.settingsCache.clear();
    this.policyCache = null;
    this.profileCache = null;
  }

  private async ensureLoaded(force = false): Promise<void> {
    const now = Date.now();
    if (
      !force &&
      this.settingsCache.size > 0 &&
      this.policyCache !== null &&
      now - this.lastFetchTime < this.TTL_MS
    ) {
      return;
    }

    try {
      const [settingRows, profileRow] = await Promise.all([
        this.db.select().from(clinicSettings),
        this.db.query?.clinicProfiles?.findFirst?.(),
      ]);

      const newSettings = new Map<string, SettingCacheEntry[]>();
      for (const r of settingRows ?? []) {
        const list = newSettings.get(r.key) || [];
        list.push({
          key: r.key,
          scopeType: r.scopeType,
          scopeId: r.scopeId,
          value: r.value,
        });
        newSettings.set(r.key, list);
      }
      this.settingsCache = newSettings;

      const checkInWindowHoursVal = newSettings.get(
        'queue.check_in_window_hours',
      )?.[0]?.value;
      const checkInWindowHours =
        checkInWindowHoursVal !== undefined
          ? Number(checkInWindowHoursVal) ||
            DEFAULT_SCHEDULE_POLICY.checkInWindowHours
          : DEFAULT_SCHEDULE_POLICY.checkInWindowHours;

      const durationVal = newSettings.get('duration.prior_minutes')?.[0]?.value;
      const defaultConsultationDurationMinutes =
        durationVal !== undefined
          ? Number(durationVal) ||
            DEFAULT_SCHEDULE_POLICY.defaultConsultationDurationMinutes
          : DEFAULT_SCHEDULE_POLICY.defaultConsultationDurationMinutes;

      this.policyCache = {
        ...DEFAULT_SCHEDULE_POLICY,
        checkInWindowHours,
        defaultConsultationDurationMinutes,
      };

      if (profileRow) {
        this.profileCache = {
          id: profileRow.id,
          name: profileRow.name,
          shortName: profileRow.shortName ?? null,
          legalName: profileRow.legalName ?? null,
          phone: profileRow.phone ?? null,
          whatsapp: profileRow.whatsapp ?? null,
          email: profileRow.email ?? null,
          website: profileRow.website ?? null,
          address: profileRow.address ?? null,
          region: profileRow.region ?? null,
          emergencyNotice: profileRow.emergencyNotice ?? null,
        };
      } else {
        this.profileCache = null;
      }

      this.lastFetchTime = now;
    } catch (err) {
      this.logger.error('Failed to load clinic configurations from DB:', err);
      if (!this.policyCache) {
        this.policyCache = DEFAULT_SCHEDULE_POLICY;
      }
    }
  }

  // --- Schedule Policy Getters ---

  async getSchedulePolicy(): Promise<ClinicSchedulePolicyData> {
    await this.ensureLoaded();
    return this.policyCache ?? DEFAULT_SCHEDULE_POLICY;
  }

  async getCheckInWindowHours(): Promise<number> {
    const policy = await this.getSchedulePolicy();
    return policy.checkInWindowHours;
  }

  async getOperationalHours(): Promise<string> {
    const policy = await this.getSchedulePolicy();
    return `${policy.morningStart} - ${policy.nightEnd}`;
  }

  // --- Clinic Profile Getter ---

  async getClinicProfile(): Promise<ClinicProfileData | null> {
    await this.ensureLoaded();
    return this.profileCache;
  }

  // --- Dynamic Clinic Setting Getters ---

  async get<T = any>(key: string, scope?: ScopeQuery): Promise<T> {
    await this.ensureLoaded();

    const entries = this.settingsCache.get(key);
    if (!entries || entries.length === 0) {
      throw new MissingConfigKeyError(key);
    }

    if (scope?.doctorId) {
      const doctorEntry = entries.find(
        (e) => e.scopeType === 'doctor' && e.scopeId === scope.doctorId,
      );
      if (doctorEntry !== undefined) {
        return doctorEntry.value as T;
      }
    }

    if (scope?.categoryId) {
      const catEntry = entries.find(
        (e) => e.scopeType === 'category' && e.scopeId === scope.categoryId,
      );
      if (catEntry !== undefined) {
        return catEntry.value as T;
      }
    }

    const globalEntry = entries.find((e) => e.scopeType === 'global');
    if (globalEntry !== undefined) {
      return globalEntry.value as T;
    }

    throw new MissingConfigKeyError(key);
  }

  async getNumber(key: string, scope?: ScopeQuery): Promise<number> {
    const val = await this.get<any>(key, scope);
    const num = Number(val);
    if (Number.isNaN(num)) {
      throw new Error(
        `Configuration key '${key}' expected number, got: ${val}`,
      );
    }
    return num;
  }

  async getBoolean(key: string, scope?: ScopeQuery): Promise<boolean> {
    const val = await this.get<any>(key, scope);
    if (typeof val === 'boolean') return val;
    if (val === 'true' || val === 1) return true;
    if (val === 'false' || val === 0) return false;
    return Boolean(val);
  }

  async getString(key: string, scope?: ScopeQuery): Promise<string> {
    const val = await this.get<any>(key, scope);
    return String(val);
  }

  // --- Aggregated Domain Config Helpers ---

  async getDurationPriors(scope?: ScopeQuery): Promise<DurationPriorsData> {
    const [priorMinutes, priorWeight, minMinutes, maxMinutes] =
      await Promise.all([
        this.getNumber('duration.prior_minutes', scope).catch(() => 30),
        this.getNumber('duration.prior_weight', scope).catch(() => 10),
        this.getNumber('duration.valid_min_minutes', scope).catch(() => 2),
        this.getNumber('duration.valid_max_minutes', scope).catch(() => 120),
      ]);

    return { priorMinutes, priorWeight, minMinutes, maxMinutes };
  }

  async getEtaConfig(scope?: ScopeQuery): Promise<EtaConfigData> {
    const [
      displayRoundMinutes,
      notifyDelayMinutes,
      spreadZ,
      updateThresholdMinutes,
    ] = await Promise.all([
      this.getNumber('eta.display_round_minutes', scope).catch(() => 5),
      this.getNumber('eta.notify_delay_minutes', scope).catch(() => 15),
      this.getNumber('eta.spread_z', scope).catch(() => 0.84),
      this.getNumber('eta.update_threshold_minutes', scope).catch(() => 10),
    ]);

    return {
      displayRoundMinutes,
      notifyDelayMinutes,
      spreadZ,
      updateThresholdMinutes,
    };
  }

  async getQueueThresholds(scope?: ScopeQuery): Promise<QueueThresholdsData> {
    const [
      arriveEarlyMinutes,
      overflowToleranceMinutes,
      noShowGraceMinutes,
      noShowCallAttempts,
      maxActivePerPatientCategoryDay,
      rescheduleWarnWhenAheadLte,
      showDoctorWhenCalled,
    ] = await Promise.all([
      this.getNumber('queue.arrive_early_minutes', scope).catch(() => 15),
      this.getNumber('queue.overflow_tolerance_minutes', scope).catch(() => 30),
      this.getNumber('queue.no_show_grace_minutes', scope).catch(() => 10),
      this.getNumber('queue.no_show_call_attempts', scope).catch(() => 2),
      this.getNumber('ticket.max_active_per_patient_category_day', scope).catch(
        () => 1,
      ),
      this.getNumber('ticket.reschedule_warn_when_ahead_lte', scope).catch(
        () => 2,
      ),
      this.getBoolean('ticket.show_doctor_when_called', scope).catch(
        () => true,
      ),
    ]);

    return {
      arriveEarlyMinutes,
      overflowToleranceMinutes,
      noShowGraceMinutes,
      noShowCallAttempts,
      maxActivePerPatientCategoryDay,
      rescheduleWarnWhenAheadLte,
      showDoctorWhenCalled,
    };
  }

  async getLoadRatioThresholds(
    scope?: ScopeQuery,
  ): Promise<{ okMax: number; busyMax: number }> {
    const [okMax, busyMax] = await Promise.all([
      this.getNumber('queue.load_ratio.ok_max', scope).catch(() => 0.9),
      this.getNumber('queue.load_ratio.busy_max', scope).catch(() => 1.1),
    ]);
    return { okMax, busyMax };
  }

  async getAttendanceConfig(scope?: ScopeQuery): Promise<{
    checkInWindowMinutesBefore: number;
    checkInWindowMinutesAfter: number;
    lateToleranceMinutes: number;
    checkOutWindowMinutesBefore: number;
    earlyCheckoutRequiresNotes: boolean;
    qrRotationSeconds: number;
    overtimeEnabled: boolean;
  }> {
    const [
      checkInWindowMinutesBefore,
      checkInWindowMinutesAfter,
      lateToleranceMinutes,
      checkOutWindowMinutesBefore,
      earlyCheckoutRequiresNotes,
      qrRotationSeconds,
      overtimeEnabled,
    ] = await Promise.all([
      this.getNumber('attendance.check_in_window_minutes_before', scope),
      this.getNumber('attendance.check_in_window_minutes_after', scope),
      this.getNumber('attendance.late_tolerance_minutes', scope),
      this.getNumber('attendance.check_out_window_minutes_before', scope).catch(() => 30),
      this.getBoolean('attendance.early_checkout_requires_notes', scope).catch(() => true),
      this.getNumber('attendance.qr_rotation_seconds', scope),
      this.getBoolean('attendance.overtime_enabled', scope),
    ]);

    return {
      checkInWindowMinutesBefore,
      checkInWindowMinutesAfter,
      lateToleranceMinutes,
      checkOutWindowMinutesBefore,
      earlyCheckoutRequiresNotes,
      qrRotationSeconds,
      overtimeEnabled,
    };
  }

  // --- Regional & Format Settings ---

  async getDateFormatStyle(scope?: ScopeQuery): Promise<string> {
    return this.getString('clinic.date_format_style', scope).catch(
      () => 'human_full',
    );
  }

  async getTimeFormatStyle(scope?: ScopeQuery): Promise<string> {
    return this.getString('clinic.time_format_style', scope).catch(() => '24h');
  }

  async getLocale(scope?: ScopeQuery): Promise<string> {
    return this.getString('clinic.locale', scope).catch(() => 'id-ID');
  }

  async getTimezone(scope?: ScopeQuery): Promise<string> {
    return this.getString('clinic.timezone', scope).catch(() => 'Asia/Jakarta');
  }
}
