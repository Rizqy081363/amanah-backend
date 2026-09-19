import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../database/drizzle/drizzle.constants';
import { MailService } from '../mail/mail.service';

jest.mock('./better-auth/auth', () => ({
  auth: {
    api: {
      sendVerificationOTP: jest.fn(),
      verifyEmailOTP: jest.fn(),
      resetPasswordEmailOTP: jest.fn(),
    },
  },
}));

import { AuthService } from './auth.service';

describe('AuthService - Account Purge', () => {
  let service: AuthService;
  let mockDb: any;
  let mockRedisService: any;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockMailService: any;

  beforeEach(async () => {
    mockDb = {
      execute: jest.fn().mockResolvedValue({ rowCount: 1 }),
      query: {
        users: {
          findFirst: jest.fn(),
        },
      },
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue({}),
        }),
      }),
    };

    mockRedisService = {
      purgeUserData: jest.fn().mockResolvedValue(4),
      getTtl: jest.fn(),
      consumeRateLimit: jest.fn(),
      setString: jest.fn(),
      setNx: jest.fn(),
    };

    mockJwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
    };

    mockMailService = {
      forgotPassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: DRIZZLE_SOURCE,
          useValue: mockDb,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('purgeAccount', () => {
    it('should execute database purge and redis purge successfully', async () => {
      const userPayload = {
        id: 'u-123',
        email: 'patient@amanah.health',
        systemRole: 'PATIENT' as const,
        role: { id: 'role-1', name: 'PATIENT' },
      };

      const result = await service.purgeAccount(userPayload);

      expect(mockDb.execute).toHaveBeenCalledTimes(2); // once for id, once for email
      expect(mockRedisService.purgeUserData).toHaveBeenCalledWith(
        'u-123',
        'patient@amanah.health',
      );
      expect(result.success).toBe(true);
      expect(result.details?.userId).toBe('u-123');
      expect(result.details?.email).toBe('patient@amanah.health');
      expect(result.purgedAt).toBeDefined();
    });

    it('should query user from database if email is absent from JWT payload', async () => {
      mockDb.query.users.findFirst.mockResolvedValueOnce({
        id: 'u-456',
        email: 'fallback@amanah.health',
      });

      const userPayload = {
        id: 'u-456',
        email: undefined as any,
        systemRole: 'PATIENT' as const,
        role: { id: 'role-1', name: 'PATIENT' },
      };

      const result = await service.purgeAccount(userPayload);

      expect(mockDb.query.users.findFirst).toHaveBeenCalledTimes(1);
      expect(mockDb.execute).toHaveBeenCalledTimes(2);
      expect(mockRedisService.purgeUserData).toHaveBeenCalledWith(
        'u-456',
        'fallback@amanah.health',
      );
      expect(result.success).toBe(true);
      expect(result.details?.email).toBe('fallback@amanah.health');
    });

    it('should fallback to softDelete and throw 500 if database execution fails', async () => {
      mockDb.execute.mockRejectedValueOnce(new Error('Foreign key violation'));

      const userPayload = {
        id: 'u-789',
        email: 'error@amanah.health',
        systemRole: 'PATIENT' as const,
        role: { id: 'role-1', name: 'PATIENT' },
      };

      await expect(service.purgeAccount(userPayload)).rejects.toThrow(
        HttpException,
      );

      // Verify softDelete fallback was called
      expect(mockDb.update).toHaveBeenCalled();
    });
  });
});
