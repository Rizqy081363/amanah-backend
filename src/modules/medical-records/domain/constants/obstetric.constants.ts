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
