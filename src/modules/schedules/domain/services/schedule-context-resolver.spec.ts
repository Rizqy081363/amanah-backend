import { UnprocessableEntityException } from '@nestjs/common';
import { ScheduleContextResolver } from './schedule-context-resolver';

describe('ScheduleContextResolver', () => {
  it('resolves schedule contexts from ids and aliases', () => {
    expect(ScheduleContextResolver.resolve('morning').contextId).toBe(
      'morning',
    );
    expect(ScheduleContextResolver.resolve('pagi').contextId).toBe('morning');
    expect(ScheduleContextResolver.resolve('SIANG').contextId).toBe(
      'afternoon',
    );
  });

  it('exposes the canonical schedule context list', () => {
    expect(
      ScheduleContextResolver.list().map((context) => context.contextId),
    ).toEqual(['early_morning', 'morning', 'afternoon', 'night']);
  });

  it('preserves the current unknown-context error contract', () => {
    expect(() => ScheduleContextResolver.resolve('unknown')).toThrow(
      UnprocessableEntityException,
    );
  });
});
