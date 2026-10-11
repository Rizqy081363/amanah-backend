/**
 * Resolves whether a doctor session is operable on a day based on:
 * - isDayActive: Whether clinic operates globally on that day (master_day.is_active)
 * - hasExplicitRosterOverride: Whether doctor has an explicit assignment for this dow (da.dow === targetDow)
 * - isTemplateActive: Whether weekly template is active for this session & dow
 */
export function isDoctorSessionActiveOnDay(params: {
  isDayActive: boolean;
  hasExplicitRosterOverride: boolean;
  isTemplateActive: boolean;
}): boolean {
  const { isDayActive, hasExplicitRosterOverride, isTemplateActive } = params;

  // 1. Explicit doctor roster override takes precedence over global day status
  if (hasExplicitRosterOverride) {
    return true;
  }

  // 2. If day is inactive globally and no explicit override exists, session is closed
  if (!isDayActive) {
    return false;
  }

  // 3. Fallback to weekly operational template
  return isTemplateActive;
}
