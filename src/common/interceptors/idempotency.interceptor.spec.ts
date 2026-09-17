import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { RedisService } from '../redis/redis.service';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let redisService: jest.Mocked<RedisService>;
  let reflector: jest.Mocked<Reflector>;

  const mockHandler: CallHandler = {
    handle: jest.fn().mockReturnValue(of({ success: true, result: 'done' })),
  };

  const createMockContext = (
    method = 'POST',
    headers: Record<string, string | undefined> = {},
    body: any = { data: 'test' },
    query: any = {},
  ): ExecutionContext => {
    const req: any = {
      method,
      headers,
      body,
      query,
      path: '/api/v1/test-action',
      ip: '127.0.0.1',
    };
    const res: any = {
      statusCode: 200,
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      getHeader: jest.fn().mockReturnValue(undefined),
    };

    return {
      getType: jest.fn().mockReturnValue('http'),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => req,
        getResponse: () => res,
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    redisService = {
      setNx: jest.fn().mockResolvedValue(true),
      getString: jest.fn().mockResolvedValue(null),
      setString: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RedisService>;

    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({}),
    } as unknown as jest.Mocked<Reflector>;

    interceptor = new IdempotencyInterceptor(redisService, reflector);
    jest.clearAllMocks();
  });

  it('should pass through non-HTTP requests without Redis interaction', async () => {
    const nonHttpContext = {
      getType: jest.fn().mockReturnValue('rpc'),
    } as unknown as ExecutionContext;

    const result$ = await interceptor.intercept(nonHttpContext, mockHandler);
    expect(result$).toBeDefined();
    expect(redisService.setNx).not.toHaveBeenCalled();
  });

  it('should pass through GET requests without idempotency check', async () => {
    const ctx = createMockContext('GET', { 'idempotency-key': 'abc-123' });
    const result$ = await interceptor.intercept(ctx, mockHandler);

    expect(result$).toBeDefined();
    expect(redisService.setNx).not.toHaveBeenCalled();
  });

  it('should pass through POST requests without Idempotency-Key when not required', async () => {
    const ctx = createMockContext('POST', {});
    const result$ = await interceptor.intercept(ctx, mockHandler);

    expect(result$).toBeDefined();
    expect(redisService.setNx).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException when Idempotency-Key is required but missing', async () => {
    reflector.getAllAndOverride.mockReturnValue({ required: true });
    const ctx = createMockContext('POST', {});

    await expect(interceptor.intercept(ctx, mockHandler)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException when Idempotency-Key exceeds max length', async () => {
    const overlengthKey = 'a'.repeat(129);
    const ctx = createMockContext('POST', { 'idempotency-key': overlengthKey });

    await expect(interceptor.intercept(ctx, mockHandler)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should acquire lock and record completed result on first execution', async () => {
    const ctx = createMockContext('POST', { 'idempotency-key': 'key-001' });
    redisService.setNx.mockResolvedValue(true);

    const result$ = await interceptor.intercept(ctx, mockHandler);
    expect(result$).toBeDefined();

    // Consume observable to trigger pipe
    const emitted = await new Promise((resolve, reject) => {
      result$.subscribe({ next: resolve, error: reject });
    });

    expect(emitted).toEqual({ success: true, result: 'done' });
    expect(redisService.setNx).toHaveBeenCalled();
    expect(redisService.setString).toHaveBeenCalled();
  });

  it('should replay recorded result when identical key and payload are sent (API-141)', async () => {
    const ctx = createMockContext('POST', { 'idempotency-key': 'key-001' });
    redisService.setNx.mockResolvedValue(false);

    // Compute expected payload hash
    const initialRecord = {
      status: 'COMPLETED',
      payloadHash: (interceptor as any).computePayloadHash(
        { data: 'test' },
        {},
      ),
      statusCode: 201,
      headers: { location: '/api/v1/appointments/99' },
      body: { id: 99, status: 'CREATED' },
    };
    redisService.getString.mockResolvedValue(JSON.stringify(initialRecord));

    const result$ = await interceptor.intercept(ctx, mockHandler);
    const emitted = await new Promise((resolve, reject) => {
      result$.subscribe({ next: resolve, error: reject });
    });

    expect(emitted).toEqual({ id: 99, status: 'CREATED' });
    const res = ctx.switchToHttp().getResponse();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.setHeader).toHaveBeenCalledWith('Idempotent-Replay', 'true');
    expect(res.setHeader).toHaveBeenCalledWith('Location', '/api/v1/appointments/99');
  });

  it('should throw ConflictException on payload mismatch (API-142)', async () => {
    const ctx = createMockContext('POST', { 'idempotency-key': 'key-001' }, {
      data: 'different-data',
    });
    redisService.setNx.mockResolvedValue(false);

    const existingRecord = {
      status: 'COMPLETED',
      payloadHash: 'different-hash',
      statusCode: 200,
      body: { id: 1 },
    };
    redisService.getString.mockResolvedValue(JSON.stringify(existingRecord));

    await expect(interceptor.intercept(ctx, mockHandler)).rejects.toThrow(
      ConflictException,
    );
  });

  it('should throw ConflictException when in-flight request exceeds bounded wait (API-144)', async () => {
    reflector.getAllAndOverride.mockReturnValue({ concurrencyWaitMs: 50 });
    const ctx = createMockContext('POST', { 'idempotency-key': 'key-001' });
    redisService.setNx.mockResolvedValue(false);

    const payloadHash = (interceptor as any).computePayloadHash(
      { data: 'test' },
      {},
    );
    const existingRecord = {
      status: 'IN_PROGRESS',
      payloadHash,
    };
    redisService.getString.mockResolvedValue(JSON.stringify(existingRecord));

    await expect(interceptor.intercept(ctx, mockHandler)).rejects.toThrow(
      ConflictException,
    );
  });

  it('should clean up Redis lock when handler throws an error', async () => {
    const ctx = createMockContext('POST', { 'idempotency-key': 'key-error' });
    redisService.setNx.mockResolvedValue(true);

    const failingHandler: CallHandler = {
      handle: jest.fn().mockReturnValue(
        throwError(() => new Error('Business failure')),
      ),
    };

    const result$ = await interceptor.intercept(ctx, failingHandler);
    await expect(
      new Promise((resolve, reject) => {
        result$.subscribe({ next: resolve, error: reject });
      }),
    ).rejects.toThrow('Business failure');

    expect(redisService.delete).toHaveBeenCalled();
  });

  it('should fail-safe and execute handler if Redis errors during lock acquisition', async () => {
    const ctx = createMockContext('POST', { 'idempotency-key': 'key-down' });
    redisService.setNx.mockRejectedValue(new Error('Redis connection down'));

    const result$ = await interceptor.intercept(ctx, mockHandler);
    expect(result$).toBeDefined();
    expect(mockHandler.handle).toHaveBeenCalled();
  });
});
