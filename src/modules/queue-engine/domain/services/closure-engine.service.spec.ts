import { CalendarService } from './calendar.service';
import { ClosureEngineService } from './closure-engine.service';
import { DomainQueueTicket } from '../types/queue.types';

describe('ClosureEngineService', () => {
  const calendar = new CalendarService();
  const engine = new ClosureEngineService(calendar);

  const d = (timeStr: string) => new Date(`2026-10-08T${timeStr}:00.000Z`);

  it('preserves in_service tickets and never interrupts them', () => {
    const inServiceTicket: DomainQueueTicket = {
      id: 't-active',
      categoryId: 'cat-1',
      sessionId: 'ses-1',
      serviceDate: '2026-10-08',
      queueNumber: 'U-001',
      patientId: 'p-1',
      roomId: 'room-1',
      doctorId: 'doc-1',
      status: 'in_service',
      projectedStart: d('08:00'),
      projectedEnd: d('08:30'),
      startedAt: d('08:05'),
      carriedOver: false,
      source: 'online',
    };

    const impact = engine.evaluateClosureImpact({
      closure: {
        startsAt: d('08:15'),
        endsAt: d('12:00'),
        categoryId: 'cat-1',
      },
      tickets: [inServiceTicket],
      effectiveSegmentsAfterClosure: [],
    });

    expect(impact.inServiceUntouched).toHaveLength(1);
    expect(impact.inServiceUntouched[0].id).toBe('t-active');
    expect(impact.waitingToMove).toHaveLength(0);
  });

  it('marks waiting tickets that do not fit as waitingToMove', () => {
    const waitingTicket: DomainQueueTicket = {
      id: 't-wait',
      categoryId: 'cat-1',
      sessionId: 'ses-1',
      serviceDate: '2026-10-08',
      queueNumber: 'U-002',
      patientId: 'p-2',
      status: 'waiting',
      projectedStart: d('09:00'),
      projectedEnd: d('09:30'),
      carriedOver: false,
      source: 'online',
    };

    const impact = engine.evaluateClosureImpact({
      closure: {
        startsAt: d('08:00'),
        endsAt: d('12:00'),
        categoryId: 'cat-1',
      },
      tickets: [waitingTicket],
      // After full session closure, no remaining open segments
      effectiveSegmentsAfterClosure: [],
    });

    expect(impact.waitingToMove).toHaveLength(1);
    expect(impact.waitingToMove[0].id).toBe('t-wait');
  });
});
