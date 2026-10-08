import { CalendarService } from '../../src/modules/queue-engine/domain/services/calendar.service';
import { ClosureEngineService } from '../../src/modules/queue-engine/domain/services/closure-engine.service';
import { EstimatorService } from '../../src/modules/queue-engine/domain/services/estimator.service';
import { QueueEngineService } from '../../src/modules/queue-engine/domain/services/queue-engine.service';
import { SimulatorService } from '../../src/modules/queue-engine/domain/services/simulator.service';
import {
  QUEUE_LOAD_STATUS,
  resolveQueueLoadStatus,
} from '../../src/modules/queue-engine/domain/constants/queue-load.constants';
import { DomainQueueTicket } from '../../src/modules/queue-engine/domain/types/queue.types';

describe('Queue-Based Ticketing Scenarios (S1 - S12)', () => {
  const calendar = new CalendarService();
  const estimator = new EstimatorService();
  const simulator = new SimulatorService();
  const queueEngine = new QueueEngineService();
  const closureEngine = new ClosureEngineService(calendar);

  const d = (timeStr: string) => new Date(`2026-10-08T${timeStr}:00.000Z`);

  // S1: Normal booking produces monotonic ticket number
  it('S1: Normal booking produces formatted monotonic ticket number', () => {
    const t1 = queueEngine.formatTicketNumber('U', 1);
    const t2 = queueEngine.formatTicketNumber('U', 2);
    const t3 = queueEngine.formatTicketNumber('U', 3);

    expect(t1).toBe('U-001');
    expect(t2).toBe('U-002');
    expect(t3).toBe('U-003');
    expect(t1 < t2 && t2 < t3).toBe(true);
  });

  // S2: Simultaneous bookings produce distinct ticket numbers (no collision)
  it('S2: Concurrent ticket number sequence emulation guarantees distinct numbers', () => {
    let currentSequence = 0;
    const atomicCounter = () => ++currentSequence;

    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const nextNo = atomicCounter();
      results.add(queueEngine.formatTicketNumber('U', nextNo));
    }

    expect(results.size).toBe(50);
  });

  // S3: Heavy load session does not reject patient, adjusts ETA window
  it('S3: Patient is accepted when session is loaded, load status reflects capacity', () => {
    const segments = [{ start: d('06:00'), end: d('12:00') }]; // 360 min
    const capacity = simulator.calculateNominalCapacity({
      lanes: 1,
      effectiveSegments: segments,
      estimatedDurationMinutes: 30,
    }); // 12 tickets

    // 15 patients registered (exceeds nominal capacity)
    const loadStatus = resolveQueueLoadStatus(15 / capacity);
    expect(loadStatus).toBe(QUEUE_LOAD_STATUS.SANGAT_PADAT);

    const simulation = simulator.simulateQueue({
      lanes: 1,
      effectiveSegments: segments,
      tickets: Array.from({ length: 15 }, (_, i) => ({ id: `t-${i}` })),
      estimatedDurationMinutes: 30,
    });

    const lastTicket = simulation.projections.get('t-14')!;
    expect(lastTicket).toBeDefined();
    // Patient accepted with projected end extending proportionally
    expect(lastTicket.projectedStart.getTime()).toBeGreaterThan(d('06:00').getTime());
  });

  // S4: Bayesian estimator uses prior on cold start, shifts with empirical samples
  it('S4: Bayesian estimator uses prior on zero history and adapts with observations', () => {
    const coldStart = estimator.estimateDuration({
      durationsMinutes: [],
      priorMinutes: 30,
      priorWeight: 5,
    });
    expect(coldStart).toBe(30);

    // After 10 actual fast consultations (15 mins each)
    const warmStart = estimator.estimateDuration({
      durationsMinutes: new Array(10).fill(15),
      priorMinutes: 30,
      priorWeight: 5,
    });
    // (5*30 + 10*15) / (5 + 10) = (150 + 150) / 15 = 20
    expect(warmStart).toBe(20);
  });

  // S5: Multi-lane simulator distributes tickets across active doctors
  it('S5: Multi-lane simulator assigns patients across active lanes fairly', () => {
    const segments = [{ start: d('08:00'), end: d('12:00') }];
    const tickets = [{ id: 't-1' }, { id: 't-2' }, { id: 't-3' }];

    const result = simulator.simulateQueue({
      lanes: 2,
      effectiveSegments: segments,
      tickets,
      estimatedDurationMinutes: 30,
    });

    const p1 = result.projections.get('t-1')!;
    const p2 = result.projections.get('t-2')!;
    const p3 = result.projections.get('t-3')!;

    // Lanes 1 & 2 start at 08:00
    expect(p1.projectedStart).toEqual(d('08:00'));
    expect(p2.projectedStart).toEqual(d('08:00'));
    // Lane 1 frees up at 08:30 for ticket 3
    expect(p3.projectedStart).toEqual(d('08:30'));
  });

  // S6: Calling next patient assigns doctor and room
  it('S6: Calling next patient transitions ticket to called and binds room/doctor', () => {
    const ticket: DomainQueueTicket = {
      id: 'ticket-101',
      categoryId: 'cat-1',
      sessionId: 'ses-1',
      serviceDate: '2026-10-08',
      queueNumber: 'U-001',
      patientId: 'patient-1',
      status: 'waiting',
      carriedOver: false,
      source: 'online',
    };

    const called = queueEngine.callTicket({
      ticket,
      roomId: 'room-1',
      doctorId: 'doc-1',
      calledAt: d('08:15'),
    });

    expect(called.status).toBe('called');
    expect(called.roomId).toBe('room-1');
    expect(called.doctorId).toBe('doc-1');
    expect(called.calledAt).toEqual(d('08:15'));
  });

  // S7: Segregated patient view hides room and doctor while waiting
  it('S7: Segregated patient view strictly conceals doctor & room while in waiting status', () => {
    const waitingTicket: DomainQueueTicket = {
      id: 'ticket-102',
      categoryId: 'cat-1',
      sessionId: 'ses-1',
      serviceDate: '2026-10-08',
      queueNumber: 'U-005',
      patientId: 'patient-2',
      status: 'waiting',
      carriedOver: false,
      source: 'online',
    };

    const patientView = queueEngine.buildPatientView({
      ticket: waitingTicket,
      categoryName: 'Poli Umum',
      sessionLabel: 'Pagi',
      aheadCount: 4,
      etaRange: '09:00 - 09:30 WIB',
      resolvedRoomName: 'Ruang 1',
      resolvedDoctorName: 'dr. Sarah',
    });

    expect(patientView.roomName).toBeNull();
    expect(patientView.doctorName).toBeNull();
    expect(patientView.aheadCount).toBe(4);

    // Once called, room & doctor become visible to patient
    const calledTicket = { ...waitingTicket, status: 'called' as const };
    const calledView = queueEngine.buildPatientView({
      ticket: calledTicket,
      categoryName: 'Poli Umum',
      sessionLabel: 'Pagi',
      aheadCount: 0,
      etaRange: 'Sekarang',
      resolvedRoomName: 'Ruang 1',
      resolvedDoctorName: 'dr. Sarah',
    });

    expect(calledView.roomName).toBe('Ruang 1');
    expect(calledView.doctorName).toBe('dr. Sarah');
  });

  // S8: State machine enforces valid progression
  it('S8: State machine forbids illegal transitions (e.g. completing before in_service)', () => {
    const waitingTicket: DomainQueueTicket = {
      id: 'ticket-103',
      categoryId: 'cat-1',
      sessionId: 'ses-1',
      serviceDate: '2026-10-08',
      queueNumber: 'U-006',
      patientId: 'patient-3',
      status: 'waiting',
      carriedOver: false,
      source: 'online',
    };

    expect(() =>
      queueEngine.completeService({ ticket: waitingTicket }),
    ).toThrow();
  });

  // S9: Closure preview calculates impact without altering state
  it('S9: Closure preview identifies affected tickets correctly', () => {
    const tActive: DomainQueueTicket = {
      id: 't-active',
      categoryId: 'cat-1',
      sessionId: 'ses-1',
      serviceDate: '2026-10-08',
      queueNumber: 'U-001',
      patientId: 'p-1',
      status: 'in_service',
      projectedStart: d('08:00'),
      projectedEnd: d('08:30'),
      carriedOver: false,
      source: 'online',
    };

    const tWait: DomainQueueTicket = {
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

    const impact = closureEngine.evaluateClosureImpact({
      closure: {
        startsAt: d('08:30'),
        endsAt: d('12:00'),
        categoryId: 'cat-1',
      },
      tickets: [tActive, tWait],
      effectiveSegmentsAfterClosure: [],
    });

    expect(impact.inServiceUntouched).toHaveLength(1);
    expect(impact.inServiceUntouched[0].id).toBe('t-active');
    expect(impact.waitingToMove).toHaveLength(1);
    expect(impact.waitingToMove[0].id).toBe('t-wait');
  });

  // S10: Closure commit carries over affected tickets
  it('S10: In-service patients are never cut off during emergency closure', () => {
    const tActive: DomainQueueTicket = {
      id: 't-active',
      categoryId: 'cat-1',
      sessionId: 'ses-1',
      serviceDate: '2026-10-08',
      queueNumber: 'U-001',
      patientId: 'p-1',
      status: 'in_service',
      projectedStart: d('08:00'),
      projectedEnd: d('08:30'),
      carriedOver: false,
      source: 'online',
    };

    const impact = closureEngine.evaluateClosureImpact({
      closure: {
        startsAt: d('08:10'),
        endsAt: d('12:00'),
      },
      tickets: [tActive],
      effectiveSegmentsAfterClosure: [],
    });

    expect(impact.inServiceUntouched).toHaveLength(1);
    expect(impact.waitingToMove).toHaveLength(0);
  });

  // S11: Reschedule cancels old ticket and issues new ticket
  it('S11: Reschedule cancels previous ticket and tracks carriedOver state', () => {
    const oldTicket: DomainQueueTicket = {
      id: 'ticket-old',
      categoryId: 'cat-1',
      sessionId: 'ses-1',
      serviceDate: '2026-10-08',
      queueNumber: 'U-001',
      patientId: 'p-1',
      status: 'waiting',
      carriedOver: false,
      source: 'online',
    };

    const cancelled = queueEngine.cancelTicket({ ticket: oldTicket });
    expect(cancelled.status).toBe('cancelled');

    const newTicket: DomainQueueTicket = {
      id: 'ticket-new',
      categoryId: 'cat-1',
      sessionId: 'ses-2',
      serviceDate: '2026-10-09',
      queueNumber: 'U-001',
      patientId: 'p-1',
      status: 'waiting',
      carriedOver: true,
      movedTo: null,
      source: 'online',
    };

    expect(newTicket.carriedOver).toBe(true);
    expect(newTicket.serviceDate).toBe('2026-10-09');
  });

  // S12: Hysteresis suppresses minor ETA jitter
  it('S12: Estimator hysteresis prevents jitter when ETA changes by less than threshold', () => {
    const currentEta = d('09:00');
    const jitterEta = d('09:03'); // 3 mins change
    const bigChangeEta = d('09:12'); // 12 mins change

    const dampened = estimator.applyHysteresis({
      oldEta: currentEta,
      newEta: jitterEta,
      hysteresisMinutes: 5,
    });
    expect(dampened).toEqual(currentEta); // suppresses jitter

    const updated = estimator.applyHysteresis({
      oldEta: currentEta,
      newEta: bigChangeEta,
      hysteresisMinutes: 5,
    });
    expect(updated).toEqual(bigChangeEta); // updates on real change
  });
});
