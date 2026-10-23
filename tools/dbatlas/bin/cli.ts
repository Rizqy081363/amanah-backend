#!/usr/bin/env bun
/**
 * DB Atlas - Command Line Interface (CLI Entrypoint)
 * Single Source of Truth for Database Introspection & Schema Mapping.
 *
 * Complies with docs/get-to-know-the-db/01-PHILOSOPHY.md and 02-ARCHITECTURE.md
 */

import { loadDbAtlasConfig } from '../config/config.loader';
import { PgTransport } from '../transport/pg-transport';
import { DockerTransport } from '../transport/docker-transport';
import type { DatabaseTransport } from '../transport/transport.interface';
import { runDoctorCommand } from '../commands/doctor.cmd';
import { runGenerateCommand } from '../commands/generate.cmd';
import { runCheckCommand } from '../commands/check.cmd';
import { runShowCommand } from '../commands/show.cmd';
import { runPathCommand } from '../commands/path.cmd';
import { runFindCommand } from '../commands/find.cmd';
import { runEnumCommand } from '../commands/enum.cmd';
import { runDiffCommand } from '../commands/diff.cmd';
import { runLintCommand } from '../commands/lint.cmd';

async function resolveTransport(config: any): Promise<DatabaseTransport> {
  // Coba PgTransport (TCP) terlebih dahulu
  const pgTransport = new PgTransport(config.connection);
  const testRes = await pgTransport.testConnection();
  if (testRes.ok) {
    return pgTransport;
  }

  // Fallback ke DockerTransport jika port TCP tidak dapat diakses langsung
  console.warn(`[dbatlas] Koneksi TCP langsung gagal (${testRes.error}). Menggunakan DockerExecTransport fallback...`);
  const dockerTransport = new DockerTransport(config.connection);
  return dockerTransport;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'generate';

  const { config, workspaceRoot, sensitivityRules } = loadDbAtlasConfig();

  let exitCode = 0;

  try {
    switch (command) {
      case 'doctor': {
        const transport = await resolveTransport(config);
        exitCode = await runDoctorCommand(transport, config);
        await transport.disconnect();
        break;
      }

      case 'generate': {
        const transport = await resolveTransport(config);
        exitCode = await runGenerateCommand(transport, config, sensitivityRules, workspaceRoot);
        await transport.disconnect();
        break;
      }

      case 'check': {
        const transport = await resolveTransport(config);
        exitCode = await runCheckCommand(transport, config, workspaceRoot);
        await transport.disconnect();
        break;
      }

      case 'show': {
        const tableName = args[1];
        exitCode = runShowCommand(tableName, config, workspaceRoot);
        break;
      }

      case 'path': {
        const from = args[1];
        const to = args[2];
        exitCode = runPathCommand(from, to, config, workspaceRoot);
        break;
      }

      case 'find': {
        const term = args[1];
        exitCode = runFindCommand(term, config, workspaceRoot);
        break;
      }

      case 'enum': {
        const enumName = args[1];
        exitCode = runEnumCommand(enumName, config, workspaceRoot);
        break;
      }

      case 'diff': {
        const pathA = args[1];
        const pathB = args[2];
        exitCode = runDiffCommand(pathA, pathB, workspaceRoot);
        break;
      }

      case 'lint': {
        exitCode = runLintCommand(config, workspaceRoot);
        break;
      }

      case 'help':
      case '--help':
      case '-h':
      default: {
        console.log(`
DB Atlas CLI — Database Introspection & Schema Mapping Utility

Penggunaan:
  dbatlas <command> [arguments]

Perintah yang membutuhkan Database:
  doctor              Memeriksa konektivitas dan kesehatan izin database
  generate            Membangun peta deterministik lengkap ke folder db-atlas/
  check               Memeriksa drift skema live vs committed FINGERPRINT.json (Exit 0=fresh, 2=drift)

Perintah Offline (100% dari file db-atlas/, tanpa sentuh database):
  show <table>        Menampilkan kartu tabel detail dan tetangga relasinya
  path <from> <to>    Mencari rute join terpendek dengan klausa SQL dan peringatan fan-out
  find <term>         Mencari tabel, kolom, nilai enum, dan komentar
  enum <name>         Menampilkan nilai berurutan enum resmi dan kolom yang menggunakannya
  diff <fileA> <fileB> Membandingkan dua file atlas.json untuk mendeteksi breaking changes
  lint                Menampilkan saran perbaikan indeks dan skema
        `);
        exitCode = command === 'help' || command === '--help' ? 0 : 1;
        break;
      }
    }
  } catch (err: any) {
    console.error(`\n[FATAL ERROR] ${err.message}`);
    exitCode = 4;
  }

  process.exit(exitCode);
}

main();
