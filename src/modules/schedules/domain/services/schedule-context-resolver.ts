import {
  ScheduleSessionFactory,
  type ShiftDefinition,
} from '../factories/schedule-session.factory';

export class ScheduleContextResolver {
  static resolve(
    scheduleContextId: string,
    customDefs?: ShiftDefinition[],
  ): ShiftDefinition {
    return ScheduleSessionFactory.resolveShiftDefinition(
      scheduleContextId,
      customDefs,
    );
  }

  static list(customDefs?: ShiftDefinition[]): ShiftDefinition[] {
    return customDefs || [];
  }
}
