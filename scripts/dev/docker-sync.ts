#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// 1. Guard against running inside Docker container, CI, or when explicitly bypassed
if (
  process.env.NO_DOCKER ||
  process.env.IS_DOCKER ||
  process.env.DOCKER_BUILD ||
  existsSync('/.dockerenv') ||
  process.env.CI
) {
  process.exit(0);
}

// 2. Check if Docker is installed and daemon is running
const dockerCheck = spawnSync('docker', ['info'], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
});

if (dockerCheck.status !== 0) {
  console.log('[Docker Sync] Docker daemon tidak aktif atau tidak ditemukan. Melewati build Docker.');
  process.exit(0);
}

const repoRoot = resolve(import.meta.dir, '../..');

console.log('\n================================================================================');
console.log(' [Docker Sync] Local build selesai. Sinkronisasi otomatis ke Docker (backend-api)...');
console.log('================================================================================');

// 3. Build Docker container image
const buildResult = spawnSync('docker', ['compose', 'build', 'api'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (buildResult.status !== 0) {
  console.warn('[Docker Sync] Perhatian: Docker build selesai dengan kode keluar', buildResult.status);
  process.exit(0);
}

// 4. Cek apakah container backend-api sedang aktif (running)
const psResult = spawnSync('docker', ['compose', 'ps', '-q', 'api'], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const isRunning = Boolean(psResult.stdout && psResult.stdout.trim());

if (isRunning) {
  console.log('[Docker Sync] Container api sedang berjalan. Memperbarui container dengan image baru...');
  spawnSync('docker', ['compose', 'up', '-d', '--no-deps', 'api'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  console.log('[Docker Sync] Container backend-api berhasil diperbarui!');
} else {
  console.log('[Docker Sync] Image Docker backend-api berhasil di-build.');
}
console.log('================================================================================\n');
process.exit(0);
