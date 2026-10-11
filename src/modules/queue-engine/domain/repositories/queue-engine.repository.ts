import { DomainQueueTicket } from '../types/queue.types';

export interface IQueueEngineRepository {
  atomicGetNextQueueNumber(params: {
    serviceDate: string;
    categoryId: string;
    sessionId: string;
    codePrefix: string;
  }): Promise<{ seq: number; formatted: string }>;

  callNextTicket(params: {
    roomId: string;
    doctorId: string;
    categoryId?: string;
    serviceDate: string;
  }): Promise<DomainQueueTicket | null>;

  getRecentCompletedDurations(params: {
    categoryId?: string;
    limit?: number;
  }): Promise<number[]>;

  getActiveLanesCount(params: {
    serviceDate: string;
    sessionId: string;
    categoryId?: string;
  }): Promise<number>;

  getTicketById(ticketId: string): Promise<DomainQueueTicket | null>;

  findActiveTicketsBySession(params: {
    serviceDate: string;
    sessionId: string;
    categoryId?: string;
  }): Promise<DomainQueueTicket[]>;

  batchUpdateProjections(
    updates: Array<{
      ticketId: string;
      projectedStart: Date;
      projectedEnd: Date;
      waitingPosition: number;
    }>,
  ): Promise<void>;
}
