import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import {
  appointments,
  clinicClosures,
  clinicRooms,
  practitioners,
  queueNotificationOutbox,
  queueTickets,
  serviceCategories,
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
import { ClinicSettingService } from '../../infrastructure/config/clinic-setting.service';
import { DrizzleQueueEngineRepository } from '../../infrastructure/drizzle/drizzle-queue-engine.repository';
import { ClosureInterval, ScheduledShift } from '../../domain/types/calendar.types';
import { CallNextDto, CreateClosureDto } from '../dto/create-closure.dto';

@ApiTags('v2 - Admin Queue')
@Controller({ path: 'admin', version: '2' })
export class V2AdminQueueController {
  constructor(
    @Inject(DRIZZLE_SOURCE) private readonly db: any,
    private readonly queueRepo: DrizzleQueueEngineRepository,
    private readonly calendar: CalendarService,
    private readonly closureEngine: ClosureEngineService,
    private readonly settingReader: ClinicSettingService,
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

    // Rule R10: Do not allow new calls if clinic/category/room/doctor is closed
    const nowIso = new Date().toISOString();
    const [activeClosure] = await this.db
      .select()
      .from(clinicClosures)
      .where(
        and(
          isNull(clinicClosures.cancelledAt),
          sql`${clinicClosures.startsAt} <= ${nowIso} AND ${clinicClosures.endsAt} > ${nowIso}`,
          or(
            eq(clinicClosures.scope, 'clinic'),
            dto.categoryId
              ? and(
                  eq(clinicClosures.scope, 'category'),
                  eq(clinicClosures.categoryId, dto.categoryId),
                )
              : sql`FALSE`,
            dto.doctorId
              ? and(
                  eq(clinicClosures.scope, 'doctor'),
                  eq(clinicClosures.doctorId, dto.doctorId),
                )
              : sql`FALSE`,
            and(
              eq(clinicClosures.scope, 'room'),
              eq(clinicClosures.roomId, roomId),
            ),
          ),
        ),
      )
      .limit(1);

    if (activeClosure) {
      const sTime = activeClosure.startsAt.slice(11, 16);
      const eTime = activeClosure.endsAt.slice(11, 16);
      throw new BadRequestException(
        `Klinik/layanan sedang tutup (${sTime} - ${eTime}): ${activeClosure.reason || 'Penutupan operasional'}. Pemanggilan pasien baru tidak dapat dilakukan (Rule R10).`,
      );
    }

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

    // Rule R1: Format interval valid [startsAt, endsAt)
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException(
        'Waktu selesai harus lebih besar dari waktu mulai [startsAt, endsAt).',
      );
    }

    // Dynamic thresholds from PostgreSQL clinic_setting (no hardcoding)
    const longConfirmDays = await this.settingReader
      .getNumber('closure.long_confirm_days')
      .catch(() => 14);

    const durationDays =
      (endsAt.getTime() - startsAt.getTime()) / (24 * 3600 * 1000);

    if (durationDays > longConfirmDays && !dto.confirmedLongClosure) {
      throw new BadRequestException(
        `Penutupan berdurasi ${Math.round(durationDays)} hari melebihi ambang batas ${longConfirmDays} hari. Memerlukan konfirmasi tambahan (confirmedLongClosure: true).`,
      );
    }

    // 2. Load active schedules for this day of week
    const dow = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
    const activeSchedulesRaw = await this.db
      .select()
      .from(sessionSchedules)
      .where(
        and(
          eq(sessionSchedules.dow, dow),
          eq(sessionSchedules.isActive, true),
        ),
      );

    const activeSchedules: ScheduledShift[] = activeSchedulesRaw.map(
      (s: any) => ({
        id: s.id,
        sessionId: s.sessionId,
        dow: s.dow,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        isActive: s.isActive,
      }),
    );

    // 3. Load active closures from database
    const existingClosuresRaw = await this.db
      .select()
      .from(clinicClosures)
      .where(isNull(clinicClosures.cancelledAt));

    const allClosures: ClosureInterval[] = [
      ...existingClosuresRaw.map((c: any) => ({
        id: c.id,
        scope: c.scope,
        categoryId: c.categoryId,
        doctorId: c.doctorId,
        roomId: c.roomId,
        startsAt: new Date(c.startsAt),
        endsAt: new Date(c.endsAt),
        inputKind: c.inputKind,
        lastCallBufferMin: c.lastCallBufferMin,
        reason: c.reason,
        cancelledAt: c.cancelledAt ? new Date(c.cancelledAt) : null,
      })),
      {
        id: 'proposed-preview',
        scope: dto.scope,
        categoryId: dto.categoryId || null,
        doctorId: dto.doctorId || null,
        roomId: dto.roomId || null,
        startsAt,
        endsAt,
        inputKind: dto.inputKind,
        lastCallBufferMin: dto.lastCallBufferMin ?? 0,
        reason: dto.reason || null,
        cancelledAt: null,
      },
    ];

    // 4. Calculate effective open segments using dynamic DB minSegmentMinutes
    const effectiveSegments = await this.calendar.effectiveOpenSegments({
      dateStr,
      categoryId: dto.categoryId,
      doctorId: dto.doctorId,
      roomId: dto.roomId,
      schedules: activeSchedules,
      closures: allClosures,
      extras: [],
    });

    // 5. Query active tickets with appointments checkedInAt
    const activeTickets = await this.db
      .select({
        id: queueTickets.id,
        serviceId: queueTickets.serviceId,
        categoryId: queueTickets.categoryId,
        sessionId: queueTickets.sessionId,
        queueDate: queueTickets.queueDate,
        queueNumber: queueTickets.queueNumber,
        patientId: queueTickets.patientId,
        roomId: queueTickets.roomId,
        doctorId: queueTickets.doctorId,
        status: queueTickets.status,
        projectedStart: queueTickets.projectedStart,
        projectedEnd: queueTickets.projectedEnd,
        calledAt: queueTickets.calledAt,
        startedAt: queueTickets.startedAt,
        completedAt: queueTickets.completedAt,
        carriedOver: queueTickets.carriedOver,
        source: queueTickets.source,
        priority: queueTickets.priority,
        checkedInAt: appointments.checkedInAt,
      })
      .from(queueTickets)
      .leftJoin(appointments, eq(queueTickets.appointmentId, appointments.id))
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
      serviceId: t.serviceId,
      categoryId: t.categoryId,
      sessionId: t.sessionId,
      serviceDate: t.queueDate,
      queueNumber: t.queueNumber,
      patientId: t.patientId,
      roomId: t.roomId,
      doctorId: t.doctorId,
      status: t.status,
      projectedStart: t.projectedStart ? new Date(t.projectedStart) : null,
      projectedEnd: t.projectedEnd ? new Date(t.projectedEnd) : null,
      calledAt: t.calledAt ? new Date(t.calledAt) : null,
      startedAt: t.startedAt ? new Date(t.startedAt) : null,
      completedAt: t.completedAt ? new Date(t.completedAt) : null,
      checkedInAt: t.checkedInAt ? new Date(t.checkedInAt) : null,
      carriedOver: Boolean(t.carriedOver),
      priority: t.priority,
      source: t.source || 'online',
    }));

    // 6. Evaluate impact with dynamic settings
    const impact = await this.closureEngine.evaluateClosureImpact({
      closure: {
        startsAt,
        endsAt,
        categoryId: dto.categoryId,
        doctorId: dto.doctorId,
        roomId: dto.roomId,
        lastCallBufferMin: dto.lastCallBufferMin,
      },
      tickets: mappedTickets,
      effectiveSegmentsAfterClosure: effectiveSegments,
    });

    const summary =
      `Penutupan ${dto.scope} (${dateStr} [${dto.startsAt.slice(11, 16)} - ${dto.endsAt.slice(11, 16)}]): ` +
      `${impact.moved.length} tiket dialihkan, ${impact.shifted.length} estimasi bergeser, ` +
      `${impact.needsDecision.length} tiket hadir perlu keputusan admin, ` +
      `${impact.inServiceProtected.length} sedang dilayani dilindungi.`;

    return {
      success: true,
      data: {
        summary,
        totalAffected: impact.totalAffected,
        inServiceProtected: impact.inServiceProtected.length,
        unaffected: impact.unaffected.map((t) => ({
          id: t.id,
          queueNumber: t.queueNumber,
        })),
        shifted: impact.shifted.map((b) => ({
          id: b.ticket.id,
          queueNumber: b.ticket.queueNumber,
          newProjectedStart: b.newProjectedStart.toISOString(),
          newProjectedEnd: b.newProjectedEnd.toISOString(),
        })),
        moved: impact.moved.map((t) => ({
          id: t.id,
          queueNumber: t.queueNumber,
          patientId: t.patientId,
        })),
        needsDecision: impact.needsDecision.map((t) => ({
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

    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException(
        'Waktu selesai harus lebih besar dari waktu mulai [startsAt, endsAt).',
      );
    }

    // 1. Preview to calculate impact
    const preview = await this.previewClosure(dto);
    const { moved, shifted, needsDecision, summary } = preview.data;

    const nowIso = new Date().toISOString();

    return await this.db.transaction(async (tx: any) => {
      // 2. Insert closure record
      const [closure] = await tx
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

      // 3. Process moved tickets (Rules R14, R16, R17, R18)
      for (const t of moved) {
        // Fetch source ticket record to inherit serviceId
        const [sourceTicket] = await tx
          .select()
          .from(queueTickets)
          .where(eq(queueTickets.id, t.id))
          .limit(1);

        const newTicketId = (
          await tx
            .insert(queueTickets)
            .values({
              categoryId: sourceTicket.categoryId,
              sessionId: sourceTicket.sessionId,
              serviceId: sourceTicket.serviceId,
              queueDate: dateStr,
              queueNumber: `${sourceTicket.queueNumber}-R`,
              patientId: sourceTicket.patientId,
              status: QUEUE_TICKET_STATUS.WAITING,
              carriedOver: true,
              source: sourceTicket.source || 'online',
              createdAt: nowIso,
              updatedAt: nowIso,
            })
            .returning({ id: queueTickets.id })
        )[0]?.id;

        await tx
          .update(queueTickets)
          .set({
            status: 'moved',
            movedTo: newTicketId,
            updatedAt: nowIso,
          })
          .where(eq(queueTickets.id, t.id));

        // Audit log and patient notification outbox (Rule R23)
        await tx.insert(ticketEvents).values({
          ticketId: t.id,
          event: QUEUE_TICKET_EVENTS.RESCHEDULED,
          fromStatus: sourceTicket.status,
          toStatus: 'moved',
          payload: {
            reason: dto.reason || 'Penutupan klinik operasional',
            movedTo: newTicketId,
            closureId: closure.id,
          },
        });

        await tx.insert(queueNotificationOutbox).values({
          ticketId: t.id,
          kind: QUEUE_OUTBOX_KINDS.TICKET_RESCHEDULED,
          payload: {
            oldTicketId: t.id,
            newTicketId,
            patientId: sourceTicket.patientId,
            closureReason: dto.reason,
          },
          status: OutboxStatus.PENDING,
        });
      }

      // 4. Update shifted tickets (Rule R13)
      for (const shift of shifted) {
        await tx
          .update(queueTickets)
          .set({
            projectedStart: shift.newProjectedStart,
            projectedEnd: shift.newProjectedEnd,
            updatedAt: nowIso,
          })
          .where(eq(queueTickets.id, shift.id));
      }

      return {
        success: true,
        message: `Penutupan berhasil diterapkan. ${moved.length} tiket dialihkan, ${shifted.length} bergeser.`,
        data: {
          closureId: closure.id,
          summary,
          movedCount: moved.length,
          shiftedCount: shifted.length,
          needsDecisionCount: needsDecision.length,
        },
      };
    });
  }

  @Get('closures')
  @ApiOperation({ summary: 'List clinic closures' })
  async getClosures(
    @Query('scope') scope?: string,
    @Query('categoryId') categoryId?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const conditions = [];

    if (activeOnly !== 'false') {
      conditions.push(isNull(clinicClosures.cancelledAt));
    }

    if (scope) {
      conditions.push(eq(clinicClosures.scope, scope));
    }

    if (categoryId) {
      conditions.push(eq(clinicClosures.categoryId, categoryId));
    }

    if (fromDate) {
      conditions.push(sql`${clinicClosures.endsAt} >= ${fromDate}`);
    }

    if (toDate) {
      conditions.push(sql`${clinicClosures.startsAt} <= ${toDate}`);
    }

    const closures = await this.db
      .select({
        id: clinicClosures.id,
        scope: clinicClosures.scope,
        categoryId: clinicClosures.categoryId,
        doctorId: clinicClosures.doctorId,
        roomId: clinicClosures.roomId,
        startsAt: clinicClosures.startsAt,
        endsAt: clinicClosures.endsAt,
        inputKind: clinicClosures.inputKind,
        lastCallBufferMin: clinicClosures.lastCallBufferMin,
        reason: clinicClosures.reason,
        createdBy: clinicClosures.createdBy,
        createdAt: clinicClosures.createdAt,
        cancelledAt: clinicClosures.cancelledAt,
        roomName: clinicRooms.name,
        categoryName: serviceCategories.name,
        doctorName: practitioners.displayName,
      })
      .from(clinicClosures)
      .leftJoin(clinicRooms, eq(clinicClosures.roomId, clinicRooms.id))
      .leftJoin(
        serviceCategories,
        eq(clinicClosures.categoryId, serviceCategories.id),
      )
      .leftJoin(practitioners, eq(clinicClosures.doctorId, practitioners.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(clinicClosures.startsAt));

    return {
      success: true,
      data: closures,
    };
  }

  @Post('closures/:id/cancel')
  @ApiOperation({
    summary: 'Cancel an active clinic closure (Rule R21 soft-cancellation)',
  })
  async cancelClosure(@Param('id') id: string) {
    const [closure] = await this.db
      .select()
      .from(clinicClosures)
      .where(eq(clinicClosures.id, id))
      .limit(1);

    if (!closure) {
      throw new NotFoundException(`Clinic closure not found: ${id}`);
    }

    if (closure.cancelledAt) {
      throw new BadRequestException(
        `Penutupan ini sudah dibatalkan sebelumnya pada ${closure.cancelledAt}.`,
      );
    }

    const nowIso = new Date().toISOString();

    const [updated] = await this.db
      .update(clinicClosures)
      .set({
        cancelledAt: nowIso,
      })
      .where(eq(clinicClosures.id, id))
      .returning();

    return {
      success: true,
      message:
        'Penutupan berhasil dibatalkan. Pendaftaran baru kembali dibuka. Sesuai Rule R21, tiket yang telah dipindahkan tidak otomatis dikembalikan.',
      data: updated,
    };
  }

  @Delete('closures/:id')
  @ApiOperation({
    summary: 'Delete/cancel a clinic closure (Rule R21 soft-cancellation)',
  })
  async deleteClosure(@Param('id') id: string) {
    return this.cancelClosure(id);
  }

  @Post('closures/reconcile')
  @ApiOperation({
    summary:
      'Reconcile waiting tickets against active closures (Section 5.3 safety net)',
  })
  async reconcileClosures() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const activeClosures = await this.db
      .select()
      .from(clinicClosures)
      .where(isNull(clinicClosures.cancelledAt));

    const activeTickets = await this.db
      .select({
        id: queueTickets.id,
        serviceId: queueTickets.serviceId,
        categoryId: queueTickets.categoryId,
        sessionId: queueTickets.sessionId,
        queueDate: queueTickets.queueDate,
        queueNumber: queueTickets.queueNumber,
        patientId: queueTickets.patientId,
        roomId: queueTickets.roomId,
        doctorId: queueTickets.doctorId,
        status: queueTickets.status,
        projectedStart: queueTickets.projectedStart,
        projectedEnd: queueTickets.projectedEnd,
        calledAt: queueTickets.calledAt,
        startedAt: queueTickets.startedAt,
        completedAt: queueTickets.completedAt,
        carriedOver: queueTickets.carriedOver,
        source: queueTickets.source,
        priority: queueTickets.priority,
        checkedInAt: appointments.checkedInAt,
      })
      .from(queueTickets)
      .leftJoin(appointments, eq(queueTickets.appointmentId, appointments.id))
      .where(
        and(
          eq(queueTickets.queueDate, todayStr),
          eq(queueTickets.status, QUEUE_TICKET_STATUS.WAITING),
        ),
      );

    const mappedTickets = activeTickets.map((t: any) => ({
      id: t.id,
      serviceId: t.serviceId,
      categoryId: t.categoryId,
      sessionId: t.sessionId,
      serviceDate: t.queueDate,
      queueNumber: t.queueNumber,
      patientId: t.patientId,
      roomId: t.roomId,
      doctorId: t.doctorId,
      status: t.status,
      projectedStart: t.projectedStart ? new Date(t.projectedStart) : null,
      projectedEnd: t.projectedEnd ? new Date(t.projectedEnd) : null,
      calledAt: t.calledAt ? new Date(t.calledAt) : null,
      startedAt: t.startedAt ? new Date(t.startedAt) : null,
      completedAt: t.completedAt ? new Date(t.completedAt) : null,
      checkedInAt: t.checkedInAt ? new Date(t.checkedInAt) : null,
      carriedOver: Boolean(t.carriedOver),
      priority: t.priority,
      source: t.source || 'online',
    }));

    const dow = new Date(`${todayStr}T00:00:00.000Z`).getUTCDay();
    const activeSchedulesRaw = await this.db
      .select()
      .from(sessionSchedules)
      .where(
        and(
          eq(sessionSchedules.dow, dow),
          eq(sessionSchedules.isActive, true),
        ),
      );

    const activeSchedules: ScheduledShift[] = activeSchedulesRaw.map(
      (s: any) => ({
        id: s.id,
        sessionId: s.sessionId,
        dow: s.dow,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        isActive: s.isActive,
      }),
    );

    const formattedClosures = activeClosures.map((c: any) => ({
      id: c.id,
      scope: c.scope,
      categoryId: c.categoryId,
      doctorId: c.doctorId,
      roomId: c.roomId,
      startsAt: new Date(c.startsAt),
      endsAt: new Date(c.endsAt),
      inputKind: c.inputKind,
      lastCallBufferMin: c.lastCallBufferMin,
      reason: c.reason,
      cancelledAt: c.cancelledAt ? new Date(c.cancelledAt) : null,
    }));

    const effectiveSegments = await this.calendar.effectiveOpenSegments({
      dateStr: todayStr,
      schedules: activeSchedules,
      closures: formattedClosures,
      extras: [],
    });

    const result = await this.closureEngine.reconcileClosureTickets({
      tickets: mappedTickets,
      activeClosures: formattedClosures,
      effectiveSegments,
    });

    return {
      success: true,
      message: `Rekonsiliasi penutupan selesai. ${result.moved.length} tiket perlu dialihkan, ${result.shifted.length} tiket bergeser.`,
      data: {
        totalAffected: result.totalAffected,
        unaffectedCount: result.unaffected.length,
        shiftedCount: result.shifted.length,
        movedCount: result.moved.length,
        needsDecisionCount: result.needsDecision.length,
      },
    };
  }
}
