import { DomainEvent, EventActorContext } from './domain-event.base';

export class AppointmentCreatedEvent extends DomainEvent {
  public static readonly EVENT_NAME = 'appointment.created.v1';
  public readonly eventName = AppointmentCreatedEvent.EVENT_NAME;
  public readonly version = 1;

  constructor(
    public readonly appointmentId: string,
    public readonly patientId: string,
    public readonly poliklinikId: string,
    public readonly appointmentDate: string,
    public readonly session: string,
    public readonly queueNumber: string,
    public readonly status: string,
    correlationId?: string,
    actor?: EventActorContext,
  ) {
    super(correlationId, actor);
  }
}

export class AppointmentStatusChangedEvent extends DomainEvent {
  public static readonly EVENT_NAME = 'appointment.status_changed.v1';
  public readonly eventName = AppointmentStatusChangedEvent.EVENT_NAME;
  public readonly version = 1;

  constructor(
    public readonly appointmentId: string,
    public readonly previousStatus: string | null,
    public readonly newStatus: string,
    public readonly reason?: string,
    correlationId?: string,
    actor?: EventActorContext,
  ) {
    super(correlationId, actor);
  }
}
