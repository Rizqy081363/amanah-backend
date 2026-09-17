import * as crypto from 'crypto';

export interface EventActorContext {
  userId?: string;
  roleCode?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Canonical Base Class for Domain Events (ARC-119..121, ARC-183).
 * Immutable fact that occurred in the past with minimal identifier payload and versioning.
 */
export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public abstract readonly eventName: string;
  public abstract readonly version: number;

  constructor(
    public readonly correlationId?: string,
    public readonly actor?: EventActorContext,
  ) {
    this.eventId = crypto.randomUUID();
    this.occurredAt = new Date();
  }
}
