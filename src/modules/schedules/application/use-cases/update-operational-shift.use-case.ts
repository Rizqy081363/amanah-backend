import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { type AuthenticatedUser, isAdminUser } from '../../../../common/auth';
import { DomainForbiddenException } from '../../../../common/exceptions';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  queueTickets,
  sessionDefs,
} from '../../../../database/schema';
import { QueueEventPublisher } from '../../../queue-engine/application/services/queue-event-publisher.service';
import { DrizzleAdminScheduleConfigurationRepository } from '../../infrastructure/drizzle/repositories/admin/drizzle-admin-schedule-configuration.repository';
import type { UpdateSessionDefDto } from '../../presentation/dto/admin-schedule-configuration.dto';

@Injectable()
export class UpdateOperationalShiftUseCase {
  private readonly logger = new Logger(UpdateOperationalShiftUseCase.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly configRepo: DrizzleAdminScheduleConfigurationRepository,
    private readonly queueEventPublisher: QueueEventPublisher,
    private readonly clinicTimeService: ClinicTimeService,
  ) {}

  async execute(
    defs: UpdateSessionDefDto[],
    user?: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string; affectedSessions: number }> {
    if (user && !isAdminUser(user)) {
      throw new DomainForbiddenException(
        'Hanya admin klinik yang berwenang memperbarui shift operasional',
      );
    }

    if (!defs || defs.length === 0) {
      return {
        success: true,
        message: 'Tidak ada perubahan definisi shift operasional',
        affectedSessions: 0,
      };
    }

    // 1. Snapshot previous session definitions to detect timing changes
    const existingDefs = await this.db
      .select({
        id: sessionDefs.id,
        defaultStartsAt: sessionDefs.defaultStartsAt,
        defaultEndsAt: sessionDefs.defaultEndsAt,
      })
      .from(sessionDefs);

    const prevDefMap = new Map(existingDefs.map((d) => [d.id, d]));

    // 2. Persist changes to session_defs & cascade to session_schedules
    await this.configRepo.updateSessionDefs(defs);

    // 3. Detect which sessions changed operating hours
    const shiftedSessions: Array<{
      sessionId: string;
      newStartsAt?: string;
      newEndsAt?: string;
      oldStartsAt?: string;
      oldEndsAt?: string;
    }> = [];

    for (const def of defs) {
      const prev = prevDefMap.get(def.id);
      if (!prev) continue;

      const hasStartShift =
        Boolean(def.defaultStartsAt) &&
        def.defaultStartsAt !== prev.defaultStartsAt;
      const hasEndShift =
        Boolean(def.defaultEndsAt) && def.defaultEndsAt !== prev.defaultEndsAt;

      if (hasStartShift || hasEndShift) {
        shiftedSessions.push({
          sessionId: def.id,
          newStartsAt: def.defaultStartsAt || prev.defaultStartsAt,
          newEndsAt: def.defaultEndsAt || prev.defaultEndsAt,
          oldStartsAt: prev.defaultStartsAt,
          oldEndsAt: prev.defaultEndsAt,
        });
      }
    }

    // 4. Trigger RabbitMQ progression recalculation for affected active sessions
    const today = this.clinicTimeService.today();

    for (const shifted of shiftedSessions) {
      this.logger.log(
        `Operational shift changed for session ${shifted.sessionId}: ${shifted.oldStartsAt}->${shifted.newStartsAt} to ${shifted.oldEndsAt}->${shifted.newEndsAt}`,
      );

      const activeRows = await this.db
        .select({
          serviceDate: queueTickets.queueDate,
        })
        .from(queueTickets)
        .where(
          and(
            eq(queueTickets.sessionId, shifted.sessionId),
            gte(queueTickets.queueDate, today),
            inArray(queueTickets.status, ['waiting', 'called', 'in_service']),
          ),
        );

      const distinctDates = Array.from(
        new Set(activeRows.map((r) => r.serviceDate)),
      );

      const activeApts = await this.db
        .select({
          scheduledDate: appointments.scheduledDate,
        })
        .from(appointments)
        .innerJoin(
          queueTickets,
          eq(appointments.id, queueTickets.appointmentId),
        )
        .where(
          and(
            eq(queueTickets.sessionId, shifted.sessionId),
            gte(appointments.scheduledDate, today),
            inArray(appointments.status, ['booked', 'waiting']),
          ),
        );

      for (const a of activeApts) {
        if (!distinctDates.includes(a.scheduledDate)) {
          distinctDates.push(a.scheduledDate);
        }
      }

      if (!distinctDates.includes(today)) {
        distinctDates.push(today);
      }

      for (const date of distinctDates) {
        await this.queueEventPublisher.publishProgression({
          eventType: 'shift_changed',
          serviceDate: date,
          sessionId: shifted.sessionId,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return {
      success: true,
      message:
        'Definisi shift operasional berhasil diperbarui dan rekalkulasi antrean dipicu',
      affectedSessions: shiftedSessions.length,
    };
  }
}
