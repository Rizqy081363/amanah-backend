import { execSync } from 'child_process';

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

const diffOutput = run('git diff ORIG_HEAD HEAD --name-only');
if (!diffOutput) {
  process.exit(0);
}

const files = diffOutput.split('\n').filter(Boolean);

console.log('\n==========================================================');
console.log(' 🔄 [AMANAH MONOREPO POST-MERGE AUDIT]');
console.log('==========================================================');

const touchesDeps = files.some((f) => f.includes('package.json') || f.includes('bun.lock'));
const touchesMigrations = files.some((f) => f.includes('migrations/') || f.includes('/schema/'));
const touchesVault = files.some((f) => f.includes('.env.example') || f.includes('dist-vault/'));

if (touchesDeps) {
  console.log(' 📦 Dependencies berubah! Jalankan:');
  console.log('    bun install');
}

if (touchesMigrations) {
  console.log(' 🗄️ Migrasi database baru terdeteksi! Jalankan:');
  console.log('    bun run db:migrate');
  console.log('    bun run db:atlas');
}

if (touchesVault) {
  console.log(' 🔐 Paket environment / vault diperbarui! Jalankan:');
  console.log('    .\\pack-vault.ps1 -Unpack');
}

console.log('==========================================================\n');
