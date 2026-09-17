import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogEntity } from '../domain/entities/audit-log.entity';
import {
  AUDIT_LOG_REPOSITORY,
  AuditLogRepository,
} from '../domain/repositories/audit-log.repository';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let repo: jest.Mocked<AuditLogRepository>;

  const mockLog: AuditLogEntity = {
    id: 'log-123',
    actorUserId: 'user-1',
    actorRoleCode: 'ADMIN',
    action: 'create_appointment',
    entityTable: 'appointments',
    entityId: 'apt-123',
    oldValues: null,
    newValues: { status: 'booked' },
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockRepo: jest.Mocked<AuditLogRepository> = {
      create: jest.fn().mockResolvedValue(mockLog),
      findAll: jest.fn().mockResolvedValue({ items: [mockLog], total: 1 }),
      findById: jest.fn().mockResolvedValue(mockLog),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: AUDIT_LOG_REPOSITORY,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    repo = module.get(AUDIT_LOG_REPOSITORY);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordLog', () => {
    it('should create an audit log successfully', async () => {
      const result = await service.recordLog({
        action: 'create_appointment',
        entityTable: 'appointments',
        entityId: 'apt-123',
        newValues: { status: 'booked' },
      });

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockLog);
    });

    it('should catch error and return null without throwing (ARC-122)', async () => {
      repo.create.mockRejectedValueOnce(new Error('DB Connection down'));

      const result = await service.recordLog({
        action: 'create_appointment',
        entityTable: 'appointments',
      });

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated audit logs with calculated metadata', async () => {
      const result = await service.findAll({ page: 1, limit: 10 });

      expect(repo.findAll).toHaveBeenCalledWith(10, 0, {
        entityTable: undefined,
        entityId: undefined,
        actorUserId: undefined,
        action: undefined,
        cursor: undefined,
      });
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        nextCursor: null,
        hasNextPage: false,
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });
  });

  describe('findById', () => {
    it('should return audit log when found', async () => {
      const result = await service.findById('log-123');
      expect(result).toEqual(mockLog);
    });

    it('should throw NotFoundException when log is absent', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
