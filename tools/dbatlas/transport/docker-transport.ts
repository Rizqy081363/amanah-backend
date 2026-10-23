/**
 * DB Atlas - Docker Exec Transport (Docker Compose Fallback)
 * Executes psql directly inside the database container.
 */

import { spawn } from 'node:child_process';
import type { DatabaseConnectionConfig } from '../config/config.interface';
import { DbAtlasGuard } from '../core/guard';
import type { DatabaseTransport } from './transport.interface';

export class DockerTransport implements DatabaseTransport {
  public name = 'docker-exec';

  constructor(private readonly config: DatabaseConnectionConfig) {}

  async connect(): Promise<void> {
    // Docker exec stateless, no persistent connection needed
  }

  async disconnect(): Promise<void> {
    // Stateless
  }

  async queryJson<T>(sql: string): Promise<T> {
    DbAtlasGuard.validateSql(sql);

    const container = this.config.dockerService || 'backend-postgres-1';
    const user = this.config.user || 'amanah';
    const db = this.config.database || 'amanah_healthcare';

    // Bungkus query dalam transaksi READ ONLY
    const wrappedSql = `BEGIN TRANSACTION READ ONLY; ${sql}; ROLLBACK;`;

    return new Promise((resolve, reject) => {
      const proc = spawn(
        'docker',
        ['exec', '-i', container, 'psql', '-X', '-A', '-t', '-U', user, '-d', db],
        { stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32' }
      );

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`[docker-transport] psql exited with code ${code}: ${stderr}`));
        }
        try {
          // psql -A -t mengembalikan output raw, cari baris JSON
          const trimmed = stdout.trim();
          if (!trimmed || trimmed === '[]' || trimmed === 'null') {
            return resolve([] as unknown as T);
          }
          // Ambil hasil query utama
          const parsed = JSON.parse(trimmed);
          resolve(parsed as T);
        } catch (err: any) {
          reject(new Error(`[docker-transport] Gagal parse JSON output: ${err.message}. Raw: ${stdout}`));
        }
      });

      proc.stdin.write(wrappedSql);
      proc.stdin.end();
    });
  }

  async testConnection(): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
      const res = await this.queryJson<string>(
        "SELECT json_build_object('version', version());"
      );
      return { ok: true, version: (res as any)?.version };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}
