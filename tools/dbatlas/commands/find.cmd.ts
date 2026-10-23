/**
 * DB Atlas - Find Command (Offline Search)
 * Searches tables, columns, enum labels, and comments without touching the DB.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DbAtlasConfig } from '../config/config.interface';
import type { CanonicalAtlasModel } from '../core/types';

export function runFindCommand(
  term: string,
  config: DbAtlasConfig,
  workspaceRoot: string
): number {
  if (!term) {
    console.error('[dbatlas find] Kesalahan: Kata kunci pencarian wajib disertakan. Contoh: `dbatlas find keluhan`');
    return 1;
  }

  const mapDir = resolve(workspaceRoot, config.output.dir || 'db-atlas');
  const atlasPath = resolve(mapDir, 'atlas.json');

  if (!existsSync(atlasPath)) {
    console.error(`[dbatlas find] atlas.json tidak ditemukan di: ${atlasPath}`);
    return 5;
  }

  const model: CanonicalAtlasModel = JSON.parse(readFileSync(atlasPath, 'utf8'));
  const q = term.toLowerCase();

  console.log('='.repeat(80));
  console.log(` DB ATLAS — HASIL PENCARIAN METADATA UNTUK: "${term}"`);
  console.log('='.repeat(80));

  let matchCount = 0;

  // 1. Cari di nama tabel & komentar tabel
  const matchingTables = model.relations.filter(
    (r) => r.name.toLowerCase().includes(q) || (r.comment && r.comment.toLowerCase().includes(q))
  );
  if (matchingTables.length > 0) {
    console.log(`\n▶ TABEL / VIEW (${matchingTables.length} cocok):`);
    for (const t of matchingTables) {
      matchCount++;
      console.log(`  - ${t.qualifiedName} (${t.kind}) ${t.comment ? `— "${t.comment}"` : ''}`);
    }
  }

  // 2. Cari di nama kolom & komentar kolom
  const matchingCols: { table: string; colName: string; type: string; comment?: string | null }[] = [];
  for (const rel of model.relations) {
    for (const col of rel.columns) {
      if (col.name.toLowerCase().includes(q) || (col.comment && col.comment.toLowerCase().includes(q))) {
        matchingCols.push({
          table: rel.qualifiedName,
          colName: col.name,
          type: col.dataType,
          comment: col.comment,
        });
      }
    }
  }
  if (matchingCols.length > 0) {
    console.log(`\n▶ KOLOM (${matchingCols.length} cocok):`);
    for (const mc of matchingCols) {
      matchCount++;
      console.log(`  - ${mc.table}.${mc.colName} (\`${mc.type}\`) ${mc.comment ? `— "${mc.comment}"` : ''}`);
    }
  }

  // 3. Cari di Enum Types & Enum Labels
  const matchingEnums: { enumName: string; label: string }[] = [];
  for (const e of model.enums) {
    for (const l of e.labels) {
      if (l.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)) {
        matchingEnums.push({ enumName: e.qualifiedName, label: l });
      }
    }
  }
  if (matchingEnums.length > 0) {
    console.log(`\n▶ ENUM LABELS (${matchingEnums.length} cocok):`);
    for (const me of matchingEnums) {
      matchCount++;
      console.log(`  - Enum \`${me.enumName}\` ➔ Nilai: \`${me.label}\``);
    }
  }

  if (matchCount === 0) {
    console.log(`\nTidak ada tabel, kolom, atau enum yang cocok dengan kata kunci "${term}".`);
  }

  return 0;
}
