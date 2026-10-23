/**
 * Amanah Healthcare Monorepo - Team Credentials & Vault Packager
 *
 * Config-driven bundler yang mengemas file kredensial, environment, dan kunci
 * dari Backend, Frontend Web, Mobile App (Flutter), dan Monorepo Root ke dalam arsip ZIP.
 *
 * Sumber konfigurasi: env-vault.config.yaml (Single Source of Truth)
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import AdmZip from 'adm-zip';
import yaml from 'yaml';

interface EntryConfig {
  path: string;
  required?: boolean;
  is_directory?: boolean;
  description?: string;
}

interface TargetConfig {
  name: string;
  source_dir: string;
  dest_dir: string;
  entries: EntryConfig[];
}

interface VaultConfig {
  archive: {
    output_dir: string;
    filename_prefix: string;
    include_timestamp?: boolean;
    create_latest_copy?: boolean;
    wrap_namespace?: boolean;
  };
  targets: TargetConfig[];
}

interface ManifestFileEntry {
  path: string;
  size: number;
  target: string;
  description?: string;
}

interface VaultManifest {
  version: string;
  created_at: string;
  human_label: string;
  namespace?: string;
  generator: string;
  total_files: number;
  total_bytes: number;
  files: ManifestFileEntry[];
}

/**
 * Format namespace tanggal dan hari secara human-readable
 * menggunakan standar runtime Intl.DateTimeFormat (Zero hardcoding).
 */
function formatVaultNamespace(now: Date = new Date(), locale: string = 'id-ID'): {
  namespace: string;
  humanLabel: string;
} {
  const pad = (n: number) => String(n).padStart(2, '0');
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now);
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(now);
  const day = pad(now.getDate());
  const year = now.getFullYear();
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());

  // Namespace: 2026-10-23_Jumat_23-Oktober_11.45.12
  const namespace = `${year}-${pad(now.getMonth() + 1)}-${day}_${weekday}_${day}-${month}_${hours}.${minutes}.${seconds}`;
  const humanLabel = `${weekday}, ${day} ${month} ${year} pukul ${hours}:${minutes}:${seconds}`;

  return { namespace, humanLabel };
}

/**
 * Mencari root monorepo berdasarkan keberadaan file penanda (env-vault.config.yaml / git-context.ps1).
 */
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

/**
 * Mengumpulkan semua file di dalam direktori secara rekursif.
 */
