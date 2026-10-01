/**
 * Obstetric Domain Constants
 *
 * Sources:
 * - ACOG Committee Opinion No. 700 (reVITALize Guidelines)
 * - Naegele's Rule: EDD = LMP + 280 days (40 weeks)
 * - ART offsets per ASRM/ACOG: day-5 embryo transfer = EDD - 261 days from transfer date
 */

/** Standard gestational period in days (40 weeks, Naegele's Rule). */
export const GESTATION_DAYS_LMP = 280;

/** Milliseconds in one calendar day. */
export const MS_PER_DAY = 86_400_000;

/**
 * ACOG redating thresholds (days) by gestational age window.
 * USG EDD replaces LMP EDD only when discrepancy exceeds these values.
 * Keys are maximum gestational age in total days for that threshold.
 */
export const ACOG_REDATING_THRESHOLDS = [
  { maxGaDays: 8 * 7 + 6, thresholdDays: 5 },   // ≤ 8w6d
  { maxGaDays: 13 * 7 + 6, thresholdDays: 7 },   // ≤ 13w6d (T1)
  { maxGaDays: 15 * 7 + 6, thresholdDays: 7 },   // ≤ 15w6d (T2 early)
  { maxGaDays: 21 * 7 + 6, thresholdDays: 10 },  // ≤ 21w6d
  { maxGaDays: 27 * 7 + 6, thresholdDays: 14 },  // ≤ 27w6d
  { maxGaDays: Number.MAX_SAFE_INTEGER, thresholdDays: 21 }, // T3
] as const;

/** ART embryo offsets: days subtracted from gestational period to get days added to transfer date. */
export const ART_EMBRYO_OFFSETS = {
  DAY_5: GESTATION_DAYS_LMP - 19, // 261
  DAY_3: GESTATION_DAYS_LMP - 17, // 263
} as const;
