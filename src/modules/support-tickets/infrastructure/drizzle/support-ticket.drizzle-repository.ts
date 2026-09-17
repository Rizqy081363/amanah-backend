import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  supportTicketMessages,
  supportTickets,
  users,
} from '../../../../database/schema';
import {
  SupportTicketEntity,
  SupportTicketMessageEntity,
} from '../../domain/entities/support-ticket.entity';
import { SupportTicketRepository } from '../../domain/repositories/support-ticket.repository';

@Injectable()
export class SupportTicketDrizzleRepository implements SupportTicketRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async createTicket(data: {
    reporterUserId: string;
    title: string;
    description?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    sourceChannel?: string;
  }): Promise<SupportTicketEntity> {
    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const ticketNumber = `TK-${year}-${randomSuffix}`;

    const [record] = await this.db
      .insert(supportTickets)
      .values({
        ticketNumber,
        reporterUserId: data.reporterUserId,
        title: data.title,
        description: data.description || null,
        priority: data.priority || 'normal',
        sourceChannel: data.sourceChannel || 'mobile_app',
        status: 'open',
      })
      .returning();

    // If initial description is provided, insert initial message from user
    if (data.description && data.description.trim().length > 0) {
      await this.db.insert(supportTicketMessages).values({
        ticketId: record.id,
        senderUserId: data.reporterUserId,
        senderType: 'reporter',
        body: data.description,
      });
    }

    return {
      id: record.id,
      ticketNumber: record.ticketNumber,
      reporterUserId: record.reporterUserId,
      assignedStaffId: record.assignedStaffId,
      title: record.title,
      description: record.description,
      status: record.status,
      priority: record.priority,
      sourceChannel: record.sourceChannel,
      technicianNote: record.technicianNote,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async findMyTickets(reporterUserId: string): Promise<SupportTicketEntity[]> {
    const records = await this.db.query.supportTickets.findMany({
      where: eq(supportTickets.reporterUserId, reporterUserId),
      orderBy: [desc(supportTickets.createdAt)],
      with: {
        user: true,
        staffProfile: true,
      },
    });

    return records.map((r) => ({
      id: r.id,
      ticketNumber: r.ticketNumber,
      reporterUserId: r.reporterUserId,
      assignedStaffId: r.assignedStaffId,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      sourceChannel: r.sourceChannel,
      technicianNote: r.technicianNote,
      resolvedAt: r.resolvedAt,
      closedAt: r.closedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      reporterName: r.user?.name || null,
      assignedStaffName: r.staffProfile?.fullName || null,
    }));
  }

  async findTicketById(id: string): Promise<SupportTicketEntity | null> {
    const record = await this.db.query.supportTickets.findFirst({
      where: eq(supportTickets.id, id),
      with: {
        user: true,
        staffProfile: true,
      },
    });

    if (!record) return null;

    return {
      id: record.id,
      ticketNumber: record.ticketNumber,
      reporterUserId: record.reporterUserId,
      assignedStaffId: record.assignedStaffId,
      title: record.title,
      description: record.description,
      status: record.status,
      priority: record.priority,
      sourceChannel: record.sourceChannel,
      technicianNote: record.technicianNote,
      resolvedAt: record.resolvedAt,
      closedAt: record.closedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      reporterName: record.user?.name || null,
      assignedStaffName: record.staffProfile?.fullName || null,
    };
  }

  async findMessages(ticketId: string): Promise<SupportTicketMessageEntity[]> {
    const records = await this.db
      .select({
        id: supportTicketMessages.id,
        ticketId: supportTicketMessages.ticketId,
        senderUserId: supportTicketMessages.senderUserId,
        senderType: supportTicketMessages.senderType,
        body: supportTicketMessages.body,
        createdAt: supportTicketMessages.createdAt,
        updatedAt: supportTicketMessages.updatedAt,
        senderName: users.name,
      })
      .from(supportTicketMessages)
      .leftJoin(users, eq(supportTicketMessages.senderUserId, users.id))
      .where(eq(supportTicketMessages.ticketId, ticketId))
      .orderBy(supportTicketMessages.createdAt);

    return records.map((r) => ({
      id: r.id,
      ticketId: r.ticketId,
      senderUserId: r.senderUserId,
      senderType: r.senderType,
      body: r.body,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      senderName:
        r.senderName ||
        (r.senderType === 'support_agent'
          ? 'Teknisi IT Amanah'
          : r.senderType === 'reporter'
            ? 'Pelapor'
            : 'Sistem'),
    }));
  }

  async addMessage(data: {
    ticketId: string;
    senderUserId?: string;
    senderType: 'reporter' | 'support_agent' | 'system';
    body: string;
  }): Promise<SupportTicketMessageEntity> {
    const [msg] = await this.db
      .insert(supportTicketMessages)
      .values({
        ticketId: data.ticketId,
        senderUserId: data.senderUserId || null,
        senderType: data.senderType,
        body: data.body,
      })
      .returning();

    // Bump ticket updatedAt
    await this.db
      .update(supportTickets)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(supportTickets.id, data.ticketId));

    return {
      id: msg.id,
      ticketId: msg.ticketId,
      senderUserId: msg.senderUserId,
      senderType: msg.senderType,
      body: msg.body,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    };
  }
}
