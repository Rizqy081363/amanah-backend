import { BadRequestException } from '@nestjs/common';
import {
  CheckInAlreadyUsedError,
  CheckInExpiredError,
  InvalidCheckInCodeError,
  InvalidCheckInQrError,
} from '../../../domain/errors/appointment-domain.errors';
import { PerformCheckInUseCase } from '../perform-check-in.use-case';
import { PerformManualCheckInUseCase } from '../perform-manual-check-in.use-case';
import { PerformQrCheckInUseCase } from '../perform-qr-check-in.use-case';

describe('PerformCheckIn Use Cases (Clean Architecture QR vs Manual)', () => {
  describe('PerformQrCheckInUseCase', () => {
    it('throws InvalidCheckInQrError if token is empty', async () => {
      const mockCheckInRepo = { findByToken: async () => null } as any;
      const mockLifecycle = { validateAndFinalize: async () => ({}) } as any;

      const useCase = new PerformQrCheckInUseCase(
        mockCheckInRepo,
        mockLifecycle,
      );

      await expect(useCase.execute({ token: '' })).rejects.toBeInstanceOf(
        InvalidCheckInQrError,
      );
      await expect(useCase.execute({ token: '   ' })).rejects.toBeInstanceOf(
        InvalidCheckInQrError,
      );
    });

    it('throws InvalidCheckInQrError if token does not exist in repository', async () => {
      const mockCheckInRepo = {
        findByToken: async (_t: string) => null,
      } as any;
      const mockLifecycle = { validateAndFinalize: async () => ({}) } as any;

      const useCase = new PerformQrCheckInUseCase(
        mockCheckInRepo,
        mockLifecycle,
      );

      const err = await useCase
        .execute({ token: 'non-existent-uuid' })
        .catch((e) => e);
      expect(err).toBeInstanceOf(InvalidCheckInQrError);
      expect(err.code).toBe('INVALID_CHECK_IN_QR');
    });

    it('delegates to lifecycleService.validateAndFinalize when QR token is found', async () => {
      const foundRecord = {
        id: 'rec-1',
        appointmentId: 'apt-1',
        isUsed: false,
        expiresAt: new Date(Date.now() + 100000),
      };
      const mockCheckInRepo = {
        findByToken: async () => foundRecord,
      } as any;
      const mockLifecycle = {
        validateAndFinalize: jest.fn().mockResolvedValue({ id: 'apt-1', status: 'waiting' }),
      } as any;

      const useCase = new PerformQrCheckInUseCase(
        mockCheckInRepo,
        mockLifecycle,
      );

      const result = await useCase.execute({ token: 'valid-token' }, { id: 'u1' });
      expect(mockLifecycle.validateAndFinalize).toHaveBeenCalledWith(foundRecord, { id: 'u1' });
      expect(result.status).toBe('waiting');
    });
  });

  describe('PerformManualCheckInUseCase', () => {
    it('throws InvalidCheckInCodeError if manualCode is empty or only whitespace', async () => {
      const mockCheckInRepo = { findByManualCode: async () => null } as any;
      const mockLifecycle = { validateAndFinalize: async () => ({}) } as any;

      const useCase = new PerformManualCheckInUseCase(
        mockCheckInRepo,
        mockLifecycle,
      );

      const err = await useCase
        .execute({ manualCode: '   ' })
        .catch((e) => e);
      expect(err).toBeInstanceOf(InvalidCheckInCodeError);
      expect(err.code).toBe('INVALID_CHECK_IN_CODE');
    });

    it('throws InvalidCheckInCodeError if manualCode does not exist in repository', async () => {
      const mockCheckInRepo = {
        findByManualCode: async (_code: string) => null,
      } as any;
      const mockLifecycle = { validateAndFinalize: async () => ({}) } as any;

      const useCase = new PerformManualCheckInUseCase(
        mockCheckInRepo,
        mockLifecycle,
      );

      const err = await useCase
        .execute({ manualCode: 'ZZ9999' })
        .catch((e) => e);
      expect(err).toBeInstanceOf(InvalidCheckInCodeError);
      expect(err.code).toBe('INVALID_CHECK_IN_CODE');
    });

    it('delegates to lifecycleService.validateAndFinalize when manualCode is found', async () => {
      const foundRecord = {
        id: 'rec-2',
        appointmentId: 'apt-2',
        isUsed: false,
        expiresAt: new Date(Date.now() + 100000),
      };
      const mockCheckInRepo = {
        findByManualCode: async () => foundRecord,
      } as any;
      const mockLifecycle = {
        validateAndFinalize: jest.fn().mockResolvedValue({ id: 'apt-2', status: 'waiting' }),
      } as any;

      const useCase = new PerformManualCheckInUseCase(
        mockCheckInRepo,
        mockLifecycle,
      );

      const result = await useCase.execute({ manualCode: 'CK1234' }, { id: 'u2' });
      expect(mockLifecycle.validateAndFinalize).toHaveBeenCalledWith(foundRecord, { id: 'u2' });
      expect(result.status).toBe('waiting');
    });
  });

  describe('PerformCheckInUseCase (Facade / Orchestrator)', () => {
    it('delegates to PerformQrCheckInUseCase when token is present', async () => {
      const mockQr = {
        execute: jest.fn().mockResolvedValue({ id: 'apt-1', status: 'waiting' }),
      } as any;
      const mockManual = {
        execute: jest.fn(),
      } as any;

      const facade = new PerformCheckInUseCase(mockQr, mockManual);
      const res = await facade.execute({ token: 'some-qr-uuid' }, { id: 'u1' });

      expect(mockQr.execute).toHaveBeenCalledWith(
        { token: 'some-qr-uuid' },
        { id: 'u1' },
      );
      expect(mockManual.execute).not.toHaveBeenCalled();
      expect(res.status).toBe('waiting');
    });

    it('delegates to PerformManualCheckInUseCase when manualCode is present', async () => {
      const mockQr = {
        execute: jest.fn(),
      } as any;
      const mockManual = {
        execute: jest.fn().mockResolvedValue({ id: 'apt-1', status: 'waiting' }),
      } as any;

      const facade = new PerformCheckInUseCase(mockQr, mockManual);
      const res = await facade.execute({ manualCode: 'CK8888' }, { id: 'u1' });

      expect(mockManual.execute).toHaveBeenCalledWith(
        { manualCode: 'CK8888' },
        { id: 'u1' },
      );
      expect(mockQr.execute).not.toHaveBeenCalled();
      expect(res.status).toBe('waiting');
    });

    it('delegates to PerformQrCheckInUseCase when method is qr even if value is in manualCode field', async () => {
      const mockQr = {
        execute: jest.fn().mockResolvedValue({ id: 'apt-1', status: 'waiting' }),
      } as any;
      const mockManual = {
        execute: jest.fn(),
      } as any;

      const facade = new PerformCheckInUseCase(mockQr, mockManual);
      const res = await facade.execute(
        { manualCode: 'CK1234', method: 'qr' },
        { id: 'u1' },
      );

      expect(mockQr.execute).toHaveBeenCalledWith(
        { token: 'CK1234' },
        { id: 'u1' },
      );
      expect(mockManual.execute).not.toHaveBeenCalled();
      expect(res.status).toBe('waiting');
    });

    it('delegates to PerformManualCheckInUseCase when method is manual', async () => {
      const mockQr = {
        execute: jest.fn(),
      } as any;
      const mockManual = {
        execute: jest.fn().mockResolvedValue({ id: 'apt-1', status: 'waiting' }),
      } as any;

      const facade = new PerformCheckInUseCase(mockQr, mockManual);
      const res = await facade.execute(
        { manualCode: 'CK9999', method: 'manual' },
        { id: 'u1' },
      );

      expect(mockManual.execute).toHaveBeenCalledWith(
        { manualCode: 'CK9999' },
        { id: 'u1' },
      );
      expect(mockQr.execute).not.toHaveBeenCalled();
      expect(res.status).toBe('waiting');
    });

    it('throws BadRequestException if neither token nor manualCode is provided', async () => {
      const mockQr = { execute: jest.fn() } as any;
      const mockManual = { execute: jest.fn() } as any;

      const facade = new PerformCheckInUseCase(mockQr, mockManual);

      await expect(facade.execute({})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
