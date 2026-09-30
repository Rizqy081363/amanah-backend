import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import Redis from 'ioredis';

export const repoRoot = resolve(import.meta.dir, '../../..');

export function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(filePath)) return result;

  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let val = match[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

const exampleEnv = parseEnvFile(resolve(repoRoot, '.env.example'));
const localEnv = parseEnvFile(resolve(repoRoot, '.env'));

export function getEnvValue(name: string, fallback: string): string {
  const fromProcess = process.env[name];
  if (fromProcess && fromProcess.trim()) return fromProcess.trim();
  const fromLocal = localEnv[name];
  if (fromLocal && fromLocal.trim()) return fromLocal.trim();
  const fromExample = exampleEnv[name];
  if (fromExample && fromExample.trim()) return fromExample.trim();
  return fallback;
}

export const dbHost = getEnvValue('DATABASE_HOST', 'localhost');
export const isLocal = dbHost === 'localhost' || dbHost === '127.0.0.1';
export const dbPort = parseInt(
  isLocal
    ? getEnvValue('POSTGRES_HOST_PORT', getEnvValue('DATABASE_PORT', '5433'))
    : getEnvValue('DATABASE_PORT', '5432'),
  10,
);
export const dbUser = getEnvValue('DATABASE_USERNAME', 'amanah');
export const dbPassword = getEnvValue('DATABASE_PASSWORD', 'amanah_secret');
export const dbName = getEnvValue('DATABASE_NAME', 'amanah_healthcare');

export const redisHost = getEnvValue('REDIS_HOST', 'localhost');
export const redisPort = parseInt(
  getEnvValue('REDIS_HOST_PORT', getEnvValue('REDIS_PORT', '6379')),
  10,
);

export const storageRoot = getEnvValue('STORAGE_ROOT', 'data/uploads');
export const resolvedStorageRoot = resolve(repoRoot, storageRoot);

export function createDbPool(): Pool {
  return new Pool({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    max: 3,
    connectionTimeoutMillis: 5000,
  });
}

export async function getRedisClient(): Promise<Redis | null> {
  try {
    const client = new Redis({
      host: redisHost,
      port: redisPort,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    await client.connect();
    return client;
  } catch {
    return null;
  }
}

export async function invalidateRedisTagsAndPrefixes(
  redis: Redis | null,
  tags: string[],
  patterns: string[] = [],
): Promise<number> {
  if (!redis) return 0;
  let deletedCount = 0;
  try {
    const keysToDelete = new Set<string>();

    for (const tag of tags) {
      const tagSearchPatterns = [`*tag:${tag}`, `tag:${tag}`];
      for (const tsp of tagSearchPatterns) {
        const matchedTagKeys = await redis.keys(tsp);
        for (const tk of matchedTagKeys) {
          const members = await redis.smembers(tk);
          for (const m of members) {
            keysToDelete.add(m);
            const prefixedM = await redis.keys(`*${m}`);
            for (const pm of prefixedM) keysToDelete.add(pm);
          }
          keysToDelete.add(tk);
        }
      }
    }

    for (const pat of patterns) {
      const matched = await redis.keys(pat);
      for (const k of matched) keysToDelete.add(k);
    }

    if (keysToDelete.size > 0) {
      const arr = Array.from(keysToDelete);
      const chunkSize = 50;
      for (let i = 0; i < arr.length; i += chunkSize) {
        const slice = arr.slice(i, i + chunkSize);
        await redis.del(...slice);
      }
      deletedCount = keysToDelete.size;
    }
  } catch (err: unknown) {
    console.warn('[WARN] Redis invalidation encountered warning:', err instanceof Error ? err.message : String(err));
  }
  return deletedCount;
}
