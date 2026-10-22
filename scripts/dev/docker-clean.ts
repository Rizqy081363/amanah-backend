#!/usr/bin/env bun
/**
 * Amanah Healthcare Monorepo - Safe Docker Cleanup Automation
 *
 * Mengaudit dan membersihkan Build Cache (BuildKit) dan dangling images tanpa menyentuh
 * volume database aktif (PostgreSQL/RabbitMQ/Redis) atau kontainer yang sedang berjalan.
 *
 * Invarian Rekayasa (GEMINI.md Sec 4.1):
 * - DILARANG menghapus volume (Zero Data Loss).
 * - ZERO downtime pada 6 kontainer aktif.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function runCmd(cmd: string, args: string[], capture = false): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync(cmd, args, {
    shell: process.platform === 'win32',
    encoding: 'utf-8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

// 1. Cek ketersediaan Docker daemon
const check = runCmd('docker', ['info'], true);
if (check.status !== 0) {
  console.error('\n[Docker Clean] Docker daemon tidak aktif atau tidak dapat diakses.');
  process.exit(1);
}

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');

console.log('\n================================================================================');
console.log(' AMANAH HEALTHCARE - SAFE DOCKER CLEANUP AUTOMATION');
console.log(' Invariant: Zero Volume Prune | Running Containers Protected');
console.log('================================================================================');

if (isDryRun) {
  console.log(' [MODE] DRY-RUN AKTIF: Hanya menampilkan audit penggunaan disk tanpa menghapus apapun.\n');
}

// 2. Ambil statistik sebelum pembersihan
console.log('▶ [1/3] Mengaudit Penggunaan Disk Docker Saat Ini...');
runCmd('docker', ['system', 'df']);

if (isDryRun) {
  console.log('\n[Dry-Run Selesai] Tidak ada data yang dihapus.');
  process.exit(0);
}

// 3. Eksekusi pembersihan aman
console.log('\n▶ [2/3] Mengeksekusi Pembersihan Aman:');

// 3a. Bersihkan Build Cache BuildKit (Penyebab utama disk membengkak)
console.log('  → [A] Membersihkan BuildKit Build Cache (docker builder prune -a -f)...');
runCmd('docker', ['builder', 'prune', '-a', '-f']);

// 3b. Bersihkan Dangling Images (<none>)
console.log('\n  → [B] Membersihkan Dangling Images (docker image prune -f)...');
runCmd('docker', ['image', 'prune', '-f']);

// 3c. Bersihkan Stopped / Exited Containers (jika ada sisa testing)
console.log('\n  → [C] Membersihkan Stopped Containers (docker container prune -f)...');
runCmd('docker', ['container', 'prune', '-f']);

// 4. Ambil statistik sesudah pembersihan
console.log('\n================================================================================');
console.log('▶ [3/3] Hasil Penggunaan Disk Setelah Pembersihan:');
console.log('================================================================================');
runCmd('docker', ['system', 'df']);

// 5. Verifikasi integritas kontainer aktif
console.log('\n▶ Verifikasi Kontainer Aktif Amanah:');
runCmd('docker', ['ps']);

console.log('\n================================================================================');
console.log(' PEMBERSIHAN DOCKER SELESAI DENGAN AMAN (Zero Volume Loss)');
console.log('================================================================================\n');
