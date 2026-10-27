import {
  ScheduleSessionFactory,
  type ShiftDefinition,
  SHIFT_DEFINITIONS,
} from '../factories/schedule-session.factory';

export class ScheduleContextResolver {
  static resolve(scheduleContextId: string): ShiftDefinition {
    return ScheduleSessionFactory.resolveShiftDefinition(scheduleContextId);
  }

  static list(): ShiftDefinition[] {
    return SHIFT_DEFINITIONS;
  }
}
