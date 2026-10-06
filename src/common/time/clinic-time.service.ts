import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '../../config/config.type';

@Injectable()
export class ClinicTimeService {
  private readonly timezone: string;

  constructor(private readonly configService?: ConfigService<AllConfigType>) {
    this.timezone =
      this.configService?.get('app.timezone', { infer: true }) ||
      process.env.APP_TIMEZONE ||
      process.env.CLINIC_TIMEZONE ||
      'Asia/Jakarta';
  }

  getTimezone(): string {
    return this.timezone;
  }

  getNow(): Date {
    return new Date();
  }

  getTodayDateString(referenceDate?: Date): string {
    const target = referenceDate ?? this.getNow();
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(target);
  }

  getCurrentTimeString(referenceDate?: Date): string {
    const target = referenceDate ?? this.getNow();
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: this.timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(target);
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
