import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RATE_LIMIT_HEADER_LIMIT,
  RATE_LIMIT_HEADER_REMAINING,
  RATE_LIMIT_HEADER_RESET,
  RATE_LIMIT_TIERS,
  RETRY_AFTER_HEADER,
} from '../constants/rate-limit.constants';
import { RedisService } from '../redis/redis.service';
import { RATE_LIMIT_METADATA_KEY } from './rate-limit.decorator';
import { RateLimiterGuard } from './rate-limiter.guard';
import { SKIP_RATE_LIMIT_METADATA_KEY } from './skip-rate-limit.decorator';

describe('RateLimiterGuard', () => {
  let guard: RateLimiterGuard;
  let reflector: Reflector;
  let redisService: RedisService;
  let mockRequest: any;
  let mockResponse: any;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as Reflector;

    redisService = {
      consumeRateLimit: jest.fn(),
    } as unknown as RedisService;

    mockRequest = {
      url: '/api/v1/patients',
      originalUrl: '/api/v1/patients',
      method: 'GET',
      headers: {},
      ip: '192.168.1.100',
      socket: { remoteAddress: '192.168.1.100' },
    };

    const headersMap: Record<string, string> = {};
    mockResponse = {
      setHeader: jest.fn((name: string, value: string) => {
        headersMap[name] = value;
      }),
      getHeader: jest.fn((name: string) => headersMap[name]),
    };

    mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;

    guard = new RateLimiterGuard(reflector, redisService);
  });

  it('should allow request within limits and set X-RateLimit-* headers', async () => {
    (redisService.consumeRateLimit as jest.Mock).mockResolvedValueOnce({
      allowed: true,
      limit: 120,
      remaining: 119,
      resetEpochSeconds: 1789661460,
      retryAfterSeconds: 0,
    });

    const result = await guard.canActivate(mockContext);

    expect(result).toBe(true);
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      RATE_LIMIT_HEADER_LIMIT,
      '120',
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      RATE_LIMIT_HEADER_REMAINING,
      '119',
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      RATE_LIMIT_HEADER_RESET,
      '1789661460',
    );
  });

  it('should throw 429 and set Retry-After when rate limit is exceeded', async () => {
    (redisService.consumeRateLimit as jest.Mock).mockResolvedValueOnce({
      allowed: false,
      limit: 120,
      remaining: 0,
      resetEpochSeconds: 1789661460,
      retryAfterSeconds: 35,
    });

    await expect(guard.canActivate(mockContext)).rejects.toThrow(HttpException);
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      RETRY_AFTER_HEADER,
      '35',
    );
  });

  it('should skip rate limiting when SkipRateLimit decorator is present', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValueOnce(true);

    const result = await guard.canActivate(mockContext);

    expect(result).toBe(true);
    expect(redisService.consumeRateLimit).not.toHaveBeenCalled();
  });

  it('should apply custom RateLimit decorator options when present', async () => {
    (reflector.getAllAndOverride as jest.Mock)
      .mockReturnValueOnce(false) // SkipRateLimit
      .mockReturnValueOnce({ limit: 5, windowSeconds: 30 }); // RateLimit

    (redisService.consumeRateLimit as jest.Mock).mockResolvedValueOnce({
      allowed: true,
      limit: 5,
      remaining: 4,
      resetEpochSeconds: 1789661460,
      retryAfterSeconds: 0,
    });

    const result = await guard.canActivate(mockContext);

    expect(result).toBe(true);
    expect(redisService.consumeRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      5,
      30,
    );
  });

  it('should automatically apply AUTH tier (10 req/min) for auth routes', async () => {
    mockRequest.url = '/api/v1/auth/sign-in/email';
    mockRequest.originalUrl = '/api/v1/auth/sign-in/email';
    mockRequest.method = 'POST';

    (redisService.consumeRateLimit as jest.Mock).mockResolvedValueOnce({
      allowed: true,
      limit: RATE_LIMIT_TIERS.AUTH.limit,
      remaining: 9,
      resetEpochSeconds: 1789661460,
      retryAfterSeconds: 0,
    });

    await guard.canActivate(mockContext);

    expect(redisService.consumeRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      RATE_LIMIT_TIERS.AUTH.limit,
      RATE_LIMIT_TIERS.AUTH.windowSeconds,
    );
  });

  it('should automatically apply MUTATION tier (60 req/min) for state-changing methods', async () => {
    mockRequest.url = '/api/v1/appointments';
    mockRequest.originalUrl = '/api/v1/appointments';
    mockRequest.method = 'POST';

    (redisService.consumeRateLimit as jest.Mock).mockResolvedValueOnce({
      allowed: true,
      limit: RATE_LIMIT_TIERS.MUTATION.limit,
      remaining: 59,
      resetEpochSeconds: 1789661460,
      retryAfterSeconds: 0,
    });

    await guard.canActivate(mockContext);

    expect(redisService.consumeRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      RATE_LIMIT_TIERS.MUTATION.limit,
      RATE_LIMIT_TIERS.MUTATION.windowSeconds,
    );
  });

  it('should scope client key by userId when user is authenticated', async () => {
    mockRequest.user = { id: 'usr_doc_123' };

    (redisService.consumeRateLimit as jest.Mock).mockResolvedValueOnce({
      allowed: true,
      limit: 120,
      remaining: 119,
      resetEpochSeconds: 1789661460,
      retryAfterSeconds: 0,
    });

    await guard.canActivate(mockContext);

    expect(redisService.consumeRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('user:usr_doc_123'),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('should scope client key by token hash when bearer header is present', async () => {
    mockRequest.headers.authorization = 'Bearer test-bearer-token-123';

    (redisService.consumeRateLimit as jest.Mock).mockResolvedValueOnce({
      allowed: true,
      limit: 120,
      remaining: 119,
      resetEpochSeconds: 1789661460,
      retryAfterSeconds: 0,
    });

    await guard.canActivate(mockContext);

    expect(redisService.consumeRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('token:'),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('should scope client key by IP when neither user nor token is present', async () => {
    mockRequest.ip = '203.0.113.195';

    (redisService.consumeRateLimit as jest.Mock).mockResolvedValueOnce({
      allowed: true,
      limit: 120,
      remaining: 119,
      resetEpochSeconds: 1789661460,
      retryAfterSeconds: 0,
    });

    await guard.canActivate(mockContext);

    expect(redisService.consumeRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('ip:203.0.113.195'),
      expect.any(Number),
      expect.any(Number),
    );
  });
});
