#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

if (
  process.env.NO_DOCKER ||
  process.env.IS_DOCKER ||
  process.env.DOCKER_BUILD ||
  existsSync('/.dockerenv') ||
  process.env.CI
) {
  process.exit(0);
}

const dockerCheck = spawnSync('docker', ['info'], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
});

if (dockerCheck.status !== 0) {
  console.log('[Docker Sync] Docker daemon tidak aktif atau tidak ditemukan. Melewati sinkronisasi Docker.');
  process.exit(0);
}

const repoRoot = resolve(import.meta.dir, '../..');
const forceRebuild = process.argv.includes('--rebuild') || process.argv.includes('-r') || process.env.DOCKER_FORCE_REBUILD === '1';

console.log('\n================================================================================');
console.log(' [Docker Sync] Local build selesai. Memulai sinkronisasi cepat ke Docker...');
console.log('================================================================================');

if (forceRebuild) {
  console.log('[Docker Sync] Mode rebuild aktif. Membangun ulang image api...');
  spawnSync('docker', ['compose', 'build', 'api'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  spawnSync('docker', ['compose', 'up', '-d', '--no-deps', 'api'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  spawnSync('docker', ['image', 'prune', '-f'], {
    cwd: repoRoot,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  console.log('[Docker Sync] Image backend-api berhasil dibangun ulang & container diperbarui.');
  console.log('================================================================================\n');
  process.exit(0);
}

const runningCheck = spawnSync('docker', ['compose', 'ps', '--status', 'running', '-q', 'api'], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const isRunning = Boolean(runningCheck.stdout && runningCheck.stdout.trim());

if (isRunning) {
  console.log('[Docker Sync] Container api aktif. Menyalin build artifacts (dist) ke container...');
  const cpResult = spawnSync('docker', ['compose', 'cp', 'dist/.', 'api:/usr/src/app/dist/'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (cpResult.status !== 0) {
    console.warn('[Docker Sync] Gagal menyalin dist ke container api. Kode keluar:', cpResult.status);
    process.exit(0);
  }

  console.log('[Docker Sync] Merestart container api...');
  spawnSync('docker', ['compose', 'restart', 'api'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  console.log('[Docker Sync] Sinkronisasi instan selesai! 0 build overhead, 0 disk bloat.');
  console.log('================================================================================\n');
  process.exit(0);
}

const imageCheck = spawnSync('docker', ['images', '-q', 'backend-api'], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const hasImage = Boolean(imageCheck.stdout && imageCheck.stdout.trim());

if (hasImage) {
  console.log('[Docker Sync] Container api tidak aktif tetapi image tersedia. Menyalakan stack...');
  spawnSync('docker', ['compose', 'up', '-d', 'api'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  spawnSync('docker', ['compose', 'cp', 'dist/.', 'api:/usr/src/app/dist/'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  spawnSync('docker', ['compose', 'restart', 'api'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  console.log('[Docker Sync] Container api berhasil dinyalakan dan disinkronisasi.');
} else {
  console.log('[Docker Sync] Image backend-api belum ada. Menjalankan initial build...');
  spawnSync('docker', ['compose', 'build', 'api'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  spawnSync('docker', ['compose', 'up', '-d', 'api'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  spawnSync('docker', ['image', 'prune', '-f'], {
    cwd: repoRoot,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });

  console.log('[Docker Sync] Initial build dan deployment stack api selesai.');
}

console.log('================================================================================\n');
process.exit(0);
