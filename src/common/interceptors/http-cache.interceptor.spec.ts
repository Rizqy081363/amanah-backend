import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { HttpCacheOptions } from '../decorators/http-cache.decorator';
import { RedisService } from '../redis/redis.service';
import { HttpCacheInterceptor } from './http-cache.interceptor';

describe('HttpCacheInterceptor', () => {
  let interceptor: HttpCacheInterceptor;
  let reflector: jest.Mocked<Reflector>;
  let redisService: jest.Mocked<RedisService>;

  const createMockContext = (
    method = 'GET',
    headers: Record<string, string> = {},
    user: any = null,
    path = '/api/v1/test-resource',
    query: Record<string, string> = {},
  ): ExecutionContext => {
    const responseHeaders: Record<string, string> = {};
    let statusCode = 200;

    const req = {
      method,
      headers: { ...headers },
      user,
      path,
      baseUrl: '',
      query,
    };

    const res = {
      statusCode,
      status: jest.fn().mockImplementation((code: number) => {
        statusCode = code;
        res.statusCode = code;
        return res;
      }),
      setHeader: jest.fn().mockImplementation((name: string, val: string) => {
        responseHeaders[name.toLowerCase()] = val;
      }),
      getHeader: jest.fn().mockImplementation((name: string) => {
        return responseHeaders[name.toLowerCase()];
      }),
    };

    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    redisService = {
      getJson: jest.fn(),
      setJson: jest.fn().mockResolvedValue(undefined),
      addKeyToTag: jest.fn().mockResolvedValue(undefined),
      invalidateTags: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RedisService>;

    interceptor = new HttpCacheInterceptor(reflector, redisService);
  });

  it('should pass through non-GET requests without caching', async () => {
    const ctx = createMockContext('POST');
    const handler = {
      handle: jest.fn().mockReturnValue(of({ success: true })),
    };

    const result$ = await interceptor.intercept(ctx, handler);
    const emitted = await firstValueFrom(result$);

    expect(handler.handle).toHaveBeenCalled();
    expect(redisService.getJson).not.toHaveBeenCalled();
    expect(emitted).toEqual({ success: true });
  });

  it('should pass through GET requests without @HttpCache metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = createMockContext('GET');
    const handler = { handle: jest.fn().mockReturnValue(of({ data: 'raw' })) };

    const result$ = await interceptor.intercept(ctx, handler);
    const emitted = await firstValueFrom(result$);

    expect(handler.handle).toHaveBeenCalled();
    expect(redisService.getJson).not.toHaveBeenCalled();
    expect(emitted).toEqual({ data: 'raw' });
  });

  it('should handle Cache MISS: execute handler, set headers, compute ETag and store in Redis', async () => {
    const options: HttpCacheOptions = {
      ttlSeconds: 30,
      tags: ['test-tag'],
    };
    reflector.getAllAndOverride.mockReturnValue(options);
    redisService.getJson.mockResolvedValue(null);

    const ctx = createMockContext('GET');
    const res = ctx.switchToHttp().getResponse();
    const handler = {
      handle: jest.fn().mockReturnValue(of({ message: 'fresh data' })),
    };

    const result$ = await interceptor.intercept(ctx, handler);
    const emitted = await firstValueFrom(result$);

    expect(res.setHeader).toHaveBeenCalledWith('X-Cache-Lookup', 'MISS');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=30, must-revalidate',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Vary', 'Accept');
    expect(res.setHeader).toHaveBeenCalledWith(
      'ETag',
      expect.stringMatching(/^W\/".+"$/),
    );
    expect(redisService.setJson).toHaveBeenCalledWith(
      expect.stringContaining('httpcache:public:GET:/api/v1/test-resource'),
      expect.objectContaining({
        body: { message: 'fresh data' },
        statusCode: 200,
      }),
      30,
    );
    expect(redisService.addKeyToTag).toHaveBeenCalledWith(
      'test-tag',
      expect.stringContaining('httpcache:public:GET:/api/v1/test-resource'),
      30,
    );
    expect(emitted).toEqual({ message: 'fresh data' });
  });

  it('should handle Cache HIT: return cached body from Redis without calling handler', async () => {
    const options: HttpCacheOptions = { ttlSeconds: 60 };
    reflector.getAllAndOverride.mockReturnValue(options);

    const cachedData = {
      body: { message: 'cached data' },
      etag: 'W/"abc12345"',
      statusCode: 200,
    };
    redisService.getJson.mockResolvedValue(cachedData);

    const ctx = createMockContext('GET');
    const res = ctx.switchToHttp().getResponse();
    const handler = { handle: jest.fn() };

    const result$ = await interceptor.intercept(ctx, handler);
    const emitted = await firstValueFrom(result$);

    expect(handler.handle).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache-Lookup', 'HIT');
    expect(res.setHeader).toHaveBeenCalledWith('ETag', 'W/"abc12345"');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(emitted).toEqual({ message: 'cached data' });
  });

  it('should return 304 Not Modified when If-None-Match matches ETag (API-153)', async () => {
    const options: HttpCacheOptions = { ttlSeconds: 60 };
    reflector.getAllAndOverride.mockReturnValue(options);

    const cachedData = {
      body: { message: 'expensive payload' },
      etag: 'W/"matching-etag-123"',
      statusCode: 200,
    };
    redisService.getJson.mockResolvedValue(cachedData);

    const ctx = createMockContext('GET', {
      'if-none-match': 'W/"matching-etag-123"',
    });
    const res = ctx.switchToHttp().getResponse();
    const handler = { handle: jest.fn() };

    const result$ = await interceptor.intercept(ctx, handler);
    const emitted = await firstValueFrom(result$);

    expect(handler.handle).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(304);
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache-Lookup', 'HIT');
    expect(emitted).toBeUndefined();
  });

  it('should scope private cache to caller id (API-150)', async () => {
    const options: HttpCacheOptions = { ttlSeconds: 60, isPrivate: true };
    reflector.getAllAndOverride.mockReturnValue(options);
    redisService.getJson.mockResolvedValue(null);

    const ctx = createMockContext('GET', {}, { id: 'user-uuid-999' });
    const res = ctx.switchToHttp().getResponse();
    const handler = {
      handle: jest.fn().mockReturnValue(of({ userRecord: 1 })),
    };

    const result$ = await interceptor.intercept(ctx, handler);
    await firstValueFrom(result$);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-cache',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Vary', 'Accept, Authorization');
    expect(redisService.getJson).toHaveBeenCalledWith(
      expect.stringContaining('httpcache:private:user-uuid-999:GET'),
    );
  });

  it('should gracefully degrade if Redis throws during lookup (fail-safe)', async () => {
    const options: HttpCacheOptions = { ttlSeconds: 60 };
    reflector.getAllAndOverride.mockReturnValue(options);
    redisService.getJson.mockRejectedValue(new Error('Redis connection down'));

    const ctx = createMockContext('GET');
    const handler = {
      handle: jest.fn().mockReturnValue(of({ fallback: 'data' })),
    };

    const result$ = await interceptor.intercept(ctx, handler);
    const emitted = await firstValueFrom(result$);

    expect(handler.handle).toHaveBeenCalled();
    expect(emitted).toEqual({ fallback: 'data' });
  });
});
