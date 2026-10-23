/**
 * DB Atlas - Lint Command (Offline Lint Reporter)
 * Displays schema lints from atlas.json without touching the DB.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DbAtlasConfig } from '../config/config.interface';
import type { CanonicalAtlasModel } from '../core/types';

export function runLintCommand(
  config: DbAtlasConfig,
  workspaceRoot: string
): number {
  const mapDir = resolve(workspaceRoot, config.output.dir || 'db-atlas');
  const atlasPath = resolve(mapDir, 'atlas.json');

  if (!existsSync(atlasPath)) {
    console.error(`[dbatlas lint] atlas.json tidak ditemukan di: ${atlasPath}`);
    return 5;
  }

  const model: CanonicalAtlasModel = JSON.parse(readFileSync(atlasPath, 'utf8'));
  const lints = model.lints || [];

  console.log('='.repeat(80));
  console.log(` DB ATLAS — SCHEMA ADVISORY LINTS (${lints.length} temuan)`);
  console.log('='.repeat(80));

  if (lints.length === 0) {
    console.log('\n🎉 Sempurna! Tidak ditemukan isu indeks, foreign key, atau primary key.');
    return 0;
  }

  const errors = lints.filter((l) => l.severity === 'error');
  const warnings = lints.filter((l) => l.severity === 'warning');

  if (errors.length > 0) {
    console.log(`\n🚨 ISU KRITIS (${errors.length}):`);
    errors.forEach((e) => {
      console.log(`  - [${e.code}] ${e.table}: ${e.message}`);
      console.log(`    Solusi: ${e.remediation}`);
    });
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️ PERINGATAN KINERJA (${warnings.length}):`);
    warnings.forEach((w) => {
      console.log(`  - [${w.code}] ${w.table}: ${w.message}`);
      console.log(`    SQL: ${w.remediation}`);
    });
  }

  return 0;
}
