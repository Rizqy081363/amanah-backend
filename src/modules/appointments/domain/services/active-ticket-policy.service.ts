import {
  ConflictException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { and, eq, inArray, not, sql } from 'drizzle-orm';
import type { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { queueTickets } from '../../../../database/schema';
import { QUEUE_TICKET_STATUS } from '../constants/appointment-lifecycle.constants';

export interface ActiveTicketCheckParams {
  patientId: string;
  categoryId: string;
  queueDate: string;
  excludeTicketId?: string;
}

export interface ActiveTicketSummary {
  id: string;
  appointmentId: string | null;
  queueNumber: string;
  status: string;
  categoryId: string | null;
  sessionId: string | null;
  queueDate: string;
  waitingPosition: number | null;
  estimatedCalledAt: string | null;
  projectedStart: string | null;
  projectedEnd: string | null;
}

const ACTIVE_TICKET_STATUSES = [
  QUEUE_TICKET_STATUS.WAITING,
  QUEUE_TICKET_STATUS.CALLED,
  QUEUE_TICKET_STATUS.IN_SERVICE,
] as const;

@Injectable()
export class ActiveTicketPolicyService {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    @Optional()
    private readonly clinicConfig?: ClinicConfigService,
  ) {}

  /**
   * Mengambil daftar tiket aktif milik pasien pada tanggal dan kategori tertentu.
   * Status aktif: 'waiting' | 'called' | 'in_service' (sesuai invariant Blueprint H2).
   */
  static async findActiveTickets(
    db: any,
    params: {
      patientId: string;
      categoryId?: string;
      queueDate: string;
      excludeTicketId?: string;
    },
  ): Promise<ActiveTicketSummary[]> {
    const conditions = [
      eq(queueTickets.patientId, params.patientId),
      eq(queueTickets.queueDate, params.queueDate),
      inArray(queueTickets.status, [...ACTIVE_TICKET_STATUSES]),
    ];

    if (params.categoryId) {
      conditions.push(eq(queueTickets.categoryId, params.categoryId));
    }

    if (params.excludeTicketId) {
      conditions.push(not(eq(queueTickets.id, params.excludeTicketId)));
    }

    const rows = await db
      .select({
        id: queueTickets.id,
        appointmentId: queueTickets.appointmentId,
        queueNumber: queueTickets.queueNumber,
        status: queueTickets.status,
        categoryId: queueTickets.categoryId,
        sessionId: queueTickets.sessionId,
        queueDate: queueTickets.queueDate,
        waitingPosition: queueTickets.waitingPosition,
        estimatedCalledAt: queueTickets.estimatedCalledAt,
        projectedStart: queueTickets.projectedStart,
        projectedEnd: queueTickets.projectedEnd,
      })
      .from(queueTickets)
      .where(and(...conditions));

    return rows;
  }

  /**
   * Memvalidasi bahwa pasien belum memiliki tiket aktif untuk kategori & tanggal tertentu.
   * Menghormati konfigurasi 'ticket.max_active_per_patient_category_day' (default 1).
   * Melempar ConflictException (HTTP 409) dengan detail tiket aktif jika kuota terlampaui.
   */
  static async assertNoActiveTicketConflict(
    db: any,
    params: ActiveTicketCheckParams,
    clinicConfig?: ClinicConfigService,
  ): Promise<void> {
    const activeTickets = await ActiveTicketPolicyService.findActiveTickets(
      db,
      params,
    );

    const maxAllowed = clinicConfig
      ? await clinicConfig
          .getNumber('ticket.max_active_per_patient_category_day')
          .catch(() => 1)
      : 1;

    if (activeTickets.length >= maxAllowed) {
      const existingTicket = activeTickets[0];
      throw new ConflictException({
        code: 'ACTIVE_TICKET_CONFLICT',
        message: `Pasien sudah memiliki tiket antrean aktif (${existingTicket.queueNumber}) untuk kategori ini pada tanggal ${params.queueDate}. Silakan gunakan tiket yang sudah ada atau selesaikan antrean terlebih dahulu.`,
        activeTicket: existingTicket,
      });
    }
  }

  async findActiveTickets(params: {
    patientId: string;
    categoryId?: string;
    queueDate: string;
    excludeTicketId?: string;
  }): Promise<ActiveTicketSummary[]> {
    return ActiveTicketPolicyService.findActiveTickets(this.db, params);
  }

  async assertNoActiveTicketConflict(
    params: ActiveTicketCheckParams,
  ): Promise<void> {
    return ActiveTicketPolicyService.assertNoActiveTicketConflict(
      this.db,
      params,
      this.clinicConfig,
    );
  }
}
