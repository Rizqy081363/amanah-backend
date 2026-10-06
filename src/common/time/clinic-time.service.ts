import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Temporal } from '@js-temporal/polyfill';
import { eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../database/drizzle/drizzle.provider';
import { clinicSchedulePolicies } from '../../database/schema';
import { AllConfigType } from '../../config/config.type';
import { Clock } from './clock';

export type BusinessDate = string & { readonly __brand: 'BusinessDate' };

const BUSINESS_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseBusinessDate(raw: string): BusinessDate {
  if (!raw || !BUSINESS_DATE_REGEX.test(raw)) {
    throw new BadRequestException('date must be YYYY-MM-DD');
  }
  try {
    return Temporal.PlainDate.from(raw).toString() as BusinessDate;
  } catch {
    throw new BadRequestException('date is not a valid calendar date');
  }
}

@Injectable()
export class ClinicTimeService {
  readonly timezone: string;

  constructor(
    private readonly clock: Clock,
    private readonly config: ConfigService<AllConfigType, true>,
    @Optional()
    @Inject(DRIZZLE_SOURCE)
    private readonly db?: DrizzleDatabase,
  ) {
    this.timezone = this.config.getOrThrow('time.clinicTimezone', {
      infer: true,
    });
  }

  async getOperationalHours(): Promise<string> {
    if (!this.db?.query?.clinicSchedulePolicies?.findFirst) {
      return '06:00 - 24:00';
    }
    const policy = await this.db.query.clinicSchedulePolicies.findFirst({
      where: eq(clinicSchedulePolicies.code, 'default'),
    });
    if (!policy) {
      return '06:00 - 24:00';
    }
    return `${policy.morningStart} - ${policy.nightEnd}`;
  }

  today(): BusinessDate {
    return this.businessDateOf(this.clock.now());
  }

  businessDateOf(instant: Temporal.Instant): BusinessDate {
    return instant
      .toZonedDateTimeISO(this.timezone)
      .toPlainDate()
      .toString() as BusinessDate;
  }

  rangeOf(date: BusinessDate): {
    from: Temporal.Instant;
    to: Temporal.Instant;
  } {
    const start = Temporal.PlainDate.from(date).toZonedDateTime(this.timezone);
    return {
      from: start.toInstant(),
      to: start.add({ days: 1 }).toInstant(),
    };
  }

  getTimezone(): string {
    return this.timezone;
  }

  nowInstant(): Temporal.Instant {
    return this.clock.now();
  }

  nowDate(): Date {
    return new Date(this.clock.now().epochMilliseconds);
  }

  getCurrentTimeString(): string {
    const instant = this.clock.now();
    const zdt = instant.toZonedDateTimeISO(this.timezone);
    const hour = String(zdt.hour).padStart(2, '0');
    const minute = String(zdt.minute).padStart(2, '0');
    const second = String(zdt.second).padStart(2, '0');
    return `${hour}:${minute}:${second}`;
  }

  formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  formatTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: this.timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  }
}
