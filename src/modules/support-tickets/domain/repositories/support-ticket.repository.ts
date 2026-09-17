import {
  SupportTicketEntity,
  SupportTicketMessageEntity,
} from '../entities/support-ticket.entity';

export const SUPPORT_TICKET_REPOSITORY = Symbol('SUPPORT_TICKET_REPOSITORY');

export interface SupportTicketRepository {
  createTicket(data: {
    reporterUserId: string;
    title: string;
    description?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    sourceChannel?: string;
  }): Promise<SupportTicketEntity>;

  findMyTickets(reporterUserId: string): Promise<SupportTicketEntity[]>;

  findTicketById(id: string): Promise<SupportTicketEntity | null>;

  findMessages(ticketId: string): Promise<SupportTicketMessageEntity[]>;

  addMessage(data: {
    ticketId: string;
    senderUserId?: string;
    senderType: 'reporter' | 'support_agent' | 'system';
    body: string;
  }): Promise<SupportTicketMessageEntity>;
}
