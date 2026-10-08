import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, eq, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import {
  clinicRooms,
  practitioners,
  queueNotificationOutbox,
  queueTickets,
  serviceCategories,
  sessionDefs,
  sessionSchedules,
  ticketEvents,
} from '../../../../database/schema';
import {
  OutboxStatus,
  QUEUE_CONFIG_KEYS,
  QUEUE_OUTBOX_KINDS,
  QUEUE_PRIORITY,
  QUEUE_TICKET_EVENTS,
  QUEUE_TICKET_SOURCE,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/queue-engine.constants';
import { EstimatorService } from '../../domain/services/estimator.service';
import { QueueEngineService } from '../../domain/services/queue-engine.service';
import { SimulatorService } from '../../domain/services/simulator.service';
import { ClinicSettingService } from '../../infrastructure/config/clinic-setting.service';
import { DrizzleQueueEngineRepository } from '../../infrastructure/drizzle/drizzle-queue-engine.repository';
import {
  CreateQueueTicketDto,
  RescheduleQueueTicketDto,
} from '../dto/create-ticket.dto';

@ApiTags('v2 - Tickets')
@Controller('v2/tickets')
export class V2TicketsController {
  constructor(
    @Inject(DRIZZLE_SOURCE) private readonly db: any,
    private readonly queueRepo: DrizzleQueueEngineRepository,
    private readonly queueEngine: QueueEngineService,
    private readonly estimator: EstimatorService,
    private readonly simulator: SimulatorService,
    private readonly clinicSetting: ClinicSettingService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Issue a new queue ticket (atomic counter)' })
  async createTicket(@Body() dto: CreateQueueTicketDto) {
    const [category] = await this.db
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.id, dto.categoryId))
      .limit(1);

    if (!category) {
      throw new NotFoundException(`Service category not found: ${dto.categoryId}`);
    }

    const [session] = await this.db
      .select()
      .from(sessionDefs)
      .where(eq(sessionDefs.id, dto.sessionId))
      .limit(1);

    if (!session) {
      throw new NotFoundException(`Session definition not found: ${dto.sessionId}`);
    }

    const codePrefix = category.codePrefix || 'Q';

    // 1. Monotonic atomic queue counter
    const { seq, formatted } = await this.queueRepo.atomicGetNextQueueNumber({
      serviceDate: dto.serviceDate,
      categoryId: dto.categoryId,
      sessionId: dto.sessionId,
      codePrefix,
    });

    // 2. Compute Bayesian service duration
    const recentDurations =
      await this.queueRepo.getRecentCompletedDurations({
        categoryId: dto.categoryId,
      });

    const priorMinutes = await this.clinicSetting.get<number>(
      QUEUE_CONFIG_KEYS.PRIOR_MINUTES,
      {
        categoryId: dto.categoryId,
      },
    );
    const priorWeight = await this.clinicSetting.get<number>(
      QUEUE_CONFIG_KEYS.PRIOR_WEIGHT,
      {
        categoryId: dto.categoryId,
      },
    );

    const avgDuration = this.estimator.estimateDuration({
      durationsMinutes: recentDurations,
      priorMinutes,
      priorWeight,
    });

    // 3. Multi-lane ETA simulation
    const activeLanes = await this.queueRepo.getActiveLanesCount({
      serviceDate: dto.serviceDate,
      sessionId: dto.sessionId,
      categoryId: dto.categoryId,
    });

    const activeTickets = await this.queueRepo.findActiveTicketsBySession({
      serviceDate: dto.serviceDate,
      sessionId: dto.sessionId,
      categoryId: dto.categoryId,
    });

    // Determine shift start time
    const dow = new Date(`${dto.serviceDate}T00:00:00.000Z`).getUTCDay();
    const [scheduleRow] = await this.db
      .select()
      .from(sessionSchedules)
      .where(
        and(
          eq(sessionSchedules.sessionId, dto.sessionId),
          eq(sessionSchedules.dow, dow),
        ),
      )
      .limit(1);

    if (!scheduleRow) {
      throw new BadRequestException(
        `Jadwal operasional sesi tidak ditemukan untuk hari ke-${dow}`,
      );
    }

    const startTimeStr = scheduleRow.startsAt;
    const endTimeStr = scheduleRow.endsAt;

    const [sH, sM] = startTimeStr.split(':').map(Number);
    const [eH, eM] = endTimeStr.split(':').map(Number);

    const segStart = new Date(`${dto.serviceDate}T00:00:00.000Z`);
    segStart.setUTCHours(sH, sM, 0, 0);

    const segEnd = new Date(`${dto.serviceDate}T00:00:00.000Z`);
    segEnd.setUTCHours(eH, eM, 0, 0);

    const simulation = this.simulator.simulateQueue({
      lanes: activeLanes,
      effectiveSegments: [{ start: segStart, end: segEnd }],
      tickets: [...activeTickets, { id: 'new-ticket' }],
      estimatedDurationMinutes: avgDuration,
    });

    const newProjection = simulation.projections.get('new-ticket');
    const projectedStart = newProjection?.projectedStart || segStart;
    const projectedEnd = newProjection?.projectedEnd || segEnd;

    // 4. Insert ticket
    const [inserted] = await this.db
      .insert(queueTickets)
      .values({
        serviceId: category.id,
        categoryId: category.id,
        sessionId: session.id,
        patientId: dto.patientId,
        queueDate: dto.serviceDate,
        queueNumber: formatted,
        status: QUEUE_TICKET_STATUS.WAITING,
        priority: QUEUE_PRIORITY.REGULAR,
        waitingPosition: seq,
        projectedStart: projectedStart.toISOString(),
        projectedEnd: projectedEnd.toISOString(),
        source: QUEUE_TICKET_SOURCE.ONLINE,
      })
      .returning();

    const aheadCount = Math.max(0, activeTickets.length);
    const etaWindow = this.estimator.formatEtaWindow(
      projectedStart,
      avgDuration,
    );

    const patientView = this.queueEngine.buildPatientView({
      ticket: {
        id: inserted.id,
        categoryId: category.id,
        sessionId: session.id,
        serviceDate: dto.serviceDate,
        queueNumber: formatted,
        patientId: dto.patientId,
        status: QUEUE_TICKET_STATUS.WAITING,
        waitingPosition: seq,
        projectedStart,
        projectedEnd,
        carriedOver: false,
        source: QUEUE_TICKET_SOURCE.ONLINE,
      },
      categoryName: category.name,
      sessionLabel: session.labelKey,
      aheadCount,
      etaRange: etaWindow.displayRange,
    });

    // Record audit event
    await this.db.insert(ticketEvents).values({
      ticketId: inserted.id,
      event: QUEUE_TICKET_EVENTS.CREATED,
      toStatus: QUEUE_TICKET_STATUS.WAITING,
      payload: {
        queueNumber: formatted,
        serviceDate: dto.serviceDate,
        sessionId: session.id,
        categoryId: category.id,
        waitingPosition: seq,
        source: QUEUE_TICKET_SOURCE.ONLINE,
      },
    });

    // Record outbox for notifications
    await this.db.insert(queueNotificationOutbox).values({
      ticketId: inserted.id,
      kind: QUEUE_OUTBOX_KINDS.TICKET_CREATED,
      payload: {
        ticketId: inserted.id,
        patientId: dto.patientId,
        queueNumber: formatted,
        categoryName: category.name,
        sessionLabel: session.labelKey,
        etaRange: etaWindow.displayRange,
      },
      status: OutboxStatus.PENDING,
    });

    return {
      success: true,
      data: {
        id: inserted.id,
        queueNumber: formatted,
        ...patientView,
        projectedStart: projectedStart.toISOString(),
        projectedEnd: projectedEnd.toISOString(),
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get segregated patient ticket view by ticket ID' })
  async getTicket(@Param('id') id: string) {
    const [ticket] = await this.db
      .select()
      .from(queueTickets)
      .where(eq(queueTickets.id, id))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException(`Queue ticket not found: ${id}`);
    }

    const [category] = ticket.categoryId
      ? await this.db
          .select()
          .from(serviceCategories)
          .where(eq(serviceCategories.id, ticket.categoryId))
          .limit(1)
      : [null];

    const [session] = ticket.sessionId
      ? await this.db
          .select()
          .from(sessionDefs)
          .where(eq(sessionDefs.id, ticket.sessionId))
          .limit(1)
      : [null];

    const [room] = ticket.roomId
      ? await this.db
          .select()
          .from(clinicRooms)
          .where(eq(clinicRooms.id, ticket.roomId))
          .limit(1)
      : [null];

    const [doctor] = ticket.doctorId
      ? await this.db
          .select()
          .from(practitioners)
          .where(eq(practitioners.id, ticket.doctorId))
          .limit(1)
      : [null];

    const activeAhead =
      ticket.status === 'waiting'
        ? await this.queueRepo.findActiveTicketsBySession({
            serviceDate: ticket.queueDate,
            sessionId: ticket.sessionId,
            categoryId: ticket.categoryId,
          })
        : [];

    const aheadCount = activeAhead.filter(
      (t) => t.queueNumber < ticket.queueNumber && t.status === 'waiting',
    ).length;

    const projectedStart = ticket.projectedStart
      ? new Date(ticket.projectedStart)
      : new Date();
    const etaWindow = this.estimator.formatEtaWindow(projectedStart, 20);

    const patientView = this.queueEngine.buildPatientView({
      ticket: {
        id: ticket.id,
        categoryId: ticket.categoryId,
        sessionId: ticket.sessionId,
        serviceDate: ticket.queueDate,
        queueNumber: ticket.queueNumber,
        patientId: ticket.patientId,
        status: ticket.status as any,
        waitingPosition: ticket.waitingPosition,
        projectedStart,
        projectedEnd: ticket.projectedEnd ? new Date(ticket.projectedEnd) : null,
        carriedOver: Boolean(ticket.carriedOver),
        source: ticket.source || 'online',
      },
      categoryName: category?.name || 'Poliklinik',
      sessionLabel: session?.labelKey || 'Sesi',
      aheadCount,
      etaRange: etaWindow.displayRange,
      resolvedRoomName: room?.name,
      resolvedDoctorName: doctor?.displayName,
    });

    return {
      success: true,
      data: {
        id: ticket.id,
        queueNumber: ticket.queueNumber,
        ...patientView,
        projectedStart: ticket.projectedStart,
        projectedEnd: ticket.projectedEnd,
      },
    };
  }

  @Post(':id/reschedule')
  @ApiOperation({
    summary: 'Reschedule an existing ticket (cancel old, issue new)',
  })
  async rescheduleTicket(
    @Param('id') id: string,
    @Body() dto: RescheduleQueueTicketDto,
  ) {
    const [oldTicket] = await this.db
      .select()
      .from(queueTickets)
      .where(eq(queueTickets.id, id))
      .limit(1);

    if (!oldTicket) {
      throw new NotFoundException(`Ticket not found: ${id}`);
    }

    if (
      oldTicket.status === QUEUE_TICKET_STATUS.COMPLETED ||
      oldTicket.status === QUEUE_TICKET_STATUS.IN_SERVICE ||
      oldTicket.status === QUEUE_TICKET_STATUS.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot reschedule ticket with status '${oldTicket.status}'.`,
      );
    }

    // Mark old ticket as cancelled/superseded
    await this.db
      .update(queueTickets)
      .set({
        status: QUEUE_TICKET_STATUS.CANCELLED,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(queueTickets.id, id));

    // Issue new ticket
    const result = await this.createTicket({
      categoryId: oldTicket.categoryId || oldTicket.serviceId,
      sessionId: dto.sessionId,
      patientId: oldTicket.patientId,
      serviceDate: dto.serviceDate,
      complaint: dto.reason,
    });

    // Mark new ticket as carriedOver = true
    await this.db
      .update(queueTickets)
      .set({
        carriedOver: true,
      })
      .where(eq(queueTickets.id, result.data.id));

    // Update old ticket pointer
    await this.db
      .update(queueTickets)
      .set({
        movedTo: result.data.id,
      })
      .where(eq(queueTickets.id, id));

    // Audit and Outbox for reschedule
    await this.db.insert(ticketEvents).values({
      ticketId: id,
      event: QUEUE_TICKET_EVENTS.RESCHEDULED,
      fromStatus: oldTicket.status,
      toStatus: QUEUE_TICKET_STATUS.CANCELLED,
      payload: {
        newTicketId: result.data.id,
        newQueueNumber: result.data.ticketCode,
        serviceDate: dto.serviceDate,
        reason: dto.reason,
      },
    });

    await this.db.insert(queueNotificationOutbox).values({
      ticketId: result.data.id,
      kind: QUEUE_OUTBOX_KINDS.TICKET_RESCHEDULED,
      payload: {
        oldTicketId: id,
        newTicketId: result.data.id,
        patientId: oldTicket.patientId,
        queueNumber: result.data.ticketCode,
        categoryName: result.data.serviceCategoryName,
        sessionLabel: result.data.sessionLabel,
        etaRange: result.data.etaWindowDisplay,
      },
      status: OutboxStatus.PENDING,
    });

    return result;
  }
}
