export interface DomainEvent<TPayload = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  version: number;
  occurredAt: string;
  module: string;
  payload: TPayload;
  correlationId?: string;
  actor?: {
    userId?: string;
    roleCode?: string;
  };
}

export abstract class NotificationPublisher {
  abstract publish<T>(event: DomainEvent<T>): Promise<void>;
}
