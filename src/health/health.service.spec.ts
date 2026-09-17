import { QueryResult } from 'pg';
import { RedisService } from '../common/redis/redis.service';
import { DrizzleDatabase } from '../database/drizzle/drizzle.provider';
import { HealthService } from './health.service';

const readyDatabaseResult: QueryResult<Record<string, unknown>> = {
  command: 'SELECT',
  fields: [],
  oid: 0,
  rowCount: 1,
  rows: [],
};

const createDatabase = () =>
  ({
    execute: jest.fn(),
  }) as unknown as DrizzleDatabase;

const createRedisService = () =>
  ({
    ping: jest.fn(),
  }) as unknown as RedisService;

describe('HealthService', () => {
  it('should report readiness when database and redis are up', async () => {
    const database = createDatabase();
    const redisService = createRedisService();
    jest.mocked(database.execute).mockResolvedValue(readyDatabaseResult);
    jest.mocked(redisService.ping).mockResolvedValue('PONG');
    const service = new HealthService(database, redisService);

    await expect(service.getReadiness()).resolves.toEqual({
      status: 'up',
      dependencies: [
        { name: 'database', status: 'up' },
        { name: 'redis', status: 'up' },
      ],
    });
    expect(database.execute).toHaveBeenCalledTimes(1);
  });

  it('should report dependency detail when redis is down', async () => {
    const database = createDatabase();
    const redisService = createRedisService();
    jest.mocked(database.execute).mockResolvedValue(readyDatabaseResult);
    jest.mocked(redisService.ping).mockRejectedValue(new Error('offline'));
    const service = new HealthService(database, redisService);

    await expect(service.getReadiness()).resolves.toEqual({
      status: 'down',
      dependencies: [
        { name: 'database', status: 'up' },
        { name: 'redis', status: 'down', detail: 'offline' },
      ],
    });
  });
});