function collectDirectoryFiles(dirPath: string): string[] {
  const results: string[] = [];
  if (!existsSync(dirPath)) return results;

  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectDirectoryFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Format bytes menjadi ukuran yang mudah dibaca.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

async function main(): Promise<void> {
  const workspaceRoot = findWorkspaceRoot();
  console.log('='.repeat(80));
  console.log(' AMANAH HEALTHCARE - TEAM CREDENTIALS VAULT PACKAGER');
  console.log(` Workspace Root: ${workspaceRoot}`);
  console.log('='.repeat(80));

  const configPath = join(workspaceRoot, 'env-vault.config.yaml');
  if (!existsSync(configPath)) {
    console.error(`\n[FATAL ERROR] Config file tidak ditemukan di: ${configPath}`);
    console.error('Pastikan file env-vault.config.yaml tersedia di root monorepo.');
    process.exit(1);
  }

  const rawConfig = readFileSync(configPath, 'utf8');
  let config: VaultConfig;
  try {
    config = yaml.parse(rawConfig) as VaultConfig;
  } catch (err: any) {
    console.error(`\n[FATAL ERROR] Gagal mem-parse env-vault.config.yaml: ${err.message}`);
    process.exit(1);
  }

  const zip = new AdmZip();
  const manifestEntries: ManifestFileEntry[] = [];
  let totalBytes = 0;
  const missingRequired: string[] = [];

  console.log('\nMemproses target repositories dari konfigurasi:');

  for (const target of config.targets) {
    const targetSourceDir = resolve(workspaceRoot, target.source_dir);
    console.log(`\n▶ [${target.name.toUpperCase()}] Source: ${target.source_dir}`);

    for (const entry of target.entries) {
      const fullSourcePath = resolve(targetSourceDir, entry.path);
      const isRequired = Boolean(entry.required);

      if (entry.is_directory) {
        if (!existsSync(fullSourcePath)) {
          if (isRequired) {
            console.error(`  ✖ [REQUIRED MISSING] Directory: ${entry.path}`);
            missingRequired.push(`${target.name}: ${entry.path}`);
          } else {
            console.log(`  ○ [SKIPPED OPTIONAL] Directory not found: ${entry.path}`);
          }
          continue;
        }

        const files = collectDirectoryFiles(fullSourcePath);
        console.log(`  ✓ Directory: ${entry.path} (${files.length} file)`);
        for (const filePath of files) {
          const relInsideDir = relative(fullSourcePath, filePath).replace(/\\/g, '/');
          const zipDestPath = [target.dest_dir, entry.path, relInsideDir]
            .filter(Boolean)
            .join('/');

          const content = readFileSync(filePath);
          zip.addFile(zipDestPath, content);
          manifestEntries.push({
            path: zipDestPath,
            size: content.length,
            target: target.name,
            description: entry.description,
          });
          totalBytes += content.length;
        }
      } else {
        if (!existsSync(fullSourcePath)) {
          if (isRequired) {
            console.error(`  ✖ [REQUIRED MISSING] File: ${entry.path}`);
            missingRequired.push(`${target.name}: ${entry.path}`);
          } else {
            console.log(`  ○ [SKIPPED OPTIONAL] File not found: ${entry.path}`);
          }
          continue;
        }

        const content = readFileSync(fullSourcePath);
        const zipDestPath = [target.dest_dir, entry.path]
          .filter(Boolean)
          .join('/')
          .replace(/\\/g, '/');

        zip.addFile(zipDestPath, content);
        manifestEntries.push({
          path: zipDestPath,
          size: content.length,
          target: target.name,
          description: entry.description,
        });
        totalBytes += content.length;
        console.log(`  ✓ File: ${entry.path} (${formatBytes(content.length)}) ${entry.description ? `— ${entry.description}` : ''}`);
      }
    }
  }

  if (missingRequired.length > 0) {
    console.error('\n' + '!'.repeat(80));
    console.error('[SECURITY & INTEGRITY ERROR] File/direktori wajib berikut tidak ditemukan:');
    for (const item of missingRequired) {
      console.error(`  - ${item}`);
    }
    console.error('Proses packaging dibatalkan agar arsip tidak terdistribusi dalam kondisi cacat.');
    console.error('!'.repeat(80));
    process.exit(1);
  }

  const now = new Date();
  const { namespace, humanLabel } = formatVaultNamespace(now);

  // Generate metadata manifest
  const manifest: VaultManifest = {
    version: '1.0.0',
    created_at: now.toISOString(),
    human_label: humanLabel,
    namespace: config.archive.wrap_namespace !== false ? namespace : undefined,
    generator: 'Amanah Healthcare Vault Bundler (Config-Driven)',
    total_files: manifestEntries.length,
    total_bytes: totalBytes,
    files: manifestEntries,
  };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

  // Generate README.md panduan ekstraksi bagi rekan tim
  const prefix = config.archive.filename_prefix || 'amanah-team-credentials';
  const readmeContent = `# Amanah Healthcare - Team Credentials Archive

Arsip ini berisi file konfigurasi environment (\`.env*\`) dan kredensial untuk monorepo Amanah Healthcare.
Arsip ini di-generate secara otomatis pada: **${humanLabel}** (${manifest.created_at})
Namespace: **${namespace}**

## Cara Penggunaan / Ekstraksi:

### Cara 1: Menggunakan Script Otomatis (Direkomendasikan)
Jalankan salah satu perintah berikut:
\`\`\`bash
# Ekstrak namespace ini secara spesifik:
cd backend
bun run vault:unpack ../dist-vault/${namespace}/${prefix}_${namespace}.zip

# Atau ekstrak namespace folder langsung:
bun run vault:unpack ../dist-vault/${namespace}

# Atau ekstrak versi latest:
bun run vault:unpack
\`\`\`

### Cara 2: Ekstraksi Manual
Ekstrak seluruh isi file zip ini langsung ke **root folder monorepo** (\`Amanah-health-care\`).
Struktur folder di dalam zip sudah disesuaikan persis dengan struktur 3 repository:
- \`cred.txt\` -> root
- \`backend/.env\` -> folder \`backend/\`
- \`frontend-web/.env.local\` -> folder \`frontend-web/\`
- \`amanah-healthcare-mobile/packages/amanah_healthcare/.env\` -> folder \`amanah-healthcare-mobile/\`

> **PERINGATAN KEAMANAN**:
> Jangan pernah meng-commit file \`.env\` atau file zip ini ke git publik!
`;
  zip.addFile('README.md', Buffer.from(readmeContent, 'utf8'));

  // Menentukan output folder path
  const rootOutputDir = resolve(workspaceRoot, config.archive.output_dir || './dist-vault');
  if (!existsSync(rootOutputDir)) {
    mkdirSync(rootOutputDir, { recursive: true });
  }

  const isWrapNamespace = config.archive.wrap_namespace !== false;
  const targetDir = isWrapNamespace ? join(rootOutputDir, namespace) : rootOutputDir;
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const zipFilename = isWrapNamespace
    ? `${prefix}_${namespace}.zip`
    : `${prefix}-${namespace}.zip`;

  const outputPath = join(targetDir, zipFilename);
  zip.writeZip(outputPath);

  // Jika di-wrap ke namespace, salin juga manifest.json & README.md ke folder namespace
  // agar langsung bisa diinspeksi di file manager / terminal tanpa perlu ekstrak zip
  if (isWrapNamespace) {
    writeFileSync(join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    writeFileSync(join(targetDir, 'README.md'), readmeContent, 'utf8');
  }

  console.log('\n' + '='.repeat(80));
  console.log(' HASIL BUNDLING BERHASIL');
  console.log('='.repeat(80));
  console.log(` Namespace       : ${namespace}`);
  console.log(` Waktu           : ${humanLabel}`);
  console.log(` Folder Vault    : ${targetDir}`);
  console.log(` Output ZIP      : ${outputPath}`);
  console.log(` Ukuran Arsip    : ${formatBytes(statSync(outputPath).size)}`);
  console.log(` Jumlah File     : ${manifestEntries.length} file dikemas`);
  console.log(` Total Uncompressed: ${formatBytes(totalBytes)}`);

  if (config.archive.create_latest_copy !== false) {
    const latestPath = join(rootOutputDir, `${prefix}-latest.zip`);
    zip.writeZip(latestPath);
    console.log(` Copy Terkini    : ${latestPath}`);
  }

  console.log('='.repeat(80));
  console.log(' Arsip siap dikirimkan kepada rekan tim Anda secara aman.');
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('\n[UNEXPECTED ERROR]', err);
  process.exit(1);
});
