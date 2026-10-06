import { describe, expect, it } from 'bun:test';
import {
  resolveAllowedActions,
  toDbStatus,
  toDomainStatus,
} from './appointment.types';

describe('appointment.types', () => {
  describe('toDomainStatus', () => {
    it('should map waiting and legacy statuses to WAITING', () => {
      expect(toDomainStatus('waiting')).toBe('WAITING');
      expect(toDomainStatus('booked')).toBe('WAITING');
      expect(toDomainStatus('checked_in')).toBe('WAITING');
    });

    it('should map in_service to IN_SERVICE', () => {
      expect(toDomainStatus('in_service')).toBe('IN_SERVICE');
      expect(toDomainStatus('sedang_diperiksa')).toBe('IN_SERVICE');
    });

    it('should map completed to COMPLETED', () => {
      expect(toDomainStatus('completed')).toBe('COMPLETED');
      expect(toDomainStatus('selesai')).toBe('COMPLETED');
    });

    it('should map cancelled to CANCELLED', () => {
      expect(toDomainStatus('cancelled')).toBe('CANCELLED');
      expect(toDomainStatus('batal')).toBe('CANCELLED');
    });

    it('should map late and no_show to LATE', () => {
      expect(toDomainStatus('late')).toBe('LATE');
      expect(toDomainStatus('no_show')).toBe('LATE');
    });
  });

  describe('toDbStatus', () => {
    it('should map domain statuses to database enum values', () => {
      expect(toDbStatus('WAITING')).toBe('waiting');
      expect(toDbStatus('IN_SERVICE')).toBe('in_service');
      expect(toDbStatus('COMPLETED')).toBe('completed');
      expect(toDbStatus('CANCELLED')).toBe('cancelled');
      expect(toDbStatus('LATE')).toBe('late');
    });
  });

  describe('resolveAllowedActions', () => {
    it('should allow CALL, START_SERVICE, CANCEL for WAITING', () => {
      expect(resolveAllowedActions('WAITING')).toEqual(['CALL', 'START_SERVICE', 'CANCEL']);
    });

    it('should allow only COMPLETE for IN_SERVICE', () => {
      expect(resolveAllowedActions('IN_SERVICE')).toEqual(['COMPLETE']);
    });

    it('should allow no actions for terminal states', () => {
      expect(resolveAllowedActions('COMPLETED')).toEqual([]);
      expect(resolveAllowedActions('CANCELLED')).toEqual([]);
      expect(resolveAllowedActions('LATE')).toEqual([]);
    });
  });
});
