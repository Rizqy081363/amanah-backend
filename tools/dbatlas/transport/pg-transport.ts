/**
 * DB Atlas - Native TCP Postgres Transport (via 'pg' Driver)
 * Complies with P1, P2 (Session Guard, Read-Only, Isolation).
 */

import { Client } from 'pg';
import type { DatabaseConnectionConfig } from '../config/config.interface';
import { DbAtlasGuard } from '../core/guard';
import type { DatabaseTransport } from './transport.interface';

export class PgTransport implements DatabaseTransport {
  public name = 'pg-tcp';
  private client: Client | null = null;
  private inTransaction = false;

  constructor(private readonly config: DatabaseConnectionConfig) {}

  async connect(): Promise<void> {
    if (this.client) return;

    const connectionString =
      (this.config.envVar && process.env[this.config.envVar]) ||
      undefined;

    this.client = connectionString
      ? new Client({ connectionString })
      : new Client({
          host: this.config.host || '127.0.0.1',
          port: this.config.port || 5433,
          database: this.config.database || 'amanah_healthcare',
          user: this.config.user || 'amanah',
          password: this.config.password || 'amanah',
          statement_timeout: 15000,
          query_timeout: 15000,
          application_name: 'dbatlas',
        });

    await this.client.connect();

    // Session guards (P2)
    await this.client.query('SET default_transaction_read_only = on;');
    await this.client.query("SET statement_timeout = '15s';");
    await this.client.query("SET lock_timeout = '2s';");
    await this.client.query("SET application_name = 'dbatlas';");

    // Konsisten snapshot untuk semua ekstraktor (P1 & P2)
    await this.client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;');
    this.inTransaction = true;
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    try {
      if (this.inTransaction) {
        await this.client.query('ROLLBACK;');
        this.inTransaction = false;
      }
    } catch {
      // Abaikan jika koneksi sudah terputus
    } finally {
      await this.client.end();
      this.client = null;
    }
  }

  async queryJson<T>(sql: string): Promise<T> {
    DbAtlasGuard.validateSql(sql);
    if (!this.client) {
      await this.connect();
    }

    const res = await this.client!.query(sql);
    // Jika query menggunakan json_agg atau jsonb_build_object, ambil nilai row pertama
    if (res.rows.length === 0) {
      return [] as unknown as T;
    }
    const firstRow = res.rows[0];
    const firstKey = Object.keys(firstRow)[0];
    return (firstRow[firstKey] ?? []) as T;
  }

  async testConnection(): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
      if (!this.client) {
        await this.connect();
      }
      const res = await this.client!.query('SELECT version();');
      return { ok: true, version: res.rows[0]?.version };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}
