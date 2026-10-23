/**
 * DB Atlas - Show Command (Offline Lookup)
 * Displays a table card and direct relationships from the local map without touching the DB.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DbAtlasConfig } from '../config/config.interface';

export function runShowCommand(
  tableName: string,
  config: DbAtlasConfig,
  workspaceRoot: string
): number {
  if (!tableName) {
    console.error('[dbatlas show] Kesalahan: Nama tabel wajib disertakan. Contoh: `dbatlas show public.appointments`');
    return 1;
  }

  const mapDir = resolve(workspaceRoot, config.output.dir || 'db-atlas');
  const normalizedName = tableName.includes('.') ? tableName : `public.${tableName}`;
  const cardPath = resolve(mapDir, 'tables', `${normalizedName}.md`);

  if (!existsSync(cardPath)) {
    console.error(`[dbatlas show] Kartu tabel tidak ditemukan: ${cardPath}`);
    console.error(`Pastikan nama tabel benar atau cari menggunakan \`dbatlas find ${tableName}\`.`);
    return 1;
  }

  const content = readFileSync(cardPath, 'utf8');
  console.log(content);
  return 0;
}
