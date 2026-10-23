/**
 * DB Atlas - Transport Interface
 * Abstraction layer for query execution against PostgreSQL.
 */

export interface DatabaseTransport {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  queryJson<T>(sql: string): Promise<T>;
  testConnection(): Promise<{ ok: boolean; version?: string; error?: string }>;
}
