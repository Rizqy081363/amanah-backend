import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  schema: './src/database/schema/*.schema.ts',
  out: './src/database/migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      `postgresql://${process.env.DATABASE_USERNAME || 'amanah'}:${process.env.DATABASE_PASSWORD || 'amanah_secret'}@${process.env.DATABASE_HOST || '127.0.0.1'}:${process.env.POSTGRES_HOST_PORT || process.env.DATABASE_PORT || '5433'}/${process.env.DATABASE_NAME || 'amanah_healthcare'}`,
  },
});
