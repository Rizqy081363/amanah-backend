import { Injectable } from '@nestjs/common';
import {
  GESTATION_DAYS_LMP,
  MS_PER_DAY,
} from '../constants/obstetric.constants';

/**
 * Obstetric Calculator Service — ACOG Committee Opinion No. 700 & reVITALize Guidelines.
 *
 * Domain rule: all obstetric calculations live in backend exclusively.
 * Frontend must NOT calculate EDD or gestational age independently.
 *
 * Naegele's Rule:
 *   EDD = HPHT (LMP) + GESTATION_DAYS_LMP
 *
 * Gestational Age formula:
 *   GA (days) = GESTATION_DAYS_LMP - (EDD - referenceDate)
 *   weeks     = floor(GA_days / 7)
 *   days      = GA_days % 7
 */

export interface GestationalAgeResult {
  weeks: number;
  days: number;
  totalDays: number;
  formatted: string;
}

export interface ObstetricCalculationResult {
  estimatedDueDate: string;
  gestationalAgeWeeks: number;
  gestationalAgeFormatted: string;
}

@Injectable()
export class ObstetricCalculatorService {
  /**
   * Parses an ISO-8601 date string (YYYY-MM-DD) to a UTC-midnight Date.
   * Throws if the string is not a valid date.
   */
  private toUtcDate(dateStr: string): Date {
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) {
      throw new Error(`Invalid date string: ${dateStr}`);
    }
    const [year, month, day] = parts;
    const d = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Unparseable date: ${dateStr}`);
    }
    return d;
  }

  /**
   * Formats a UTC Date as ISO-8601 date-only string (YYYY-MM-DD).
   */
  private toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /**
   * Calculates Estimated Due Date (HPL) from LMP (HPHT) using Naegele's Rule.
   * Returns an ISO date string YYYY-MM-DD.
   */
  calculateEddFromLmp(hpht: string): string {
    const lmp = this.toUtcDate(hpht);
    const edd = new Date(lmp.getTime() + GESTATION_DAYS_LMP * MS_PER_DAY);
    return this.toIsoDate(edd);
  }

  /**
   * Calculates gestational age from EDD and an optional reference date (defaults to today).
   */
  calculateGestationalAge(
    eddIso: string,
    referenceDateIso?: string,
  ): GestationalAgeResult {
    const edd = this.toUtcDate(eddIso);
    const ref = referenceDateIso
      ? this.toUtcDate(referenceDateIso)
      : new Date(
          Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate(),
          ),
        );

    const daysUntilEdd = Math.round(
      (edd.getTime() - ref.getTime()) / MS_PER_DAY,
    );
    const totalDays = GESTATION_DAYS_LMP - daysUntilEdd;

    if (totalDays < 0) {
      return { weeks: 0, days: 0, totalDays: 0, formatted: '0 minggu 0 hari' };
    }

    const weeks = Math.floor(totalDays / 7);
    const days = totalDays % 7;

    return {
      weeks,
      days,
      totalDays,
      formatted: `${weeks} minggu ${days} hari`,
    };
  }

  /**
   * Derives all obstetric values from HPHT alone.
   * This is the single entry-point used by the repository.
   */
  computeFromHpht(
    hpht: string,
    referenceDate?: string,
  ): ObstetricCalculationResult {
    const estimatedDueDate = this.calculateEddFromLmp(hpht);
    const ga = this.calculateGestationalAge(estimatedDueDate, referenceDate);

    return {
      estimatedDueDate,
      gestationalAgeWeeks: ga.weeks,
      gestationalAgeFormatted: ga.formatted,
    };
  }
}
