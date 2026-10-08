import { EstimatorService } from './estimator.service';

describe('EstimatorService', () => {
  const estimator = new EstimatorService();

  describe('estimateDuration', () => {
    it('returns prior (30 min) on cold start (0 samples)', () => {
      const duration = estimator.estimateDuration({
        durationsMinutes: [],
        priorMinutes: 30,
        priorWeight: 5,
        minMinutes: 5,
        maxMinutes: 60,
      });
      expect(duration).toBe(30);
    });

    it('smoothly blends empirical samples with prior', () => {
      // 5 samples of 20 min with prior 30 and weight 5:
      // (5*30 + 5*20) / (5 + 5) = (150 + 100) / 10 = 25
      const duration = estimator.estimateDuration({
        durationsMinutes: [20, 20, 20, 20, 20],
        priorMinutes: 30,
        priorWeight: 5,
        minMinutes: 5,
        maxMinutes: 60,
      });
      expect(duration).toBe(25);
    });

    it('clamps estimated duration to min bound', () => {
      const duration = estimator.estimateDuration({
        durationsMinutes: [1, 2, 1],
        priorMinutes: 5,
        priorWeight: 1,
        minMinutes: 5,
        maxMinutes: 60,
      });
      expect(duration).toBeGreaterThanOrEqual(5);
    });

    it('clamps estimated duration to max bound', () => {
      const duration = estimator.estimateDuration({
        durationsMinutes: [120, 150],
        priorMinutes: 60,
        priorWeight: 1,
        minMinutes: 5,
        maxMinutes: 60,
      });
      expect(duration).toBeLessThanOrEqual(60);
    });
  });

  describe('applyHysteresis', () => {
    it('returns old ETA if change is within hysteresis tolerance (e.g. 3 min < 5 min threshold)', () => {
      const oldEta = new Date('2026-10-08T09:00:00.000Z');
      const newEta = new Date('2026-10-08T09:03:00.000Z');
      const finalEta = estimator.applyHysteresis({
        oldEta,
        newEta,
        hysteresisMinutes: 5,
      });
      expect(finalEta).toEqual(oldEta);
    });

    it('returns new ETA if change exceeds hysteresis threshold (e.g. 10 min >= 5 min)', () => {
      const oldEta = new Date('2026-10-08T09:00:00.000Z');
      const newEta = new Date('2026-10-08T09:10:00.000Z');
      const finalEta = estimator.applyHysteresis({
        oldEta,
        newEta,
        hysteresisMinutes: 5,
      });
      expect(finalEta).toEqual(newEta);
    });
  });

  describe('formatEtaWindow', () => {
    it('formats a realistic rounded window', () => {
      const start = new Date('2026-10-08T09:13:00.000Z');
      const window = estimator.formatEtaWindow(start, 20, 5);
      // 09:13 rounded to nearest 5 min is 09:15
      expect(window.startFormatted).toBe('09:15');
      expect(window.endFormatted).toBe('09:35');
      expect(window.displayRange).toBe('09:15 - 09:35 WIB');
    });
  });
});
