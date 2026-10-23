/**
 * Amanah Healthcare Monorepo - Team Credentials & Vault Unpack Tool
 *
 * Mengekstrak file-file environment (.env*) dan kredensial dari arsip ZIP
 * langsung ke repositori masing-masing (Backend, Frontend Web, Mobile App, Root).
 */

import { existsSync, mkdirSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import AdmZip from 'adm-zip';

function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let curr = resolve(startDir);
  while (true) {
    if (
      existsSync(join(curr, 'env-vault.config.yaml')) ||
      existsSync(join(curr, 'git-context.ps1'))
    ) {
      return curr;
    }
    const parent = dirname(curr);
    if (parent === curr) {
      break;
    }
    curr = parent;
  }
  return resolve(startDir);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

async function main(): Promise<void> {
  const workspaceRoot = findWorkspaceRoot();
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  const zipArg = args.find((a) => !a.startsWith('--'));
  const defaultZip = join(workspaceRoot, 'dist-vault', 'amanah-team-credentials-latest.zip');
  let targetZipPath = resolve(workspaceRoot, zipArg || defaultZip);

  // Jika input berupa namespace folder, cari file zip di dalamnya
  if (existsSync(targetZipPath) && statSync(targetZipPath).isDirectory()) {
    const zipFiles = readdirSync(targetZipPath).filter((f) => f.endsWith('.zip'));
    if (zipFiles.length > 0) {
      targetZipPath = join(targetZipPath, zipFiles[0]);
    }
  }

  console.log('='.repeat(80));
  console.log(' AMANAH HEALTHCARE - TEAM CREDENTIALS VAULT UNPACK TOOL');
  console.log(` Workspace Root: ${workspaceRoot}`);
  console.log(` Target Archive: ${targetZipPath}`);
  if (isDryRun) {
    console.log(' MODE          : DRY-RUN (Simulasi tanpa menulis file ke disk)');
  }
  console.log('='.repeat(80));

  if (!existsSync(targetZipPath)) {
    console.error(`\n[FATAL ERROR] File arsip tidak ditemukan: ${targetZipPath}`);
    console.error('Silakan tentukan path ke file ZIP kredensial yang valid.');
    console.error('Contoh: bun run vault:unpack ./dist-vault/amanah-team-credentials-latest.zip');
    process.exit(1);
  }

  const zip = new AdmZip(targetZipPath);
  const entries = zip.getEntries();

  console.log(`\nMenemukan ${entries.length} entri dalam arsip:\n`);

  let extractedCount = 0;
  let skippedCount = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    // Lewatkan file metadata panduan agar tidak menimpa root README/manifest
    if (entry.entryName === 'README.md' || entry.entryName === 'manifest.json') {
      console.log(`  ○ [METADATA SKIPPED] ${entry.entryName}`);
      skippedCount++;
      continue;
    }

    const destinationPath = join(workspaceRoot, entry.entryName);
    const parentDir = dirname(destinationPath);

    console.log(`  ✓ [EXTRACT] ${entry.entryName} (${formatBytes(entry.header.size)}) -> ${destinationPath}`);

    if (!isDryRun) {
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }
      writeFileSync(destinationPath, entry.getData());
    }
    extractedCount++;
  }

  console.log('\n' + '='.repeat(80));
  console.log(isDryRun ? ' SIMULASI UNPACK SELESAI' : ' EKSTRAKSI SELESAI DENGAN SUKSES');
  console.log('='.repeat(80));
  console.log(` Berhasil diekstrak : ${extractedCount} file`);
  console.log(` Metadata dilewati  : ${skippedCount} file (README.md, manifest.json)`);
  if (!isDryRun) {
    console.log(' Seluruh environment (.env) dan kredensial kini telah terpasang di tempatnya.');
  }
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('\n[UNEXPECTED ERROR]', err);
  process.exit(1);
});
