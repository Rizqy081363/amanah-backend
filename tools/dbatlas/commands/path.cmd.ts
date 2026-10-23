/**
 * DB Atlas - Path Command (Offline Join Path Finder)
 * Computes shortest join routes between two tables using atlas.json.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DbAtlasConfig } from '../config/config.interface';
import type { CanonicalAtlasModel } from '../core/types';
import { JoinPathsEnricher } from '../enrichers/join-paths';

export function runPathCommand(
  fromTable: string,
  toTable: string,
  config: DbAtlasConfig,
  workspaceRoot: string,
  maxPaths = 3
): number {
  if (!fromTable || !toTable) {
    console.error('[dbatlas path] Kesalahan: Tabel asal dan tujuan wajib diisi. Contoh: `dbatlas path users appointments`');
    return 1;
  }

  const mapDir = resolve(workspaceRoot, config.output.dir || 'db-atlas');
  const atlasPath = resolve(mapDir, 'atlas.json');

  if (!existsSync(atlasPath)) {
    console.error(`[dbatlas path] atlas.json tidak ditemukan di: ${atlasPath}`);
    return 5;
  }

  const model: CanonicalAtlasModel = JSON.parse(readFileSync(atlasPath, 'utf8'));
  const paths = JoinPathsEnricher.computePaths(
    fromTable,
    toTable,
    model.relationships.declared,
    model.relations,
    maxPaths
  );

  console.log('='.repeat(80));
  console.log(` DB ATLAS — JOIN PATHS: ${fromTable} ➔ ${toTable}`);
  console.log('='.repeat(80));

  if (paths.length === 0) {
    console.log(`\nTidak ditemukan jalur join relasi deklaratif langsung antara '${fromTable}' dan '${toTable}'.`);
    return 0;
  }

  paths.forEach((p, idx) => {
    console.log(`\n[Rute #${idx + 1}] (${p.hops.length} lompatan):`);
    p.hops.forEach((h, hIdx) => {
      const fanOutTag = h.fansOut ? ' ⚠️ [FANS OUT / 1:N]' : '';
      const idxTag = !h.isIndexed ? ' ⚠️ [FK TANPA INDEKS]' : '';
      console.log(`  ${hIdx + 1}. ${h.fromTable}.${h.fromColumn} ➔ ${h.toTable}.${h.toColumn} (${h.cardinality})${fanOutTag}${idxTag}`);
    });

    console.log('\n  Snippet Kueri Siap Pakai:');
    console.log('  ```sql');
    console.log(`  SELECT *\n  FROM ${p.from}`);
    p.joinClauses.forEach((jc) => console.log(`  ${jc}`));
    console.log('  ```');

    if (p.hasFanOutWarning) {
      console.warn('  ⚠️ PERINGATAN FAN-OUT: Rute ini mengandung relasi 1:N yang melipatgandakan baris. Lakukan agregasi subkueri atau DISTINCT jika menggunakan SUM/COUNT.');
    }
  });

  return 0;
}
