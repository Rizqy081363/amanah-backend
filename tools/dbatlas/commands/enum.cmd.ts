/**
 * DB Atlas - Enum Command (Offline Enum Inspector)
 * Displays ordered values and usages of an enum type from atlas.json.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DbAtlasConfig } from '../config/config.interface';
import type { CanonicalAtlasModel } from '../core/types';

export function runEnumCommand(
  enumName: string,
  config: DbAtlasConfig,
  workspaceRoot: string
): number {
  if (!enumName) {
    console.error('[dbatlas enum] Kesalahan: Nama tipe enum wajib disertakan. Contoh: `dbatlas enum appointment_status`');
    return 1;
  }

  const mapDir = resolve(workspaceRoot, config.output.dir || 'db-atlas');
  const atlasPath = resolve(mapDir, 'atlas.json');

  if (!existsSync(atlasPath)) {
    console.error(`[dbatlas enum] atlas.json tidak ditemukan di: ${atlasPath}`);
    return 5;
  }

  const model: CanonicalAtlasModel = JSON.parse(readFileSync(atlasPath, 'utf8'));
  const q = enumName.toLowerCase();
  const matched = model.enums.find((e) => e.name.toLowerCase() === q || e.qualifiedName.toLowerCase() === q);

  if (!matched) {
    console.error(`[dbatlas enum] Tipe enum '${enumName}' tidak ditemukan dalam katalog.`);
    return 1;
  }

  console.log('='.repeat(80));
  console.log(` DB ATLAS — ENUM INSPECTOR: ${matched.qualifiedName}`);
  console.log('='.repeat(80));
  console.log(`\nUrutan Nilai Resmi (enumsortorder):`);
  matched.labels.forEach((l, i) => console.log(`  ${i + 1}. \`${l}\``));

  console.log(`\nDigunakan oleh Kolom:`);
  if (matched.usedByColumns.length === 0) {
    console.log('  (Tidak ada kolom aktif yang menggunakan enum ini)');
  } else {
    matched.usedByColumns.forEach((u) => console.log(`  - ${u.table}.${u.column}`));
  }

  return 0;
}
