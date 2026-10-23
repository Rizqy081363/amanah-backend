import { execSync } from 'child_process';

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

const commitFiles = run('git diff-tree --no-commit-id --name-only -r HEAD').split('\n').filter(Boolean);

const touchesEnvOrVault = commitFiles.some((f) =>
  f.includes('.env.example') ||
  f.includes('env-vault') ||
  f.includes('vault') ||
  f.includes('pack-vault')
);

if (touchesEnvOrVault) {
  console.log('\n==========================================================');
  console.log(' 🔐 [TEAM VAULT NOTICE]');
  console.log(' Konfigurasi environment atau template kredensial diubah.');
  console.log(' 👉 Jalankan .\\pack-vault.ps1 untuk memperbarui bundle vault tim:');
  console.log('    .\\pack-vault.ps1');
  console.log('==========================================================\n');
}
