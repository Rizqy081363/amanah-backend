import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { DbAtlasConfig, SensitivityRule } from './config.interface';

const DEFAULT_CONFIG: DbAtlasConfig = {
  target: {
    label: 'local',
  },
  connection: {
    envVar: 'DATABASE_URL',
    dockerService: 'backend-postgres-1',
    host: '127.0.0.1',
    port: 5433,
    database: 'amanah_healthcare',
    user: 'amanah',
    password: process.env.POSTGRES_PASSWORD || 'amanah',
  },
  schemas: {
    include: ['public'],
    exclude: ['pg_catalog', 'information_schema', 'drizzle'],
  },
  profile: 'standard',
  redaction: {
    level: 'max',
  },
  sensitivity: {
    rulesFile: './backend/tools/dbatlas/config/sensitivity-rules.default.json',
  },
  inference: {
    namingConventions: ['{singular}_id', '{table}_id', '{name}_id'],
  },
  modules: {
    overrides: {},
  },
  junction: {
    maxExtraColumns: 3,
  },
  output: {
    dir: 'db-atlas',
  },
  indexBudgetTokens: 3000,
};

export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let curr = resolve(startDir);
  while (true) {
    if (
      existsSync(join(curr, 'env-vault.config.yaml')) ||
      existsSync(join(curr, 'git-context.ps1')) ||
      existsSync(join(curr, 'dbatlas.config.json'))
    ) {
      return curr;
    }
    const parent = dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return resolve(startDir);
}

export function loadDbAtlasConfig(customConfigPath?: string): {
  config: DbAtlasConfig;
  workspaceRoot: string;
  sensitivityRules: SensitivityRule[];
} {
  const workspaceRoot = findWorkspaceRoot();
  const configPath = resolve(workspaceRoot, customConfigPath || 'dbatlas.config.json');

  let loadedConfig: Partial<DbAtlasConfig> = {};
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf8');
      loadedConfig = JSON.parse(raw);
    } catch (err: any) {
      console.warn(`[dbatlas] Peringatan: Gagal membaca ${configPath}: ${err.message}. Menggunakan default.`);
    }
  }

  const mergedConfig: DbAtlasConfig = {
    ...DEFAULT_CONFIG,
    ...loadedConfig,
    target: { ...DEFAULT_CONFIG.target, ...(loadedConfig.target || {}) },
    connection: { ...DEFAULT_CONFIG.connection, ...(loadedConfig.connection || {}) },
    schemas: { ...DEFAULT_CONFIG.schemas, ...(loadedConfig.schemas || {}) },
    redaction: { ...DEFAULT_CONFIG.redaction, ...(loadedConfig.redaction || {}) },
    sensitivity: { ...DEFAULT_CONFIG.sensitivity, ...(loadedConfig.sensitivity || {}) },
    inference: { ...DEFAULT_CONFIG.inference, ...(loadedConfig.inference || {}) },
    modules: { ...DEFAULT_CONFIG.modules, ...(loadedConfig.modules || {}) },
    junction: { ...DEFAULT_CONFIG.junction, ...(loadedConfig.junction || {}) },
    output: { ...DEFAULT_CONFIG.output, ...(loadedConfig.output || {}) },
  };

  // Load sensitivity rules
  let sensitivityRules: SensitivityRule[] = [];
  const rulesPath = mergedConfig.sensitivity.rulesFile
    ? resolve(workspaceRoot, mergedConfig.sensitivity.rulesFile)
    : resolve(__dirname, 'sensitivity-rules.default.json');

  if (existsSync(rulesPath)) {
    try {
      sensitivityRules = JSON.parse(readFileSync(rulesPath, 'utf8'));
    } catch {
      sensitivityRules = [];
    }
  }

  return { config: mergedConfig, workspaceRoot, sensitivityRules };
}
