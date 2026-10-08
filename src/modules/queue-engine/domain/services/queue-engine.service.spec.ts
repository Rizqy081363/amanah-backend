import { DomainQueueTicket } from '../types/queue.types';
import { QueueEngineService } from './queue-engine.service';

describe('QueueEngineService', () => {
  const engine = new QueueEngineService();

  const createSampleTicket = (overrides?: Partial<DomainQueueTicket>): DomainQueueTicket => ({
    id: 'ticket-1',
    categoryId: 'cat-umum',
    sessionId: 'session-pagi',
    serviceDate: '2026-10-08',
    queueNumber: 'U-001',
    patientId: 'patient-1',
    roomId: null,
    doctorId: null,
    status: 'waiting',
    waitingPosition: 1,
    projectedStart: new Date('2026-10-08T08:00:00.000Z'),
    projectedEnd: new Date('2026-10-08T08:30:00.000Z'),
    calledAt: null,
    startedAt: null,
    completedAt: null,
    carriedOver: false,
    source: 'online',
    ...overrides,
  });

  describe('formatTicketNumber', () => {
    it('formats ticket number with 3 digits padding', () => {
      expect(engine.formatTicketNumber('U', 1)).toBe('U-001');
      expect(engine.formatTicketNumber('B', 42)).toBe('B-042');
      expect(engine.formatTicketNumber('GEN', 105)).toBe('GEN-105');
    });
  });

  describe('state machine transitions', () => {
    it('transitions waiting -> called with room and doctor', () => {
      const ticket = createSampleTicket();
      const called = engine.callTicket({
        ticket,
        roomId: 'room-1',
        doctorId: 'doctor-1',
        calledAt: new Date('2026-10-08T08:05:00.000Z'),
      });

      expect(called.status).toBe('called');
      expect(called.roomId).toBe('room-1');
      expect(called.doctorId).toBe('doctor-1');
      expect(called.calledAt).toEqual(new Date('2026-10-08T08:05:00.000Z'));
    });

    it('rejects calling already completed ticket', () => {
      const ticket = createSampleTicket({ status: 'completed' });
      expect(() =>
        engine.callTicket({
          ticket,
          roomId: 'room-1',
          doctorId: 'doctor-1',
          calledAt: new Date(),
        }),
      ).toThrow();
    });

    it('transitions called -> in_service', () => {
      const ticket = createSampleTicket({
        status: 'called',
        roomId: 'room-1',
        doctorId: 'doctor-1',
      });
      const started = engine.startService({
        ticket,
        startedAt: new Date('2026-10-08T08:10:00.000Z'),
      });

      expect(started.status).toBe('in_service');
      expect(started.startedAt).toEqual(new Date('2026-10-08T08:10:00.000Z'));
    });

    it('transitions in_service -> completed', () => {
      const ticket = createSampleTicket({
        status: 'in_service',
        roomId: 'room-1',
        doctorId: 'doctor-1',
        startedAt: new Date('2026-10-08T08:10:00.000Z'),
      });
      const done = engine.completeService({
        ticket,
        completedAt: new Date('2026-10-08T08:35:00.000Z'),
      });

      expect(done.status).toBe('completed');
      expect(done.completedAt).toEqual(new Date('2026-10-08T08:35:00.000Z'));
    });
  });

  describe('segregatePatientView (Rule P7 & Section 2)', () => {
    it('masks room and doctor for patient when status is waiting', () => {
      const ticket = createSampleTicket({
        status: 'waiting',
        roomId: 'internal-room-leak',
        doctorId: 'internal-doctor-leak',
      });

      const view = engine.buildPatientView({
        ticket,
        categoryName: 'Poli Umum',
        sessionLabel: 'Pagi',
        aheadCount: 3,
        etaRange: '09:15 - 09:35 WIB',
        resolvedRoomName: 'Ruang Umum 1',
        resolvedDoctorName: 'dr. Budi Santoso',
      });

      expect(view.roomName).toBeNull();
      expect(view.doctorName).toBeNull();
      expect(view.status).toBe('waiting');
      expect(view.aheadCount).toBe(3);
    });

    it('reveals room and doctor once status is called', () => {
      const ticket = createSampleTicket({
        status: 'called',
        roomId: 'room-1',
        doctorId: 'doc-1',
      });

      const view = engine.buildPatientView({
        ticket,
        categoryName: 'Poli Umum',
        sessionLabel: 'Pagi',
        aheadCount: 0,
        etaRange: 'Sekarang',
        resolvedRoomName: 'Ruang Umum 1',
        resolvedDoctorName: 'dr. Budi Santoso',
      });

      expect(view.roomName).toBe('Ruang Umum 1');
      expect(view.doctorName).toBe('dr. Budi Santoso');
      expect(view.status).toBe('called');
    });
  });
});
