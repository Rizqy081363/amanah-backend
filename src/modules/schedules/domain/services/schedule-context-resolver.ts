import { UnprocessableEntityException } from '@nestjs/common';
import {
  SCHEDULE_CONTEXT_DEFINITIONS,
  type ScheduleContextDefinition,
} from '../constants/schedule-context.constants';

export class ScheduleContextResolver {
  static resolve(scheduleContextId: string): ScheduleContextDefinition {
    const normalized = (scheduleContextId || '').trim().toLowerCase();
    const found = SCHEDULE_CONTEXT_DEFINITIONS.find(
      (def) =>
        def.shift === normalized ||
        def.contextId === normalized ||
        def.aliases.includes(normalized),
    );

    if (!found) {
      throw new UnprocessableEntityException({
        code: 'SCHEDULE_CONTEXT_NOT_FOUND',
        message: 'Konteks jadwal yang dipilih tidak tersedia.',
        metadata: {
          scheduleContextId,
          supportedContextIds: SCHEDULE_CONTEXT_DEFINITIONS.map(
            (def) => def.contextId,
          ),
        },
      });
    }

    return found;
  }

  static list(): ScheduleContextDefinition[] {
    return SCHEDULE_CONTEXT_DEFINITIONS;
  }
}
