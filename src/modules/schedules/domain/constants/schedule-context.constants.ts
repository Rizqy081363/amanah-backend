import {
  SHIFT_DEFINITIONS,
  type ShiftDefinition,
} from '../factories/schedule-session.factory';

export type ScheduleContextDefinition = ShiftDefinition;

export const SCHEDULE_CONTEXT_DEFINITIONS: ScheduleContextDefinition[] =
  SHIFT_DEFINITIONS;
