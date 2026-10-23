/**
 * DB Atlas - Configuration Interfaces (Config-Driven SSOT)
 * Complies with docs/get-to-know-the-db/01-PHILOSOPHY.md and 02-ARCHITECTURE.md
 */

export type TargetEnvironment = 'local' | 'dev' | 'staging' | 'prod';
export type IntrospectionProfile = 'minimal' | 'standard' | 'deep';
export type RedactionLevel = 'max' | 'standard' | 'none';

export interface DatabaseConnectionConfig {
  /**
   * Nama environment variable yang berisi database URL (default: DATABASE_URL)
   */
  envVar?: string;
  /**
   * Nama Docker Compose service container (default: backend-postgres-1)
   */
  dockerService?: string;
  /**
   * Host fallback jika port terekspos (default: 127.0.0.1)
   */
  host?: string;
  /**
   * Port database fallback (default: 5433 atau 5432)
   */
  port?: number;
  /**
   * Nama database fallback (default: amanah_healthcare)
   */
  database?: string;
  /**
   * Database user fallback (default: amanah)
   */
  user?: string;
  /**
   * Database password fallback (default: amanah)
   */
  password?: string;
}

export interface SchemaScopeConfig {
  include?: string[];
  exclude?: string[];
}

export interface SensitivityRule {
  pattern: string;
  sensitivity: 'phi' | 'pii' | 'credential' | 'financial' | 'none';
  reason: string;
  isRegex?: boolean;
}

export interface DbAtlasConfig {
  target: {
    label: TargetEnvironment;
  };
  connection: DatabaseConnectionConfig;
  schemas: SchemaScopeConfig;
  profile: IntrospectionProfile;
  redaction: {
    level: RedactionLevel;
  };
  sensitivity: {
    rulesFile?: string;
  };
  inference: {
    namingConventions: string[];
  };
  modules: {
    overrides?: Record<string, string[]>;
  };
  junction: {
    maxExtraColumns: number;
  };
  output: {
    dir: string;
  };
  indexBudgetTokens: number;
}
