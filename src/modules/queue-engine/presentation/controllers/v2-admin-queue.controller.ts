import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import {
  clinicClosures,
  clinicRooms,
  queueNotificationOutbox,
  queueTickets,
  sessionSchedules,
  ticketEvents,
} from '../../../../database/schema';
import {
  OutboxStatus,
  QUEUE_OUTBOX_KINDS,
  QUEUE_TICKET_EVENTS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/queue-engine.constants';
import { CalendarService } from '../../domain/services/calendar.service';
import { ClosureEngineService } from '../../domain/services/closure-engine.service';
import { DrizzleQueueEngineRepository } from '../../infrastructure/drizzle/drizzle-queue-engine.repository';
import { CallNextDto, CreateClosureDto } from '../dto/create-closure.dto';

@ApiTags('v2 - Admin Queue')
@Controller('v2/admin')
export class V2AdminQueueController {
  constructor(
    @Inject(DRIZZLE_SOURCE) private readonly db: any,
    private readonly queueRepo: DrizzleQueueEngineRepository,
    private readonly calendar: CalendarService,
    private readonly closureEngine: ClosureEngineService,
  ) {}

  @Post('rooms/:id/call-next')
  @ApiOperation({
    summary:
      'Staff calls next waiting ticket for a room (FOR UPDATE SKIP LOCKED)',
  })
  async callNextPatient(
    @Param('id') roomId: string,
    @Body() dto: CallNextDto,
  ) {
    // 1. Verify room exists
    const [room] = await this.db
      .select()
      .from(clinicRooms)
      .where(eq(clinicRooms.id, roomId))
      .limit(1);

    if (!room) {
      throw new BadRequestException(`Room not found: ${roomId}`);
    }

    const todayStr =
      dto.serviceDate || new Date().toISOString().slice(0, 10);

    // 2. Atomic lock and call
    const ticket = await this.queueRepo.callNextTicket({
      roomId,
      doctorId: dto.doctorId,
      categoryId: dto.categoryId,
      serviceDate: todayStr,
    });

    if (!ticket) {
      return {
        success: true,
        message: 'Tidak ada antrean yang sedang menunggu.',
        data: null,
      };
    }

    // 3. Record audit event and outbox
    await this.db.insert(ticketEvents).values({
      ticketId: ticket.id,
      event: QUEUE_TICKET_EVENTS.CALLED,
      fromStatus: QUEUE_TICKET_STATUS.WAITING,
      toStatus: QUEUE_TICKET_STATUS.CALLED,
      payload: {
        roomId,
        roomName: room.name,
        doctorId: dto.doctorId,
        calledAt: new Date().toISOString(),
      },
    });

    await this.db.insert(queueNotificationOutbox).values({
      ticketId: ticket.id,
      kind: QUEUE_OUTBOX_KINDS.TICKET_CALLED,
      payload: {
        ticketId: ticket.id,
        patientId: ticket.patientId,
        queueNumber: ticket.queueNumber,
        roomId,
        roomName: room.name,
        doctorId: dto.doctorId,
      },
      status: OutboxStatus.PENDING,
    });

    return {
      success: true,
      message: `Berhasil memanggil nomor ${ticket.queueNumber}`,
      data: ticket,
    };
  }

  @Post('tickets/:id/requeue')
  @ApiOperation({ summary: 'Requeue a called ticket back to waiting state' })
  async requeueTicket(@Param('id') id: string) {
    const [ticket] = await this.db
      .select()
      .from(queueTickets)
      .where(eq(queueTickets.id, id))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException(`Ticket not found: ${id}`);
    }

    await this.db
      .update(queueTickets)
      .set({
        status: QUEUE_TICKET_STATUS.WAITING,
        roomId: null,
        doctorId: null,
        calledAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(queueTickets.id, id));

    await this.db.insert(ticketEvents).values({
      ticketId: id,
      event: QUEUE_TICKET_EVENTS.REQUEUED,
      fromStatus: ticket.status,
      toStatus: QUEUE_TICKET_STATUS.WAITING,
      payload: {
        requeuedAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      message: `Tiket ${ticket.queueNumber} berhasil dikembalikan ke antrean tunggu.`,
    };
  }

  @Post('closures/preview')
  @ApiOperation({ summary: 'Preview impact of closure on existing tickets' })
  async previewClosure(@Body() dto: CreateClosureDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const dateStr = dto.startsAt.slice(0, 10);

    const activeTickets = await this.db
      .select()
      .from(queueTickets)
      .where(
        and(
          eq(queueTickets.queueDate, dateStr),
          dto.categoryId
            ? eq(queueTickets.categoryId, dto.categoryId)
            : undefined,
        ),
      );

    const mappedTickets = activeTickets.map((t: any) => ({
      id: t.id,
      categoryId: t.categoryId,
      sessionId: t.sessionId,
      serviceDate: t.queueDate,
      queueNumber: t.queueNumber,
      patientId: t.patientId,
      status: t.status,
      projectedStart: t.projectedStart ? new Date(t.projectedStart) : null,
      projectedEnd: t.projectedEnd ? new Date(t.projectedEnd) : null,
      carriedOver: Boolean(t.carriedOver),
      source: t.source || 'online',
    }));

    const impact = this.closureEngine.evaluateClosureImpact({
      closure: {
        startsAt,
        endsAt,
        categoryId: dto.categoryId,
        doctorId: dto.doctorId,
        roomId: dto.roomId,
      },
      tickets: mappedTickets,
      effectiveSegmentsAfterClosure: [],
    });

    return {
      success: true,
      data: {
        totalAffected: impact.totalAffected,
        inServiceProtected: impact.inServiceUntouched.length,
        ticketsToMove: impact.waitingToMove.map((t) => ({
          id: t.id,
          queueNumber: t.queueNumber,
          patientId: t.patientId,
        })),
      },
    };
  }

  @Post('closures')
  @ApiOperation({ summary: 'Apply clinic closure and cascade ticket moves' })
  async applyClosure(@Body() dto: CreateClosureDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const dateStr = dto.startsAt.slice(0, 10);

    // 1. Insert closure record
    const [closure] = await this.db
      .insert(clinicClosures)
      .values({
        scope: dto.scope,
        inputKind: dto.inputKind,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        categoryId: dto.categoryId || null,
        doctorId: dto.doctorId || null,
        roomId: dto.roomId || null,
        lastCallBufferMin: dto.lastCallBufferMin ?? 0,
        reason: dto.reason || null,
      })
      .returning();

    // 2. Preview tickets to mark
    const preview = await this.previewClosure(dto);
    const ticketsToMove = preview.data.ticketsToMove;

    // 3. Flag tickets carried over
    for (const t of ticketsToMove) {
      await this.db
        .update(queueTickets)
        .set({
          carriedOver: true,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(queueTickets.id, t.id));
    }

    return {
      success: true,
      message: `Penutupan berhasil diterapkan. ${ticketsToMove.length} tiket dialihkan.`,
      data: {
        closureId: closure.id,
        affectedCount: ticketsToMove.length,
      },
    };
  }
}
