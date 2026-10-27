import { Temporal } from '@js-temporal/polyfill';
import { Injectable } from '@nestjs/common';

export abstract class Clock {
  abstract now(): Temporal.Instant;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Temporal.Instant {
    return Temporal.Now.instant();
  }
}

class FixedClock extends Clock {
  constructor(private readonly instant: Temporal.Instant) {
    super();
  }

  now(): Temporal.Instant {
    return this.instant;
  }
}
