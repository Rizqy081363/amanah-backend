import { describe, expect, it } from 'bun:test';
import { DOMAIN_APPOINTMENT_STATUS } from '../constants/appointment-lifecycle.constants';
import {
  resolveAllowedActions,
  toDbStatus,
  toDomainStatus,
} from './appointment.types';

describe('appointment.types', () => {
  describe('toDomainStatus', () => {
    it('should map waiting and legacy statuses to WAITING', () => {
      expect(toDomainStatus('waiting')).toBe(DOMAIN_APPOINTMENT_STATUS.WAITING);
      expect(toDomainStatus('checked_in')).toBe(
        DOMAIN_APPOINTMENT_STATUS.WAITING,
      );
    });

    it('should map booked to BOOKED', () => {
      expect(toDomainStatus('booked')).toBe(DOMAIN_APPOINTMENT_STATUS.BOOKED);
    });

    it('should map in_service to IN_SERVICE', () => {
      expect(toDomainStatus('in_service')).toBe(
        DOMAIN_APPOINTMENT_STATUS.IN_SERVICE,
      );
    });

    it('should map completed to COMPLETED', () => {
      expect(toDomainStatus('completed')).toBe(
        DOMAIN_APPOINTMENT_STATUS.COMPLETED,
      );
    });

    it('should map cancelled to CANCELLED', () => {
      expect(toDomainStatus('cancelled')).toBe(
        DOMAIN_APPOINTMENT_STATUS.CANCELLED,
      );
      expect(toDomainStatus('no_doctor')).toBe(
        DOMAIN_APPOINTMENT_STATUS.CANCELLED,
      );
    });

    it('should map late and no_show to LATE', () => {
      expect(toDomainStatus('late')).toBe(DOMAIN_APPOINTMENT_STATUS.LATE);
      expect(toDomainStatus('no_show')).toBe(DOMAIN_APPOINTMENT_STATUS.LATE);
    });
  });

  describe('toDbStatus', () => {
    it('should map domain statuses to database enum values', () => {
      expect(toDbStatus(DOMAIN_APPOINTMENT_STATUS.BOOKED)).toBe('booked');
      expect(toDbStatus(DOMAIN_APPOINTMENT_STATUS.WAITING)).toBe('waiting');
      expect(toDbStatus(DOMAIN_APPOINTMENT_STATUS.IN_SERVICE)).toBe(
        'in_service',
      );
      expect(toDbStatus(DOMAIN_APPOINTMENT_STATUS.COMPLETED)).toBe('completed');
      expect(toDbStatus(DOMAIN_APPOINTMENT_STATUS.CANCELLED)).toBe('cancelled');
      expect(toDbStatus(DOMAIN_APPOINTMENT_STATUS.LATE)).toBe('late');
    });
  });

  describe('resolveAllowedActions', () => {
    it('should allow CHECK_IN, CANCEL for BOOKED', () => {
      expect(resolveAllowedActions(DOMAIN_APPOINTMENT_STATUS.BOOKED)).toEqual([
        'CHECK_IN',
        'CANCEL',
      ]);
    });

    it('should allow CALL, START_SERVICE, CANCEL for WAITING', () => {
      expect(resolveAllowedActions(DOMAIN_APPOINTMENT_STATUS.WAITING)).toEqual([
        'CALL',
        'START_SERVICE',
        'CANCEL',
      ]);
    });

    it('should allow only COMPLETE for IN_SERVICE', () => {
      expect(
        resolveAllowedActions(DOMAIN_APPOINTMENT_STATUS.IN_SERVICE),
      ).toEqual(['COMPLETE']);
    });

    it('should allow no actions for terminal states', () => {
      expect(
        resolveAllowedActions(DOMAIN_APPOINTMENT_STATUS.COMPLETED),
      ).toEqual([]);
      expect(
        resolveAllowedActions(DOMAIN_APPOINTMENT_STATUS.CANCELLED),
      ).toEqual([]);
      expect(resolveAllowedActions(DOMAIN_APPOINTMENT_STATUS.LATE)).toEqual([]);
    });
  });
});
