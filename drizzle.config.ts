import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

const host = process.env.DATABASE_HOST || '127.0.0.1';
const isLocalHost = host === 'localhost' || host === '127.0.0.1';
const port = isLocalHost
  ? (process.env.POSTGRES_HOST_PORT || process.env.DATABASE_PORT || '5433')
  : (process.env.DATABASE_PORT || '5432');
const username = process.env.DATABASE_USERNAME || 'amanah';
const password = process.env.DATABASE_PASSWORD || 'amanah_secret';
const database = process.env.DATABASE_NAME || 'amanah_healthcare';

export default defineConfig({
  schema: './src/database/schema/*.schema.ts',
  out: './src/database/migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      `postgresql://${username}:${password}@${host}:${port}/${database}`,
  },
});
