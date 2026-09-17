export class SupportTicketMessageEntity {
  id: string;
  ticketId: string;
  senderUserId?: string | null;
  senderType: 'reporter' | 'support_agent' | 'system';
  body: string;
  senderName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export class SupportTicketEntity {
  id: string;
  ticketNumber: string;
  reporterUserId: string;
  assignedStaffId?: string | null;
  title: string;
  description?: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  sourceChannel: string;
  technicianNote?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;

  reporterName?: string | null;
  assignedStaffName?: string | null;
  messages?: SupportTicketMessageEntity[];
}
