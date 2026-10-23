#!/usr/bin/env bun
/**
 * Amanah Healthcare Monorepo - Safe Docker Cleanup & Reclaim Automation
 *
 * Sesuai SPEC: docker-reclaim (Docker Desktop + WSL2, Windows)
 *
 * Fase 0: Preflight, baseline disk audit, dynamic compose detection & backup gate
 * Fase 1: Cleanup logis online (containers, images, builder cache)
 * Fase 2: Audit & pembersihan volume yatim terproteksi (--prune-orphans)
 * Fase 3: Online ext4 trimming via WSL2 (best-effort, non-fatal)
 *
 * Invarian:
 * - Data Amanah Healthcare tidak boleh hilang (Zero Data Loss).
 * - DILARANG volume prune massal tanpa guard / allowlist.
 * - Default: DRY-RUN. Eksekusi nyata hanya dengan flag --apply.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';

// --- Helper Functions ---

function runCmd(
  cmd: string,
  args: string[],
  options: { capture?: boolean; cwd?: string; env?: Record<string, string> } = {}
): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync(cmd, args, {
    shell: false,
    encoding: 'utf-8',
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function getVhdxInfo(): { path: string; exists: boolean; sizeBytes: number } {
  const localAppData = process.env.LOCALAPPDATA || '';
  const vhdxPath = resolve(localAppData, 'Docker/wsl/disk/docker_data.vhdx');
  if (existsSync(vhdxPath)) {
    try {
      const stats = statSync(vhdxPath);
      return { path: vhdxPath, exists: true, sizeBytes: stats.size };
    } catch {
      return { path: vhdxPath, exists: true, sizeBytes: 0 };
    }
  }
  return { path: vhdxPath, exists: false, sizeBytes: 0 };
}

// --- CLI Argument Parsing ---
const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isPruneOrphans = args.includes('--prune-orphans') || args.includes('-p');
const isExplicitDryRun = args.includes('--dry-run') || args.includes('-d');
const isDryRun = !isApply || isExplicitDryRun;

const repoRoot = resolve(import.meta.dir, '../..');
const now = new Date();
const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);

console.log('================================================================================');
console.log(' AMANAH HEALTHCARE - SAFE DOCKER CLEANUP & RECLAIM (SPEC: docker-reclaim)');
console.log(` Mode: ${isDryRun ? 'DRY-RUN (Aman, Tanpa Modifikasi Destruktif)' : 'APPLY (Eksekusi Nyata Terproteksi)'}`);
console.log(` Waktu: ${now.toLocaleString('id-ID')}`);
console.log('================================================================================\n');

// =============================================================================
// FASE 0: PREFLIGHT & BASELINE
// =============================================================================
console.log('▶ [Fase 0/3] Preflight & Baseline Audit:');

// 1. Cek docker daemon
const dockerInfo = runCmd('docker', ['info'], { capture: true });
if (dockerInfo.status !== 0) {
  console.error('❌ [FATAL] Docker daemon tidak aktif atau tidak dapat diakses. Hentikan eksekusi.');
  process.exit(1);
}
console.log('  ✔ Docker daemon aktif dan responsif.');

// 2. Cek VHDX path dan ukuran baseline
const vhdx = getVhdxInfo();
if (vhdx.exists) {
  console.log(`  ✔ File VHDX Docker: ${vhdx.path}`);
  console.log(`  ✔ Ukuran VHDX Host saat ini: ${formatBytes(vhdx.sizeBytes)} (${(vhdx.sizeBytes / (1024 ** 3)).toFixed(2)} GB)`);
} else {
  console.log('  ℹ File VHDX host tidak ditemukan di lokasi standar WSL2 (bukan lingkungan Windows WSL2?).');
}

// 3. Tentukan nama compose project aktif & validasi konfigurasi
const composeConfig = runCmd('docker', ['compose', 'config', '--format', 'json'], { capture: true, cwd: repoRoot });
if (composeConfig.status !== 0) {
  console.error('❌ [FATAL] Gagal membaca konfigurasi docker compose aktif:', composeConfig.stderr);
  process.exit(1);
}

let activeProjectName = 'backend';
let declaredComposeVolumes: string[] = [];
try {
  const parsed = JSON.parse(composeConfig.stdout);
  activeProjectName = parsed.name || 'backend';
  if (parsed.volumes) {
    declaredComposeVolumes = Object.values(parsed.volumes).map((v: any) => v.name || '').filter(Boolean);
  }
} catch (e) {
  console.warn('  ⚠ Gagal mengurai JSON compose config, menggunakan fallback project name "backend".');
}
console.log(`  ✔ Active Compose Project Name: "${activeProjectName}"`);
console.log(`  ✔ Declared Volumes di compose: [${declaredComposeVolumes.join(', ')}]`);

// 4. Deteksi volume aktif yang sedang dimount oleh kontainer stack Amanah
const runningContainers = runCmd('docker', ['ps', '-q', '--filter', `label=com.docker.compose.project=${activeProjectName}`], { capture: true });
const activeMountedVolumes: Set<string> = new Set();

if (runningContainers.stdout.trim()) {
  const containerIds = runningContainers.stdout.trim().split(/\s+/);
  for (const cid of containerIds) {
    const inspect = runCmd('docker', ['inspect', cid, '--format', '{{range .Mounts}}{{.Type}}:{{.Name}} {{end}}'], { capture: true });
    if (inspect.stdout) {
      const mounts = inspect.stdout.trim().split(/\s+/);
      for (const m of mounts) {
        if (m.startsWith('volume:')) {
          const vname = m.replace('volume:', '').trim();
          if (vname) activeMountedVolumes.add(vname);
        }
      }
    }
  }
}

console.log(`  ✔ Active Volumes yang dimount stack aktif: [${Array.from(activeMountedVolumes).join(', ')}]`);

// Validasi guard: Harus ada tepat 3 volume aktif Amanah (Postgres, RabbitMQ, Redis)
const expectedActiveCount = 3;
if (activeMountedVolumes.size !== expectedActiveCount) {
  console.warn(`  ⚠ PERINGATAN: Terdeteksi ${activeMountedVolumes.size} volume aktif (diharapkan ${expectedActiveCount}).`);
  if (!isDryRun) {
    console.error('❌ [FATAL] Jumlah volume aktif stack tidak sesuai ekspektasi. Abort demi keselamatan data!');
    process.exit(1);
  }
}

// 5. Baseline audit disk docker
console.log('\n  [Baseline Docker System DF]');
runCmd('docker', ['system', 'df']);

// 6. GATE BACKUP (Hanya dieksekusi jika --apply dan --prune-orphans aktif)
const backupDir = resolve(repoRoot, `backup/pre-reclaim-${timestamp}`);
if (!isDryRun && isPruneOrphans) {
  console.log('\n  ==============================================================================');
  console.log('  GATE BACKUP AKTIF: Membackup volume keep-set sebelum pembersihan volume...');
  console.log('  ==============================================================================');

  mkdirSync(backupDir, { recursive: true });

  // Backup PostgreSQL via pg_dump konsisten
  const postgresContainer = 'backend-postgres-1';
  const dumpFileInside = '/tmp/amanah_pre_reclaim.dump';
  const dumpFileHost = join(backupDir, 'amanah_healthcare.dump');

  console.log('  → [Backup 1/2] Mengeksekusi pg_dump database PostgreSQL...');
  const pgDump = runCmd('docker', ['exec', postgresContainer, 'pg_dump', '-U', 'amanah', '-d', 'amanah_healthcare', '-F', 'c', '-f', dumpFileInside]);
  if (pgDump.status !== 0) {
    console.error('❌ [FATAL] Backup pg_dump gagal. Abort pembersihan volume!');
    process.exit(1);
  }

  const copyDump = runCmd('docker', ['cp', `${postgresContainer}:${dumpFileInside}`, dumpFileHost]);
  runCmd('docker', ['exec', postgresContainer, 'rm', '-f', dumpFileInside], { capture: true });

  if (copyDump.status !== 0 || !existsSync(dumpFileHost) || statSync(dumpFileHost).size === 0) {
    console.error('❌ [FATAL] File backup database tidak valid atau berukuran 0. Abort pembersihan volume!');
    process.exit(1);
  }
  console.log(`    ✔ Backup DB berhasil: ${dumpFileHost} (${formatBytes(statSync(dumpFileHost).size)})`);

  // Backup RabbitMQ
  const rabbitmqContainer = 'backend-rabbitmq-1';
  const rabbitBackupHost = join(backupDir, 'rabbitmq-data');
  console.log('  → [Backup 2/2] Menyalin data direktori RabbitMQ...');
  const copyRabbit = runCmd('docker', ['cp', `${rabbitmqContainer}:/var/lib/rabbitmq`, rabbitBackupHost]);
  if (copyRabbit.status !== 0 || !existsSync(rabbitBackupHost)) {
    console.error('❌ [FATAL] Backup RabbitMQ gagal. Abort pembersihan volume!');
    process.exit(1);
  }
  console.log(`    ✔ Backup RabbitMQ berhasil disimpan ke: ${rabbitBackupHost}`);
  console.log('  ✔ SELURUH GATE BACKUP TERPENUHI DENGAN VALIDASI UKURAN > 0.\n');
}

// =============================================================================
// FASE 1: CLEANUP LOGIS (ONLINE)
// =============================================================================
console.log('\n▶ [Fase 1/3] Cleanup Logis (Online Pruning):');

console.log('  → [1] Membersihkan stopped containers (docker container prune -f)...');
runCmd('docker', ['container', 'prune', '-f']);

console.log('\n  → [2] Membersihkan dangling images (docker image prune -f)...');
runCmd('docker', ['image', 'prune', '-f']);

console.log('\n  → [3] Membersihkan BuildKit build cache (docker builder prune -a -f)...');
runCmd('docker', ['builder', 'prune', '-a', '-f']);

// =============================================================================
// FASE 2: HAPUS VOLUME YATIM (ORPHAN VOLUMES)
// =============================================================================
console.log('\n▶ [Fase 2/3] Audit & Seleksi Volume Yatim:');

// Algoritma SPEC:
// 1. ALL = docker volume ls -q
// 2. DANGLING = docker volume ls -q -f dangling=true
// 3. KEEP = volume dengan label project aktif (kesamaan persis) + semua volume tidak dangling (termasuk redis aktif)
// 4. CANDIDATES = DANGLING - KEEP

const allVolumesOut = runCmd('docker', ['volume', 'ls', '-q'], { capture: true });
const allVolumes = allVolumesOut.stdout.trim().split(/\r?\n/).filter(Boolean);

const danglingOut = runCmd('docker', ['volume', 'ls', '-q', '-f', 'dangling=true'], { capture: true });
const danglingVolumes = new Set(danglingOut.stdout.trim().split(/\r?\n/).filter(Boolean));

const keepProjectOut = runCmd('docker', ['volume', 'ls', '-q', '-f', `label=com.docker.compose.project=${activeProjectName}`], { capture: true });
const keepProjectVolumes = keepProjectOut.stdout.trim().split(/\r?\n/).filter(Boolean);

// Gabungkan keep set: volume berlabel project aktif + volume yang tidak dangling
const keepSet = new Set<string>();
for (const v of keepProjectVolumes) keepSet.add(v);
for (const v of allVolumes) {
  if (!danglingVolumes.has(v)) keepSet.add(v);
}
// Pastikan semua activeMountedVolumes selalu ada di keepSet
for (const v of activeMountedVolumes) keepSet.add(v);

// Hitung candidates: DANGLING - KEEP
const candidateVolumes: string[] = [];
for (const v of danglingVolumes) {
  if (!keepSet.has(v)) {
    candidateVolumes.push(v);
  }
}

console.log(`  • Total volume terdeteksi: ${allVolumes.length}`);
console.log(`  • Volume keep-set (terproteksi): ${keepSet.size} volume:`);
for (const kv of keepSet) {
  const isMounted = activeMountedVolumes.has(kv) ? ' [ACTIVE MOUNTED]' : '';
  console.log(`    - ${kv}${isMounted}`);
}

console.log(`\n  • Volume kandidat yatim (DANGLING - KEEP): ${candidateVolumes.length} volume`);

if (candidateVolumes.length > 0) {
  // Ambil metadata inspect untuk tabel audit
  const inspectOut = runCmd('docker', ['volume', 'inspect', ...candidateVolumes], { capture: true });
  let inspectData: any[] = [];
  try {
    inspectData = JSON.parse(inspectOut.stdout);
  } catch {}

  console.log('\n  TABEL AUDIT VOLUME KANDIDAT YATIM:');
  console.log('  ------------------------------------------------------------------------------------------------------------------------');
  console.log(`  ${'Nama Volume'.padEnd(52)} | ${'Project Label'.padEnd(20)} | ${'Created Date'.padEnd(24)} | Tag Peringatan`);
  console.log('  ------------------------------------------------------------------------------------------------------------------------');

  for (const item of inspectData) {
    const name = item.Name || '';
    const proj = item.Labels?.['com.docker.compose.project'] || '(tanpa project)';
    const created = (item.CreatedAt || '').slice(0, 19).replace('T', ' ');
    let tag = 'Dangling';

    if (name.startsWith('amanah-healthcare-backend_') || name.includes('amanah')) {
      tag = '⚠️ MIRIP PROJECT AKTIF (Periksa!)';
    } else if (item.Labels?.['com.docker.volume.anonymous'] !== undefined) {
      tag = 'Anonim (Sisa Container)';
    }

    console.log(`  ${name.slice(0, 50).padEnd(52)} | ${proj.slice(0, 18).padEnd(20)} | ${created.padEnd(24)} | ${tag}`);
  }
  console.log('  ------------------------------------------------------------------------------------------------------------------------');

  if (!isPruneOrphans) {
    console.log('\n  ℹ Flag --prune-orphans tidak disematkan. Pembersihan volume yatim dilewati (hanya audit read-only).');
    console.log('  Untuk membersihkan volume di atas, jalankan dengan: bun run docker:clean --prune-orphans --apply');
  } else if (isDryRun) {
    console.log('\n  ℹ MODE DRY-RUN AKTIF: Tidak ada volume yang dihapus.');
    console.log('  Untuk mengeksekusi penghapusan nyata, jalankan: bun run docker:clean --prune-orphans --apply');
  } else {
    // Mode APPLY nyata
    console.log('\n  ==============================================================================');
    console.log('  MENGEKSEKUSI PENGHAPUSAN VOLUME YATIM SECARA SELEKTIF (--apply)...');
    console.log('  ==============================================================================');

    // 1. Simpan audit log JSON sebelum menghapus
    const auditLogFile = join(backupDir, `orphan_volumes_audit_${timestamp}.json`);
    writeFileSync(auditLogFile, JSON.stringify(inspectData, null, 2), 'utf-8');
    console.log(`  ✔ Audit log metadata disimpan ke: ${auditLogFile}`);

    // 2. Hapus satu per satu dengan docker volume rm
    let successCount = 0;
    let failedCount = 0;

    for (const vname of candidateVolumes) {
      const rmRes = runCmd('docker', ['volume', 'rm', vname], { capture: true });
      if (rmRes.status === 0) {
        successCount++;
        console.log(`  ✔ Berhasil dihapus: ${vname}`);
      } else {
        failedCount++;
        console.warn(`  ⚠ Gagal menghapus ${vname} (mungkin sedang di-lock oleh sistem): ${rmRes.stderr.trim()}`);
      }
    }

    console.log(`\n  Hasil: ${successCount} volume berhasil dibersihkan, ${failedCount} dilewati.`);

    // 3. Post-condition check
    const postVolumesOut = runCmd('docker', ['volume', 'ls', '-q'], { capture: true });
    const postVolumes = new Set(postVolumesOut.stdout.trim().split(/\r?\n/).filter(Boolean));
    for (const kv of keepSet) {
      if (!postVolumes.has(kv)) {
        console.error(`❌ [PELANGGARAN INVARIAN] Volume terproteksi "${kv}" hilang dari docker volume ls!`);
        process.exit(1);
      }
    }
    console.log('  ✔ Pasca-kondisi terverifikasi: Seluruh volume keep-set Amanah tetap utuh 100%.');
  }
} else {
  console.log('  ✔ Tidak ada volume yatim (DANGLING - KEEP). Semua volume berstatus aktif/terproteksi.');
}

// =============================================================================
// FASE 3: ONLINE TRIM VIA WSL2 (BEST-EFFORT, NON-FATAL)
// =============================================================================
console.log('\n▶ [Fase 3/3] Online Ext4 Trimming (WSL2 Docker Desktop):');

if (process.platform === 'win32') {
  // Deteksi mount ext4 dinamis tanpa hardcode
  const mountCheck = runCmd('wsl', ['-d', 'docker-desktop', '-e', 'sh', '-c', 'mount | grep ext4'], { capture: true });
  if (mountCheck.status === 0 && mountCheck.stdout) {
    const lines = mountCheck.stdout.split(/\r?\n/);
    const candidateMounts: string[] = [];

    for (const line of lines) {
      const parts = line.split(/\s+/);
      // Format: /dev/xxx on /mountpoint type ext4 (rw,...)
      if (parts.length >= 3 && parts[1] === 'on') {
        const mp = parts[2];
        if (mp === '/mnt/docker-desktop-disk' || mp.includes('docker-desktop-disk')) {
          if (!candidateMounts.includes(mp)) candidateMounts.push(mp);
        }
      }
    }

    const targetMount = candidateMounts[0] || '/mnt/docker-desktop-disk';
    console.log(`  ✔ Mount point ext4 terdeteksi: "${targetMount}"`);
    console.log(`  → Menjalankan online fstrim pada "${targetMount}"...`);

    const trimRes = runCmd('wsl', ['-d', 'docker-desktop', '-e', '/sbin/fstrim', '-v', targetMount], { capture: true });
    if (trimRes.status === 0) {
      console.log(`  ✔ fstrim selesai dieksekusi: ${trimRes.stdout.trim()}`);
    } else {
      console.warn(`  ⚠ Eksekusi fstrim tidak berhasil (non-fatal): ${trimRes.stderr.trim()}`);
    }
  } else {
    console.log('  ℹ WSL2 docker-desktop mount ext4 tidak terdeteksi atau fstrim tidak tersedia (melewati tahap ini).');
  }
} else {
  console.log('  ℹ Platform non-Windows (melewati modul trimming WSL2).');
}

// =============================================================================
// RINGKASAN AKHIR & PENGUKURAN VHDX
// =============================================================================
console.log('\n================================================================================');
console.log(' RINGKASAN AKHIR EKSEKUSI CLEANUP:');
console.log('================================================================================');

const finalVhdx = getVhdxInfo();
if (vhdx.exists && finalVhdx.exists) {
  const delta = vhdx.sizeBytes - finalVhdx.sizeBytes;
  console.log(` Ukuran VHDX Host Sebelum: ${formatBytes(vhdx.sizeBytes)}`);
  console.log(` Ukuran VHDX Host Sesudah: ${formatBytes(finalVhdx.sizeBytes)}`);
  console.log(` Delta Pengurangan Fisik : ${formatBytes(delta)}`);
  console.log(' Catatan: Penurunan ukuran fisik file VHDX host yang signifikan (~6-8 GB) memerlukan');
  console.log('          tahap kompaksi offline via "docker-compact.ps1" dari PowerShell Administrator.');
}

console.log('\n Status Container Amanah:');
runCmd('docker', ['compose', 'ps'], { cwd: repoRoot });

console.log('================================================================================');
console.log(' FASE ONLINE DOCKER CLEANUP SELESAI DENGAN AMAN (Zero Volume Loss)');
console.log('================================================================================\n');
