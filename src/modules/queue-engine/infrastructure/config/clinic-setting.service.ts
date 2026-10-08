import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { clinicSettings } from '../../../../database/schema/queue-ticketing.schema';
import {
  IClinicSettingReader,
  MissingConfigKeyError,
  ScopeQuery,
} from '../../domain/services/clinic-setting.reader';

interface SettingCacheEntry {
  key: string;
  scopeType: string;
  scopeId: string | null;
  value: any;
}

@Injectable()
export class ClinicSettingService implements IClinicSettingReader {
  private cache: Map<string, SettingCacheEntry[]> = new Map();
  private lastFetchTime = 0;
  private readonly TTL_MS = 60_000; // 60 seconds TTL

  constructor(@Inject(DRIZZLE_SOURCE) private readonly db: any) {}

  private async ensureLoaded(force = false): Promise<void> {
    const now = Date.now();
    if (
      !force &&
      this.cache.size > 0 &&
      now - this.lastFetchTime < this.TTL_MS
    ) {
      return;
    }

    const rows = await this.db.select().from(clinicSettings);
    const newCache = new Map<string, SettingCacheEntry[]>();

    for (const r of rows) {
      const list = newCache.get(r.key) || [];
      list.push({
        key: r.key,
        scopeType: r.scopeType,
        scopeId: r.scopeId,
        value: r.value,
      });
      newCache.set(r.key, list);
    }

    this.cache = newCache;
    this.lastFetchTime = now;
  }

  async get<T = any>(key: string, scope?: ScopeQuery): Promise<T> {
    await this.ensureLoaded();

    const entries = this.cache.get(key);
    if (!entries || entries.length === 0) {
      throw new MissingConfigKeyError(key);
    }

    // 1. Doctor scope override
    if (scope?.doctorId) {
      const doctorEntry = entries.find(
        (e) => e.scopeType === 'doctor' && e.scopeId === scope.doctorId,
      );
      if (doctorEntry !== undefined) {
        return doctorEntry.value as T;
      }
    }

    // 2. Category scope override
    if (scope?.categoryId) {
      const catEntry = entries.find(
        (e) => e.scopeType === 'category' && e.scopeId === scope.categoryId,
      );
      if (catEntry !== undefined) {
        return catEntry.value as T;
      }
    }

    // 3. Global scope fallback
    const globalEntry = entries.find((e) => e.scopeType === 'global');
    if (globalEntry !== undefined) {
      return globalEntry.value as T;
    }

    // If no scoped or global match found
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

  async getString(key: string, scope?: ScopeQuery): Promise<string> {
    const val = await this.get<any>(key, scope);
    return String(val);
  }

  async getBoolean(key: string, scope?: ScopeQuery): Promise<boolean> {
    const val = await this.get<any>(key, scope);
    if (typeof val === 'boolean') return val;
    return val === 'true' || val === 1 || val === '1';
  }

  async getObject<T extends object>(
    key: string,
    scope?: ScopeQuery,
  ): Promise<T> {
    const val = await this.get<any>(key, scope);
    if (typeof val !== 'object' || val === null) {
      throw new Error(
        `Configuration key '${key}' expected object, got: ${typeof val}`,
      );
    }
    return val as T;
  }

  async getAll(scope?: ScopeQuery): Promise<Record<string, any>> {
    await this.ensureLoaded();
    const result: Record<string, any> = {};
    for (const key of this.cache.keys()) {
      try {
        result[key] = await this.get(key, scope);
      } catch {
        // ignore missing scoped
      }
    }
    return result;
  }

  clearCache(): void {
    this.cache.clear();
    this.lastFetchTime = 0;
  }
}
