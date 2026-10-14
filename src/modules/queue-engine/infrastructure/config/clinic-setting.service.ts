import { ClinicConfigService } from '@common/clinic-config';
import { Injectable } from '@nestjs/common';
import {
  IClinicSettingReader,
  ScopeQuery,
} from '../../domain/services/clinic-setting.reader';

@Injectable()
export class ClinicSettingService implements IClinicSettingReader {
  constructor(private readonly clinicConfig: ClinicConfigService) {}

  async get<T = any>(key: string, scope?: ScopeQuery): Promise<T> {
    return this.clinicConfig.get<T>(key, scope);
  }

  async getNumber(key: string, scope?: ScopeQuery): Promise<number> {
    return this.clinicConfig.getNumber(key, scope);
  }

  async getString(key: string, scope?: ScopeQuery): Promise<string> {
    return this.clinicConfig.getString(key, scope);
  }

  async getBoolean(key: string, scope?: ScopeQuery): Promise<boolean> {
    return this.clinicConfig.getBoolean(key, scope);
  }

  async getObject<T extends object>(
    key: string,
    scope?: ScopeQuery,
  ): Promise<T> {
    const val = await this.clinicConfig.get<any>(key, scope);
    if (typeof val !== 'object' || val === null) {
      throw new Error(
        `Configuration key '${key}' expected object, got: ${typeof val}`,
      );
    }
    return val as T;
  }

  async getAll(scope?: ScopeQuery): Promise<Record<string, any>> {
    const keys = [
      'duration.prior_minutes',
      'duration.prior_weight',
      'duration.valid_min_minutes',
      'duration.valid_max_minutes',
      'eta.display_round_minutes',
      'eta.notify_delay_minutes',
      'eta.spread_z',
      'eta.update_threshold_minutes',
      'queue.arrive_early_minutes',
      'queue.overflow_tolerance_minutes',
      'queue.no_show_grace_minutes',
      'queue.no_show_call_attempts',
      'ticket.max_active_per_patient_category_day',
      'ticket.reschedule_warn_when_ahead_lte',
      'ticket.show_doctor_when_called',
    ];
    const result: Record<string, any> = {};
    for (const k of keys) {
      try {
        result[k] = await this.clinicConfig.get(k, scope);
      } catch {}
    }
    return result;
  }

  clearCache(): void {
    this.clinicConfig.invalidateCache();
  }
}
