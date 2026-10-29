import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, lt, not } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { appointments, queueTickets } from '../../../../database/schema';
import {
  DB_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
  TERMINAL_APPOINTMENT_STATUSES,
} from '../constants/appointment-lifecycle.constants';
import type {
  AppointmentAction,
  AppointmentStatus,
} from '../types/appointment.types';

@Injectable()
export class QueueEligibilityService {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  /**
   * Evaluasi eligibilitas check-in pasien.
   * Check-in independen dari urutan nomor antrean pelayanan, namun wajib pada tanggal yang sama
   * dan hanya jika dokter serta ruangan telah ditugaskan.
   */
  static isEligibleForCheckIn(
    appointmentStatus: string,
    scheduledDate: string,
    todayDateStr: string,
    context?: {
      hasDoctor?: boolean;
      hasRoom?: boolean;
    },
  ): boolean {
    if (scheduledDate !== todayDateStr) {
      return false;
    }
    if (context && (!context.hasDoctor || !context.hasRoom)) {
      return false;
    }
    return (
      appointmentStatus === DB_APPOINTMENT_STATUS.BOOKED ||
      appointmentStatus === DB_APPOINTMENT_STATUS.WAITING
    );
  }

  /**
   * Menentukan daftar aksi yang diizinkan (authoritative SSOT) untuk antrean.
   * Hanya pasien pertama dalam urutan antrean aktif (aheadCount === 0) yang memiliki hak dipanggil.
   */
  static resolveAllowedActions(
    status: AppointmentStatus,
    contextOrAheadCount:
      | {
          hasDoctor?: boolean;
          hasRoom?: boolean;
          aheadCount?: number;
          canCheckIn?: boolean;
        }
      | number = 0,
  ): AppointmentAction[] {
    const context =
      typeof contextOrAheadCount === 'number'
        ? { aheadCount: contextOrAheadCount, hasDoctor: true, hasRoom: true }
        : contextOrAheadCount;

    const {
      hasDoctor = false,
      hasRoom = false,
      aheadCount = 0,
      canCheckIn = true,
    } = context;
    const isFullyAssigned = Boolean(hasDoctor && hasRoom);

    switch (status) {
      case 'BOOKED': {
        const actions: AppointmentAction[] = [];
        if (!hasDoctor) actions.push('ASSIGN_DOCTOR');
        if (!hasRoom) actions.push('ASSIGN_ROOM');
        if (isFullyAssigned && canCheckIn) actions.push('CHECK_IN');
        actions.push('CANCEL');
        return actions;
      }
      case 'WAITING':
        return aheadCount === 0 && isFullyAssigned
          ? ['CALL', 'START_SERVICE', 'CANCEL']
          : ['CANCEL'];
      case 'IN_SERVICE':
        return ['COMPLETE'];
      default:
        return [];
    }
  }

  /**
   * Memvalidasi bahwa antrean yang hendak dipanggil adalah yang paling berhak (strict queue order).
   * Melemparkan ConflictException jika nomor antrean sebelumnya masih dalam status 'waiting'.
   */
  async assertEligibleForCall(appointmentId: string): Promise<{
    ticketId: string;
    queueNumber: string;
    categoryId: string | null;
    serviceDate: string;
    patientUserId: string | null;
  }> {
    const apt = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      with: {
        queueTickets: true,
      },
    });

    if (!apt) {
      throw new NotFoundException('Janji temu tidak ditemukan.');
    }

    const nonCallableStatuses = [
      ...TERMINAL_APPOINTMENT_STATUSES,
      DB_APPOINTMENT_STATUS.NO_SHOW,
    ] as readonly string[];

    if (nonCallableStatuses.includes(apt.status)) {
      throw new ConflictException(
        `Janji temu dengan status "${apt.status}" tidak dapat dipanggil.`,
      );
    }

    const ticket = apt.queueTickets?.[0];
    if (!ticket) {
      throw new NotFoundException(
        'Tiket antrean tidak ditemukan untuk janji temu ini.',
      );
    }

    // Periksa apakah ada tiket sebelumnya yang masih berstatus 'waiting' pada kategori & tanggal yang sama
    const earlierWaitingTicket = await this.db.query.queueTickets.findFirst({
      where: and(
        eq(queueTickets.queueDate, ticket.queueDate),
        ticket.categoryId
          ? eq(queueTickets.categoryId, ticket.categoryId)
          : undefined,
        eq(queueTickets.status, QUEUE_TICKET_STATUS.WAITING),
        lt(queueTickets.queueNumber, ticket.queueNumber),
        not(eq(queueTickets.id, ticket.id)),
      ),
      orderBy: [asc(queueTickets.queueNumber)],
    });

    if (earlierWaitingTicket) {
      throw new ConflictException(
        `Nomor antrean ${ticket.queueNumber} tidak dapat dipanggil. Nomor antrean sebelumnya (${earlierWaitingTicket.queueNumber}) masih menunggu dan harus dipanggil terlebih dahulu.`,
      );
    }

    return {
      ticketId: ticket.id,
      queueNumber: ticket.queueNumber,
      categoryId: ticket.categoryId,
      serviceDate: ticket.queueDate,
      patientUserId: apt.patientId,
    };
  }
}
