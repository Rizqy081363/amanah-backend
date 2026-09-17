import { DomainEvent, EventActorContext } from './domain-event.base';

export class AuditRecordEvent extends DomainEvent {
  public static readonly EVENT_NAME = 'audit.record.v1';
  public readonly eventName = AuditRecordEvent.EVENT_NAME;
  public readonly version = 1;

  constructor(
    public readonly action: string,
    public readonly entityTable: string,
    public readonly entityId?: string,
    public readonly oldValues?: Record<string, unknown>,
    public readonly newValues?: Record<string, unknown>,
    correlationId?: string,
    actor?: EventActorContext,
  ) {
    super(correlationId, actor);
  }
}
