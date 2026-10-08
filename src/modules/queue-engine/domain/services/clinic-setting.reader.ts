import { MissingConfigKeyError } from '@common/clinic-config';

export interface ScopeQuery {
  doctorId?: string;
  categoryId?: string;
}

export { MissingConfigKeyError };

export interface IClinicSettingReader {
  get<T = any>(key: string, scope?: ScopeQuery): Promise<T>;
  getNumber(key: string, scope?: ScopeQuery): Promise<number>;
  getString(key: string, scope?: ScopeQuery): Promise<string>;
  getBoolean(key: string, scope?: ScopeQuery): Promise<boolean>;
  getObject<T extends object>(key: string, scope?: ScopeQuery): Promise<T>;
  getAll(scope?: ScopeQuery): Promise<Record<string, any>>;
}
