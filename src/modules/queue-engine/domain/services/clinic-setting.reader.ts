export interface ScopeQuery {
  doctorId?: string;
  categoryId?: string;
}

export class MissingConfigKeyError extends Error {
  constructor(public readonly key: string) {
    super(
      `Missing required configuration key: '${key}'. All clinic settings must be defined in database table clinic_setting.`,
    );
    this.name = 'MissingConfigKeyError';
  }
}

export interface IClinicSettingReader {
  get<T = any>(key: string, scope?: ScopeQuery): Promise<T>;
  getNumber(key: string, scope?: ScopeQuery): Promise<number>;
  getString(key: string, scope?: ScopeQuery): Promise<string>;
  getBoolean(key: string, scope?: ScopeQuery): Promise<boolean>;
  getObject<T extends object>(key: string, scope?: ScopeQuery): Promise<T>;
  getAll(scope?: ScopeQuery): Promise<Record<string, any>>;
}
