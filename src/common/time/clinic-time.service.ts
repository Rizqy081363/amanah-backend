import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Temporal } from '@js-temporal/polyfill';
import { ClinicConfigService } from '../clinic-config/clinic-config.service';
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
    private readonly clinicConfig: ClinicConfigService,
  ) {
    this.timezone = this.config.getOrThrow('time.clinicTimezone', {
      infer: true,
    });
  }

  async getOperationalHours(): Promise<string> {
    return this.clinicConfig.getOperationalHours();
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

  async getLocale(): Promise<string> {
    return this.clinicConfig.getLocale();
  }

  async getDateFormatStyle(): Promise<string> {
    return this.clinicConfig.getDateFormatStyle();
  }

  async getTimeFormatStyle(): Promise<string> {
    return this.clinicConfig.getTimeFormatStyle();
  }
}
