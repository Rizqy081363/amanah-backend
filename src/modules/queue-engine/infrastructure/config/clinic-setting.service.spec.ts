import { MissingConfigKeyError } from '../../domain/services/clinic-setting.reader';
import { ClinicSettingService } from './clinic-setting.service';

describe('ClinicSettingService', () => {
  let service: ClinicSettingService;
  let mockDb: any;

  const mockRows = [
    {
      key: 'ESTIMATOR_PRIOR_MINUTES',
      scopeType: 'global',
      scopeId: null,
      value: 30,
    },
    {
      key: 'ESTIMATOR_PRIOR_MINUTES',
      scopeType: 'category',
      scopeId: 'cat-bidan',
      value: 20,
    },
    {
      key: 'ESTIMATOR_PRIOR_MINUTES',
      scopeType: 'doctor',
      scopeId: 'doc-specialist',
      value: 45,
    },
    {
      key: 'CLINIC_TIMEZONE',
      scopeType: 'global',
      scopeId: null,
      value: 'Asia/Jakarta',
    },
    {
      key: 'ACCEPT_WALK_IN_WHEN_FULL',
      scopeType: 'global',
      scopeId: null,
      value: true,
    },
  ];

  beforeEach(() => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockResolvedValue(mockRows),
    };
    service = new ClinicSettingService(mockDb);
  });

  it('should return global setting when no scope is provided', async () => {
    const val = await service.getNumber('ESTIMATOR_PRIOR_MINUTES');
    expect(val).toBe(30);
  });

  it('should resolve category scope override when categoryId matches', async () => {
    const val = await service.getNumber('ESTIMATOR_PRIOR_MINUTES', {
      categoryId: 'cat-bidan',
    });
    expect(val).toBe(20);
  });

  it('should resolve doctor scope override when doctorId matches', async () => {
    const val = await service.getNumber('ESTIMATOR_PRIOR_MINUTES', {
      doctorId: 'doc-specialist',
      categoryId: 'cat-bidan',
    });
    expect(val).toBe(45);
  });

  it('should fall back to category if doctor does not have specific setting', async () => {
    const val = await service.getNumber('ESTIMATOR_PRIOR_MINUTES', {
      doctorId: 'doc-other',
      categoryId: 'cat-bidan',
    });
    expect(val).toBe(20);
  });

  it('should fall back to global if category has no specific setting', async () => {
    const val = await service.getString('CLINIC_TIMEZONE', {
      categoryId: 'cat-bidan',
    });
    expect(val).toBe('Asia/Jakarta');
  });

  it('should throw MissingConfigKeyError loudly when key does not exist', async () => {
    await expect(service.get('NON_EXISTENT_KEY')).rejects.toThrow(
      MissingConfigKeyError,
    );
  });

  it('should parse boolean values correctly', async () => {
    const val = await service.getBoolean('ACCEPT_WALK_IN_WHEN_FULL');
    expect(val).toBe(true);
  });
});
