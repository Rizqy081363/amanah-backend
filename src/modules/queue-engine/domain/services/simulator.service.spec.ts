import { SimulatorService } from './simulator.service';

describe('SimulatorService', () => {
  const simulator = new SimulatorService();

  const d = (timeStr: string) => new Date(`2026-10-08T${timeStr}:00.000Z`);

  it('calculates nominal capacity and load status correctly', () => {
    const segments = [{ start: d('06:00'), end: d('12:00') }]; // 360 minutes
    // 2 lanes * 360 min / 20 min = 36 tickets capacity
    const capacity = simulator.calculateNominalCapacity({
      lanes: 2,
      effectiveSegments: segments,
      estimatedDurationMinutes: 20,
    });
    expect(capacity).toBe(36);

    expect(simulator.resolveLoadStatus(10, capacity)).toBe('Senggang');
    expect(simulator.resolveLoadStatus(28, capacity)).toBe('Normal');
    expect(simulator.resolveLoadStatus(36, capacity)).toBe('Padat');
    expect(simulator.resolveLoadStatus(50, capacity)).toBe('Sangat Padat');
  });

  it('simulates 2-lane progression fairly across tickets', () => {
    const segments = [{ start: d('08:00'), end: d('12:00') }];
    const tickets = [
      { id: 't-1' },
      { id: 't-2' },
      { id: 't-3' },
      { id: 't-4' },
    ];

    const result = simulator.simulateQueue({
      lanes: 2,
      effectiveSegments: segments,
      tickets,
      estimatedDurationMinutes: 30,
    });

    const p1 = result.projections.get('t-1')!;
    const p2 = result.projections.get('t-2')!;
    const p3 = result.projections.get('t-3')!;
    const p4 = result.projections.get('t-4')!;

    // Lanes 1 and 2 start at 08:00
    expect(p1.projectedStart).toEqual(d('08:00'));
    expect(p1.projectedEnd).toEqual(d('08:30'));
    expect(p1.aheadCount).toBe(0);

    expect(p2.projectedStart).toEqual(d('08:00'));
    expect(p2.projectedEnd).toEqual(d('08:30'));
    expect(p2.aheadCount).toBe(1);

    // Tickets 3 and 4 start after lane 1 and lane 2 finish first patient at 08:30
    expect(p3.projectedStart).toEqual(d('08:30'));
    expect(p3.projectedEnd).toEqual(d('09:00'));
    expect(p3.aheadCount).toBe(2);

    expect(p4.projectedStart).toEqual(d('08:30'));
    expect(p4.projectedEnd).toEqual(d('09:00'));
    expect(p4.aheadCount).toBe(3);
  });
});
