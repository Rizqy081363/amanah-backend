import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AllConfigType } from '../../config/config.type';
import * as relations from '../schema/amanah.relations';
import * as tables from '../schema/amanah.schema';
import * as immunizationRelations from '../schema/immunization.relations';
import * as immunizationTables from '../schema/immunization.schema';
import * as maternalRelations from '../schema/maternal.relations';
import * as maternalTables from '../schema/maternal.schema';
import * as outboxTables from '../schema/outbox.schema';
import * as queueTicketingRelations from '../schema/queue-ticketing.relations';
import * as queueTicketingTables from '../schema/queue-ticketing.schema';
import { DRIZZLE_SOURCE, POSTGRES_POOL } from './drizzle.constants';

const schema = {
  ...tables,
  ...relations,
  ...maternalTables,
  ...maternalRelations,
  ...immunizationTables,
  ...immunizationRelations,
  ...outboxTables,
  ...queueTicketingTables,
  ...queueTicketingRelations,
};

export type DrizzleDatabase = NodePgDatabase<typeof schema>;
export const DrizzleDatabase = Symbol('DrizzleDatabase');

export const postgresPoolProvider: Provider = {
  provide: POSTGRES_POOL,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<AllConfigType>): Pool => {
    const isSslEnabled = configService.get('database.sslEnabled', {
      infer: true,
    });

    const dbTimezone =
      configService.get('time.dbTimezone', { infer: true }) || 'UTC';

    const pool = new Pool({
      connectionString: configService.get('database.url', { infer: true }),
      host: configService.get('database.host', { infer: true }),
      port: configService.get('database.port', { infer: true }),
      user: configService.get('database.username', { infer: true }),
      password: configService.get('database.password', { infer: true }),
      database: configService.get('database.name', { infer: true }),
      max: configService.get('database.maxConnections', { infer: true }) || 20,
      options: `-c timezone=${dbTimezone}`,
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

    pool.on('connect', (client) => {
      client.query("SELECT set_config('TimeZone', $1, false)", [dbTimezone]);
    });

    return pool;
  },
};

export const drizzleProvider: Provider = {
  provide: DRIZZLE_SOURCE,
  inject: [POSTGRES_POOL],
  useFactory: (pool: Pool): DrizzleDatabase => {
    return drizzle(pool, { schema });
  },
};
