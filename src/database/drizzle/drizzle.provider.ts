import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../schema';
import { DRIZZLE_SOURCE } from './drizzle.constants';
import { AllConfigType } from '../../config/config.type';

export type DrizzleDatabase = NodePgDatabase<typeof schema>;

export const drizzleProvider: Provider = {
  provide: DRIZZLE_SOURCE,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<AllConfigType>): DrizzleDatabase => {
    const isSslEnabled = configService.get('database.sslEnabled', {
      infer: true,
    });
    const pool = new Pool({
      connectionString: configService.get('database.url', { infer: true }),
      host: configService.get('database.host', { infer: true }),
      port: configService.get('database.port', { infer: true }),
      user: configService.get('database.username', { infer: true }),
      password: configService.get('database.password', { infer: true }),
      database: configService.get('database.name', { infer: true }),
      max: configService.get('database.maxConnections', { infer: true }) || 20,
      ssl: isSslEnabled
        ? {
            rejectUnauthorized: configService.get(
              'database.rejectUnauthorized',
              { infer: true },
            ),
            ca: configService.get('database.ca', { infer: true }) ?? undefined,
            key:
              configService.get('database.key', { infer: true }) ?? undefined,
            cert:
              configService.get('database.cert', { infer: true }) ?? undefined,
          }
        : undefined,
    });

    return drizzle(pool, { schema });
  },
};
