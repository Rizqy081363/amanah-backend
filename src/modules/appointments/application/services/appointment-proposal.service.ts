import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { NOTIFICATION_AUDIENCE } from '../../../../common/constants/notification-audience.constants';
import { RedisService } from '../../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointmentChangeProposals,
  appointments,
  appointmentStatusEvents,
  clinicRooms,
  clinicServices,
  patientAffiliations,
  patientProfiles,
  practitioners,
  queueTickets,
  serviceCategories,
  sessionDefs,
} from '../../../../database/schema';
import { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import { QueuePositionRecalculationService } from '../../../queue-engine/application/services/queue-position-recalculation.service';
import { NotificationRepository } from '../../../notifications/domain/repositories/notification.repository';
import { SocketIoRealtimeGateway } from '../../../notifications/infrastructure/realtime/socket-io-realtime.gateway';
import {
  NOTIFICATION_REPOSITORY,
  REALTIME_EVENTS,
  REALTIME_GATEWAY_PORT,
  REALTIME_ROOMS,
} from '../../../notifications/notifications.constants';
import { AppointmentRecipientResolver } from '../../infrastructure/resolvers/appointment-recipient.resolver';
import {
  DB_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/appointment-lifecycle.constants';
import { ProposeRescheduleDto } from '../../presentation/dto/propose-reschedule.dto';
import { ProposeCancellationDto } from '../../presentation/dto/propose-cancellation.dto';
import { RespondProposalDto } from '../../presentation/dto/respond-proposal.dto';
import {
  type AuthenticatedUser,
  isAdminUser,
} from '../../../../common/auth/authenticated-user.interface';

export interface BulkProposalResult {
  total: number;
  succeededCount: number;
  failedCount: number;
  succeededIds: string[];
  errors: Array<{ id: string; message: string }>;
}

/**
 * Single Source of Truth for proposal expiration deadline calculation.
 * 100% DB-driven from session_def and clinic_setting.
 */
export function calculateProposalExpiresAt(params: {
  createdAt: Date | string;
  originalDate: string;
  defaultStartsAt?: string | null;
  leadMinutes: number;
  fallbackWindowHours: number;
}): Date {
  const {
    createdAt,
    originalDate,
    defaultStartsAt,
    leadMinutes,
    fallbackWindowHours,
  } = params;

  const createdTime = new Date(createdAt).getTime();
  const startTimeStr = defaultStartsAt || '08:00:00';
  const sessionStartTime = new Date(
    `${originalDate}T${startTimeStr}+07:00`,
  ).getTime();
  const sessionLeadDeadline = sessionStartTime - leadMinutes * 60_000;
  const fallbackDeadline = createdTime + fallbackWindowHours * 3_600_000;

  // Minimum safety window for human response (2 hours)
  const minResponseWindowMs = 2 * 3_600_000;

  // If session-based lead deadline is in the past, or leaves less than 2 hours to respond:
  if (sessionLeadDeadline <= createdTime + minResponseWindowMs) {
    return new Date(fallbackDeadline);
  }

  // Otherwise, patient has until leadMinutes before session begins
  return new Date(sessionLeadDeadline);
}

@Injectable()
export class AppointmentProposalService {
  private readonly logger = new Logger(AppointmentProposalService.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly clinicConfigService: ClinicConfigService,
    private readonly queuePositionRecalculationService: QueuePositionRecalculationService,
    @Optional()
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo?: NotificationRepository,
    @Optional()
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
    @Optional()
    private readonly redisService?: RedisService,
    @Optional()
    private readonly recipientResolver?: AppointmentRecipientResolver,
  ) {}

  /**
   * Proposes rescheduling an appointment to a target date and session.
   * Does NOT alter confirmed appointment schedule directly.
   */
  async proposeReschedule(
    appointmentId: string,
    dto: ProposeRescheduleDto,
    initiatorUser: AuthenticatedUser,
  ) {
    const [apt] = await this.db
      .select({
        id: appointments.id,
        status: appointments.status,
        bookingCode: appointments.bookingCode,
        scheduledDate: appointments.scheduledDate,
        scheduledStartTime: appointments.scheduledStartTime,
        patientId: appointments.patientId,
        practitionerId: appointments.practitionerId,
        roomId: appointments.roomId,
        appointmentCreatedBy: appointments.createdBy,
        profileUserId: patientProfiles.userId,
        affiliationUserId: patientAffiliations.userId,
        patientName: patientProfiles.fullName,
        ticketId: queueTickets.id,
        ticketSessionId: queueTickets.sessionId,
      })
      .from(appointments)
      .innerJoin(
        patientProfiles,
        eq(patientProfiles.id, appointments.patientId),
      )
      .leftJoin(
        patientAffiliations,
        eq(patientAffiliations.patientId, appointments.patientId),
      )
      .leftJoin(queueTickets, eq(queueTickets.appointmentId, appointments.id))
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    if (!apt) {
      throw new NotFoundException(
        `Janji temu dengan ID ${appointmentId} tidak ditemukan.`,
      );
    }

    const patientUserId =
      apt.profileUserId ||
      apt.affiliationUserId ||
      apt.appointmentCreatedBy ||
      null;

    if (
      apt.status === DB_APPOINTMENT_STATUS.CANCELLED ||
      apt.status === DB_APPOINTMENT_STATUS.COMPLETED
    ) {
      throw new BadRequestException(
        `Janji temu tidak dapat diajukan perubahan jadwal karena berstatus "${apt.status}".`,
      );
    }

    // Verify max pending proposals from SSOT clinic_setting
    const maxPending = await this.clinicConfigService
      .getNumber('proposal.max_pending_per_appointment')
      .catch(() => 1);
    const existingPending = await this.db
      .select({ id: appointmentChangeProposals.id })
      .from(appointmentChangeProposals)
      .where(
        and(
          eq(appointmentChangeProposals.appointmentId, appointmentId),
          eq(appointmentChangeProposals.status, 'pending'),
        ),
      );

    if (existingPending.length >= maxPending) {
      throw new BadRequestException(
        'Masih ada pengajuan perubahan yang berstatus pending untuk janji temu ini. Tunggu respon pasien sebelum mengajukan kembali.',
      );
    }

    // Validate destination session
    const [destSession] = await this.db
      .select()
      .from(sessionDefs)
      .where(eq(sessionDefs.id, dto.targetSessionId))
      .limit(1);

    if (!destSession) {
      throw new NotFoundException(
        `Sesi dinas tujuan dengan ID ${dto.targetSessionId} tidak ditemukan.`,
      );
    }

    // Resolve sequential queue projection in destination stream
    let projectedQueueNumber: number | null = null;
    if (dto.targetDoctorId) {
      const [countRow] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(queueTickets)
        .where(
          and(
            eq(queueTickets.queueDate, dto.targetDate),
            eq(queueTickets.doctorId, dto.targetDoctorId),
            sql`${queueTickets.status} IN ('waiting', 'called', 'in_service')`,
          ),
        );
      projectedQueueNumber = (countRow?.count || 0) + 1;
    }

    const [proposal] = await this.db
      .insert(appointmentChangeProposals)
      .values({
        appointmentId: apt.id,
        proposalType: 'reschedule',
        status: 'pending',
        initiatorUserId: initiatorUser?.id || null,
        reason: dto.reason,
        originalDate: apt.scheduledDate,
        originalSessionId: apt.ticketSessionId || null,
        proposedDate: dto.targetDate,
        proposedSessionId: dto.targetSessionId,
        proposedDoctorId: dto.targetDoctorId || null,
        proposedRoomId: dto.targetRoomId || null,
        estimatedQueueNumber: projectedQueueNumber,
        patientUserId: patientUserId,
      })
      .returning();

    // Create Actionable In-App & Push Notification
    let notificationId: string | null = null;
    if (this.notificationRepo && patientUserId) {
      try {
        const notif = await this.notificationRepo.createIfNotExists({
          category: 'appointment',
          audience: NOTIFICATION_AUDIENCE.EXTERNAL,
          title: 'Pengajuan Perubahan Jadwal Janji Temu',
          body: `Klinik Amanah mengajukan perubahan jadwal janji temu Anda (${apt.bookingCode}) dari tanggal ${apt.scheduledDate} menjadi ${dto.targetDate} (Sesi: ${destSession.label || destSession.code}) karena: ${dto.reason}. Apakah Anda menyetujui perubahan ini?`,
          recipientUserIds: [patientUserId],
          actions: [
            {
              label: 'Setuju Pindah Jadwal',
              actionKey: 'ACCEPT_RESCHEDULE',
              actionType: 'primary',
              url: '/klinik/antrean',
            },
            {
              label: 'Tetap Jadwal Semula',
              actionKey: 'DECLINE_RESCHEDULE',
              actionType: 'secondary',
              url: '/klinik/antrean',
            },
          ],
          metadata: {
            proposalId: proposal.id,
            appointmentId: apt.id,
            proposalType: 'reschedule',
          },
        });
        if (notif) {
          notificationId = notif.id;

          await this.db
            .update(appointmentChangeProposals)
            .set({ notificationId: notif.id })
            .where(eq(appointmentChangeProposals.id, proposal.id));
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to dispatch notification for proposal ${proposal.id}: ${err.message}`,
        );
      }
    }

    if (this.realtimeGateway) {
      const payload = {
        proposalId: proposal.id,
        appointmentId: apt.id,
        patientUserId: patientUserId,
        proposalType: 'reschedule',
        proposedDate: dto.targetDate,
        reason: dto.reason,
      };

      if (patientUserId) {
        await this.realtimeGateway.emitToUser(
          patientUserId,
          'appointment:proposal_created',
          payload,
        );
      }
      await this.realtimeGateway.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'appointment:proposal_created',
        payload,
      );
    }

    return {
      success: true,
      proposalId: proposal.id,
      appointmentId: apt.id,
      status: proposal.status,
      proposedDate: dto.targetDate,
      estimatedQueueNumber: projectedQueueNumber,
      notificationId,
      message:
        'Pengajuan perubahan jadwal berhasil dibuat dan dikirim ke pasien untuk persetujuan.',
    };
  }

  /**
   * Proposes cancelling an appointment.
   * Does NOT alter confirmed appointment status directly.
   */
  async proposeCancellation(
    appointmentId: string,
    dto: ProposeCancellationDto,
    initiatorUser: AuthenticatedUser,
  ) {
    const [apt] = await this.db
      .select({
        id: appointments.id,
        status: appointments.status,
        bookingCode: appointments.bookingCode,
        scheduledDate: appointments.scheduledDate,
        patientId: appointments.patientId,
        appointmentCreatedBy: appointments.createdBy,
        profileUserId: patientProfiles.userId,
        affiliationUserId: patientAffiliations.userId,
        patientName: patientProfiles.fullName,
        ticketSessionId: queueTickets.sessionId,
      })
      .from(appointments)
      .innerJoin(
        patientProfiles,
        eq(patientProfiles.id, appointments.patientId),
      )
      .leftJoin(
        patientAffiliations,
        eq(patientAffiliations.patientId, appointments.patientId),
      )
      .leftJoin(queueTickets, eq(queueTickets.appointmentId, appointments.id))
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    if (!apt) {
      throw new NotFoundException(
        `Janji temu dengan ID ${appointmentId} tidak ditemukan.`,
      );
    }

    const patientUserId =
      apt.profileUserId ||
      apt.affiliationUserId ||
      apt.appointmentCreatedBy ||
      null;

    if (
      apt.status === DB_APPOINTMENT_STATUS.CANCELLED ||
      apt.status === DB_APPOINTMENT_STATUS.COMPLETED
    ) {
      throw new BadRequestException(
        `Janji temu tidak dapat diajukan pembatalan karena berstatus "${apt.status}".`,
      );
    }

    const maxPending = await this.clinicConfigService
      .getNumber('proposal.max_pending_per_appointment')
      .catch(() => 1);
    const existingPending = await this.db
      .select({ id: appointmentChangeProposals.id })
      .from(appointmentChangeProposals)
      .where(
        and(
          eq(appointmentChangeProposals.appointmentId, appointmentId),
          eq(appointmentChangeProposals.status, 'pending'),
        ),
      );

    if (existingPending.length >= maxPending) {
      throw new BadRequestException(
        'Masih ada pengajuan yang berstatus pending untuk janji temu ini.',
      );
    }

    const [proposal] = await this.db
      .insert(appointmentChangeProposals)
      .values({
        appointmentId: apt.id,
        proposalType: 'cancellation',
        status: 'pending',
        initiatorUserId: initiatorUser?.id || null,
        reason: dto.reason,
        originalDate: apt.scheduledDate,
        originalSessionId: apt.ticketSessionId || null,
        patientUserId: patientUserId,
      })
      .returning();

    let notificationId: string | null = null;
    if (this.notificationRepo && patientUserId) {
      try {
        const notif = await this.notificationRepo.createIfNotExists({
          category: 'appointment',
          audience: NOTIFICATION_AUDIENCE.EXTERNAL,
          title: 'Pengajuan Pembatalan Janji Temu',
          body: `Klinik Amanah mengajukan pembatalan janji temu Anda (${apt.bookingCode}) pada tanggal ${apt.scheduledDate} karena: ${dto.reason}. Apakah Anda menyetujui pembatalan ini?`,
          recipientUserIds: [patientUserId],
          actions: [
            {
              label: 'Setuju Dibatalkan',
              actionKey: 'ACCEPT_CANCELLATION',
              actionType: 'warning',
              url: '/klinik/antrean',
            },
            {
              label: 'Tolak Pembatalan',
              actionKey: 'DECLINE_CANCELLATION',
              actionType: 'secondary',
              url: '/klinik/antrean',
            },
          ],
          metadata: {
            proposalId: proposal.id,
            appointmentId: apt.id,
            proposalType: 'cancellation',
          },
        });
        if (notif) {
          notificationId = notif.id;

          await this.db
            .update(appointmentChangeProposals)
            .set({ notificationId: notif.id })
            .where(eq(appointmentChangeProposals.id, proposal.id));
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to dispatch cancellation notification for proposal ${proposal.id}: ${err.message}`,
        );
      }
    }

    if (this.realtimeGateway) {
      const payload = {
        proposalId: proposal.id,
        appointmentId: apt.id,
        patientUserId: patientUserId,
        proposalType: 'cancellation',
        reason: dto.reason,
      };

      if (patientUserId) {
        await this.realtimeGateway.emitToUser(
          patientUserId,
          'appointment:proposal_created',
          payload,
        );
      }
      await this.realtimeGateway.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'appointment:proposal_created',
        payload,
      );
    }

    return {
      success: true,
      proposalId: proposal.id,
      appointmentId: apt.id,
      status: proposal.status,
      notificationId,
      message:
        'Pengajuan pembatalan janji temu berhasil dibuat dan dikirim ke pasien untuk persetujuan.',
    };
  }

  /**
   * Patient responds to a proposal (accepted or declined).
   * Transactional and atomic.
   */
  async respondToProposal(
    proposalId: string,
    dto: RespondProposalDto,
    user: AuthenticatedUser,
  ) {
    return this.db.transaction(async (tx) => {
      // 1. Lock and load proposal row
      const [proposal] = await tx
        .select()
        .from(appointmentChangeProposals)
        .where(eq(appointmentChangeProposals.id, proposalId))
        .for('update');

      if (!proposal) {
        throw new NotFoundException(
          `Pengajuan perubahan janji temu dengan ID ${proposalId} tidak ditemukan.`,
        );
      }

      if (proposal.status !== 'pending') {
        if (proposal.status === dto.decision) {
          return {
            success: true,
            proposalId: proposal.id,
            appointmentId: proposal.appointmentId,
            proposalType: proposal.proposalType,
            decision: dto.decision,
            message: 'Tanggapan Anda telah diproses sebelumnya.',
          };
        }
        throw new ConflictException(
          `Pengajuan ini sudah tidak berstatus pending (status saat ini: "${proposal.status}").`,
        );
      }

      // Just-In-Time Expiration Check (Gate 1): Protect against race conditions and cron delay
      const leadMinutes = await this.clinicConfigService
        .getNumber('proposal.expiration_lead_minutes')
        .catch(() => 60);
      const fallbackWindowHours = await this.clinicConfigService
        .getNumber('proposal.fallback_window_hours')
        .catch(() => 24);

      let defaultStartsAt: string | null = null;
      if (proposal.originalSessionId) {
        const [origSession] = await tx
          .select({ defaultStartsAt: sessionDefs.defaultStartsAt })
          .from(sessionDefs)
          .where(eq(sessionDefs.id, proposal.originalSessionId))
          .limit(1);
        defaultStartsAt = origSession?.defaultStartsAt || null;
      }

      const expiresAt = calculateProposalExpiresAt({
        createdAt: proposal.createdAt,
        originalDate: proposal.originalDate,
        defaultStartsAt,
        leadMinutes,
        fallbackWindowHours,
      });

      if (new Date() >= expiresAt) {
        await tx
          .update(appointmentChangeProposals)
          .set({
            status: 'expired',
            patientResponseNotes: 'Kedaluwarsa saat direspons oleh pasien.',
            updatedAt: sql`NOW()`,
          })
          .where(eq(appointmentChangeProposals.id, proposal.id));

        throw new ConflictException(
          'Pengajuan perubahan janji temu ini telah kedaluwarsa dan tidak dapat lagi direspons.',
        );
      }

      // 2. Validate patient ownership or administrative authority
      const isOwner =
        proposal.patientUserId === user.id ||
        (await this.verifyPatientAccess(tx, proposal.appointmentId, user));

      const hasAdminAccess =
        isAdminUser(user) ||
        (user.permissions?.includes('appointments:manage') ?? false);

      if (!isOwner && !hasAdminAccess) {
        throw new ForbiddenException(
          'Anda tidak memiliki akses untuk merespons pengajuan janji temu ini.',
        );
      }

      // 3. Load appointment with patient profile
      const [apt] = await tx
        .select({
          id: appointments.id,
          bookingCode: appointments.bookingCode,
          status: appointments.status,
          scheduledDate: appointments.scheduledDate,
          scheduledStartTime: appointments.scheduledStartTime,
          scheduledEndTime: appointments.scheduledEndTime,
          patientId: appointments.patientId,
          practitionerId: appointments.practitionerId,
          serviceId: appointments.serviceId,
          roomId: appointments.roomId,
          patientName: patientProfiles.fullName,
          avatarUrl: patientProfiles.avatarUrl,
        })
        .from(appointments)
        .leftJoin(
          patientProfiles,
          eq(patientProfiles.id, appointments.patientId),
        )
        .where(eq(appointments.id, proposal.appointmentId))
        .limit(1);

      if (!apt) {
        throw new NotFoundException(
          `Janji temu terkait dengan ID ${proposal.appointmentId} tidak ditemukan.`,
        );
      }

      const now = new Date();
      const nowIso = now.toISOString();

      if (dto.decision === 'accepted') {
        if (proposal.proposalType === 'reschedule') {
          if (!proposal.proposedDate || !proposal.proposedSessionId) {
            throw new BadRequestException(
              'Data tanggal atau sesi tujuan pada pengajuan tidak lengkap.',
            );
          }

          const originalDate = apt.scheduledDate;
          const originalDoctorId = apt.practitionerId;
          const targetDoctorId =
            proposal.proposedDoctorId || apt.practitionerId;

          // Re-validate session
          const [destSession] = await tx
            .select()
            .from(sessionDefs)
            .where(eq(sessionDefs.id, proposal.proposedSessionId))
            .limit(1);

          if (!destSession) {
            throw new NotFoundException(
              'Sesi dinas tujuan tidak lagi tersedia di database.',
            );
          }

          // Atomically update appointment schedule
          await tx
            .update(appointments)
            .set({
              scheduledDate: proposal.proposedDate,
              scheduledStartTime: destSession.defaultStartsAt,
              scheduledEndTime: destSession.defaultEndsAt,
              practitionerId: targetDoctorId,
              roomId: proposal.proposedRoomId || apt.roomId,
              updatedAt: sql`NOW()`,
            })
            .where(eq(appointments.id, apt.id));

          // Atomically update queue ticket
          await tx
            .update(queueTickets)
            .set({
              queueDate: proposal.proposedDate,
              sessionId: proposal.proposedSessionId,
              doctorId: targetDoctorId,
              roomId: proposal.proposedRoomId || apt.roomId,
              updatedAt: sql`NOW()`,
            })
            .where(eq(queueTickets.appointmentId, apt.id));

          // Audit record
          await tx.insert(appointmentStatusEvents).values({
            appointmentId: apt.id,
            previousStatus: apt.status,
            newStatus: apt.status,
            changedBy: user?.id || null,
            reason: `Pasien menyetujui pengajuan reschedule ke ${proposal.proposedDate} (Sesi: ${destSession.label || destSession.code}). ${dto.notes || ''}`.trim(),
          });

          // Mark proposal accepted
          await tx
            .update(appointmentChangeProposals)
            .set({
              status: 'accepted',
              patientResponseAt: sql`NOW()`,
              patientResponseNotes: dto.notes || null,
              version: proposal.version + 1,
              updatedAt: sql`NOW()`,
            })
            .where(eq(appointmentChangeProposals.id, proposal.id));

          // Trigger queue recalculations after commit
          setImmediate(async () => {
            try {
              await this.queuePositionRecalculationService.recalculateDoctorQueue(
                {
                  serviceDate: originalDate,
                  practitionerId: originalDoctorId,
                },
              );
              await this.queuePositionRecalculationService.recalculateDoctorQueue(
                {
                  serviceDate: proposal.proposedDate!,
                  practitionerId: targetDoctorId,
                },
              );
            } catch (err: any) {
              this.logger.warn(
                `Queue recalculation after reschedule accept failed: ${err.message}`,
              );
            }
          });
        } else if (proposal.proposalType === 'cancellation') {
          // Commit cancellation
          await tx
            .update(appointments)
            .set({
              status: DB_APPOINTMENT_STATUS.CANCELLED,
              cancelledAt: sql`NOW()`,
              cancelReason: `Pembatalan atas persetujuan pasien: ${proposal.reason || 'Klinik mengajukan pembatalan'}. ${dto.notes || ''}`.trim(),
              updatedAt: sql`NOW()`,
            })
            .where(eq(appointments.id, apt.id));

          // Release queue ticket
          await tx
            .update(queueTickets)
            .set({
              status: QUEUE_TICKET_STATUS.CANCELLED,
              waitingPosition: null,
              updatedAt: sql`NOW()`,
            })
            .where(eq(queueTickets.appointmentId, apt.id));

          // Audit record
          await tx.insert(appointmentStatusEvents).values({
            appointmentId: apt.id,
            previousStatus: apt.status,
            newStatus: DB_APPOINTMENT_STATUS.CANCELLED,
            changedBy: user?.id || null,
            reason: `Pasien menyetujui pembatalan janji temu. ${dto.notes || ''}`.trim(),
          });

          // Mark proposal accepted
          await tx
            .update(appointmentChangeProposals)
            .set({
              status: 'accepted',
              patientResponseAt: sql`NOW()`,
              patientResponseNotes: dto.notes || null,
              version: proposal.version + 1,
              updatedAt: sql`NOW()`,
            })
            .where(eq(appointmentChangeProposals.id, proposal.id));

          // Recalculate original doctor queue
          setImmediate(async () => {
            try {
              await this.queuePositionRecalculationService.recalculateDoctorQueue(
                {
                  serviceDate: apt.scheduledDate,
                  practitionerId: apt.practitionerId,
                },
              );
            } catch (err: any) {
              this.logger.warn(
                `Queue recalculation after cancellation accept failed: ${err.message}`,
              );
            }
          });
        }
      } else {
        // Declined: preserve original confirmed schedule intact!
        await tx
          .update(appointmentChangeProposals)
          .set({
            status: 'declined',
            patientResponseAt: sql`NOW()`,
            patientResponseNotes: dto.notes || null,
            version: proposal.version + 1,
            updatedAt: sql`NOW()`,
          })
          .where(eq(appointmentChangeProposals.id, proposal.id));

        // Audit record of refusal
        await tx.insert(appointmentStatusEvents).values({
          appointmentId: apt.id,
          previousStatus: apt.status,
          newStatus: apt.status,
          changedBy: user?.id || null,
          reason: `Pasien MENOLAK pengajuan ${proposal.proposalType}. Jadwal asli ${apt.scheduledDate} dipertahankan. ${dto.notes || ''}`.trim(),
        });
      }

      // Invalidate caches
      if (this.redisService) {
        await Promise.allSettled([
          this.redisService.deleteByPrefix('queue:'),
          this.redisService.deleteByPrefix('appointments:'),
        ]);
      }

      // Targeted resolution event via Socket.IO
      if (this.realtimeGateway) {
        const payload = {
          proposalId: proposal.id,
          appointmentId: apt.id,
          decision: dto.decision,
          proposalType: proposal.proposalType,
          patientUserId: proposal.patientUserId,
          timestamp: nowIso,
        };

        if (proposal.patientUserId) {
          await this.realtimeGateway.emitToUser(
            proposal.patientUserId,
            'appointment:proposal_resolved',
            payload,
          );
        }
        await this.realtimeGateway.emitToRoom?.(
          REALTIME_ROOMS.clinic,
          'appointment:proposal_resolved',
          payload,
        );
      }

      // Dispatch in-app notification & toast to clinic admins/staff
      if (this.recipientResolver && this.notificationRepo) {
        try {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              apt.practitionerId,
            );

          if (clinicUserIds.length > 0) {
            const isAccepted = dto.decision === 'accepted';
            const isReschedule = proposal.proposalType === 'reschedule';

            const title = isAccepted
              ? isReschedule
                ? 'Pasien Menyetujui Jadwal Baru'
                : 'Pasien Menyetujui Pembatalan'
              : isReschedule
                ? 'Pasien Menolak Usulan Jadwal Baru'
                : 'Pasien Menolak Usulan Pembatalan';

            const body = `${apt.patientName || 'Pasien'} telah ${
              isAccepted ? 'menyetujui' : 'menolak'
            } pengajuan ${
              isReschedule
                ? `perubahan jadwal (${apt.bookingCode}) ke tanggal ${proposal.proposedDate}`
                : `pembatalan janji temu (${apt.bookingCode})`
            }.${dto.notes ? ` Catatan: "${dto.notes}"` : ''}`;

            const badgeIcon = isReschedule
              ? 'calendar'
              : isAccepted
                ? 'check-circle'
                : 'alert-circle';

            const notif = await this.notificationRepo.createIfNotExists({
              category: 'appointment',
              audience: NOTIFICATION_AUDIENCE.INTERNAL,
              title,
              body,
              recipientUserIds: clinicUserIds,
              badgeIcon,
              visualKey: apt.avatarUrl || null,
              senderName: apt.patientName || 'Pasien',
              senderRole: 'Pasien',
              actions: [
                {
                  label: 'Lihat Antrean',
                  actionKey: 'view_appointment',
                  actionType: 'primary',
                  url: '/admin/appointment-pasien',
                },
              ],
              metadata: {
                appointmentId: apt.id,
                proposalId: proposal.id,
                proposalType: proposal.proposalType,
                decision: dto.decision,
                patientUserId: proposal.patientUserId,
                patientName: apt.patientName,
                avatarUrl: apt.avatarUrl,
              },
            });

            if (this.realtimeGateway) {
              const envelope = {
                id: notif?.id || `notif-${Date.now()}`,
                type: 'appointment:proposal_resolved',
                title,
                body,
                category: 'appointment',
                audience: NOTIFICATION_AUDIENCE.INTERNAL,
                badgeIcon,
                visualKey: apt.avatarUrl || null,
                senderName: apt.patientName || 'Pasien',
                senderRole: 'Pasien',
                presentation: {
                  toast: true,
                },
                actions: [
                  {
                    label: 'Lihat Antrean',
                    actionKey: 'view_appointment',
                    actionType: 'primary',
                    url: '/admin/appointment-pasien',
                  },
                ],
                metadata: {
                  appointmentId: apt.id,
                  proposalId: proposal.id,
                  proposalType: proposal.proposalType,
                  decision: dto.decision,
                  patientUserId: proposal.patientUserId,
                  patientName: apt.patientName,
                  avatarUrl: apt.avatarUrl,
                },
                createdAt: nowIso,
              };

              for (const staffId of clinicUserIds) {
                await this.realtimeGateway.emitToUser(
                  staffId,
                  REALTIME_EVENTS.NOTIFICATION_NEW,
                  envelope,
                );
              }
              await this.realtimeGateway.emitToRoom?.(
                REALTIME_ROOMS.clinic,
                REALTIME_EVENTS.NOTIFICATION_NEW,
                envelope,
              );
            }
          }
        } catch (notifErr: any) {
          this.logger.warn(
            `Failed to dispatch clinic notification on proposal resolution: ${notifErr.message}`,
          );
        }
      }

      return {
        success: true,
        proposalId: proposal.id,
        appointmentId: apt.id,
        proposalType: proposal.proposalType,
        decision: dto.decision,
        message:
          dto.decision === 'accepted'
            ? 'Persetujuan Anda telah berhasil diproses. Jadwal janji temu telah diperbarui.'
            : 'Penolakan Anda telah dicatat. Jadwal janji temu awal Anda tetap sah dan berlaku.',
      };
    });
  }

  /**
   * Withdraws any active pending proposal for an appointment upon operational recovery.
   */
  async withdrawObsoleteProposals(appointmentId: string, reason: string) {
    const pendingProposals = await this.db
      .select({ id: appointmentChangeProposals.id })
      .from(appointmentChangeProposals)
      .where(
        and(
          eq(appointmentChangeProposals.appointmentId, appointmentId),
          eq(appointmentChangeProposals.status, 'pending'),
        ),
      );

    if (pendingProposals.length === 0) {
      return 0;
    }

    const ids = pendingProposals.map((p) => p.id);
    await this.db
      .update(appointmentChangeProposals)
      .set({
        status: 'withdrawn',
        patientResponseNotes: `Ditarik otomatis oleh sistem: ${reason}`,
        updatedAt: sql`NOW()`,
      })
      .where(inArray(appointmentChangeProposals.id, ids));

    this.logger.log(
      `Withdrew ${ids.length} obsolete proposals for appointment ${appointmentId} due to operational recovery: ${reason}`,
    );

    if (this.realtimeGateway?.server) {
      for (const id of ids) {
        this.realtimeGateway.server.emit('appointment:proposal_withdrawn', {
          proposalId: id,
          appointmentId,
          reason,
        });
      }
    }

    return ids.length;
  }

  /**
   * Sweeps pending proposals that have crossed expiration buffer.
   * Invoked by background Cron scheduler.
   */
  async sweepExpiredProposals(): Promise<number> {
    const leadMinutes = await this.clinicConfigService
      .getNumber('proposal.expiration_lead_minutes')
      .catch(() => 60);
    const fallbackWindowHours = await this.clinicConfigService
      .getNumber('proposal.fallback_window_hours')
      .catch(() => 24);
    const now = new Date();

    // Query pending proposals with original session times
    const pendingRows = await this.db
      .select({
        proposalId: appointmentChangeProposals.id,
        appointmentId: appointmentChangeProposals.appointmentId,
        originalDate: appointmentChangeProposals.originalDate,
        createdAt: appointmentChangeProposals.createdAt,
        defaultStartsAt: sessionDefs.defaultStartsAt,
      })
      .from(appointmentChangeProposals)
      .leftJoin(
        sessionDefs,
        eq(sessionDefs.id, appointmentChangeProposals.originalSessionId),
      )
      .where(eq(appointmentChangeProposals.status, 'pending'));

    const expiredIds: string[] = [];
    for (const row of pendingRows) {
      const expiresAt = calculateProposalExpiresAt({
        createdAt: row.createdAt,
        originalDate: row.originalDate,
        defaultStartsAt: row.defaultStartsAt,
        leadMinutes,
        fallbackWindowHours,
      });

      if (now >= expiresAt) {
        expiredIds.push(row.proposalId);
      }
    }

    if (expiredIds.length > 0) {
      await this.db
        .update(appointmentChangeProposals)
        .set({
          status: 'expired',
          patientResponseNotes: 'Kedaluwarsa otomatis: Melewati batas waktu respon.',
          updatedAt: sql`NOW()`,
        })
        .where(inArray(appointmentChangeProposals.id, expiredIds));

      this.logger.log(
        `Swept ${expiredIds.length} expired appointment change proposals (lead: ${leadMinutes}m, fallback: ${fallbackWindowHours}h).`,
      );

      if (this.realtimeGateway?.server) {
        for (const id of expiredIds) {
          this.realtimeGateway.server.emit('appointment:proposal_expired', {
            proposalId: id,
          });
        }
      }
    }

    return expiredIds.length;
  }

  /**
   * Retrieves pending proposals for a given patient.
   */
  async getMyPendingProposals(userId: string) {
    const leadMinutes = await this.clinicConfigService
      .getNumber('proposal.expiration_lead_minutes')
      .catch(() => 60);
    const fallbackWindowHours = await this.clinicConfigService
      .getNumber('proposal.fallback_window_hours')
      .catch(() => 24);
    const now = new Date();

    const rows = await this.db
      .selectDistinct({
        id: appointmentChangeProposals.id,
        appointmentId: appointmentChangeProposals.appointmentId,
        patientId: appointments.patientId,
        poliklinikId: serviceCategories.unitId,
        serviceId: appointments.serviceId,
        originalSessionId: appointmentChangeProposals.originalSessionId,
        proposalType: appointmentChangeProposals.proposalType,
        status: appointmentChangeProposals.status,
        reason: appointmentChangeProposals.reason,
        originalDate: appointmentChangeProposals.originalDate,
        proposedDate: appointmentChangeProposals.proposedDate,
        estimatedQueueNumber:
          appointmentChangeProposals.estimatedQueueNumber,
        bookingCode: appointments.bookingCode,
        patientName: patientProfiles.fullName,
        serviceName: clinicServices.name,
        createdAt: appointmentChangeProposals.createdAt,
        defaultStartsAt: sessionDefs.defaultStartsAt,
      })
      .from(appointmentChangeProposals)
      .innerJoin(
        appointments,
        eq(appointments.id, appointmentChangeProposals.appointmentId),
      )
      .leftJoin(
        sessionDefs,
        eq(sessionDefs.id, appointmentChangeProposals.originalSessionId),
      )
      .leftJoin(
        clinicServices,
        eq(clinicServices.id, appointments.serviceId),
      )
      .leftJoin(
        serviceCategories,
        eq(serviceCategories.id, clinicServices.serviceCategoryId),
      )
      .leftJoin(
        patientProfiles,
        eq(patientProfiles.id, appointments.patientId),
      )
      .leftJoin(
        patientAffiliations,
        eq(patientAffiliations.patientId, appointments.patientId),
      )
      .where(
        and(
          eq(appointmentChangeProposals.status, 'pending'),
          or(
            eq(appointmentChangeProposals.patientUserId, userId),
            eq(appointments.createdBy, userId),
            eq(patientAffiliations.userId, userId),
          ),
        ),
      )
      .orderBy(desc(appointmentChangeProposals.createdAt));

    const activeProposals: Array<{
      id: string;
      appointmentId: string;
      patientId?: string;
      poliklinikId?: string | null;
      serviceId?: string;
      originalSessionId?: string | null;
      proposalType: string;
      status: string;
      reason: string | null;
      originalDate: string;
      proposedDate: string | null;
      estimatedQueueNumber: number | null;
      bookingCode: string;
      patientName: string | null;
      serviceName: string | null;
      createdAt: string;
      expiresAt: string;
    }> = [];
    const expiredIds: string[] = [];

    for (const r of rows) {
      const expiresAt = calculateProposalExpiresAt({
        createdAt: r.createdAt,
        originalDate: r.originalDate,
        defaultStartsAt: r.defaultStartsAt,
        leadMinutes,
        fallbackWindowHours,
      });

      if (now >= expiresAt) {
        expiredIds.push(r.id);
      } else {
        activeProposals.push({
          id: r.id,
          appointmentId: r.appointmentId,
          patientId: r.patientId,
          poliklinikId: r.poliklinikId,
          serviceId: r.serviceId,
          originalSessionId: r.originalSessionId,
          proposalType: r.proposalType,
          status: r.status,
          reason: r.reason,
          originalDate: r.originalDate,
          proposedDate: r.proposedDate,
          estimatedQueueNumber: r.estimatedQueueNumber,
          bookingCode: r.bookingCode,
          patientName: r.patientName,
          serviceName: r.serviceName,
          createdAt: r.createdAt,
          expiresAt: expiresAt.toISOString(),
        });
      }
    }

    if (expiredIds.length > 0) {
      setImmediate(async () => {
        try {
          await this.db
            .update(appointmentChangeProposals)
            .set({
              status: 'expired',
              patientResponseNotes:
                'Kedaluwarsa otomatis (terdeteksi saat query).',
              updatedAt: sql`NOW()`,
            })
            .where(inArray(appointmentChangeProposals.id, expiredIds));
        } catch (e: any) {
          this.logger.warn(`Lazy proposal sweep failed: ${e.message}`);
        }
      });
    }

    return activeProposals;
  }

  /**
   * Retrieves all proposals for clinic administration monitoring.
   */
  async getAdminProposals(query?: { status?: string; date?: string }) {
    const leadMinutes = await this.clinicConfigService
      .getNumber('proposal.expiration_lead_minutes')
      .catch(() => 60);
    const fallbackWindowHours = await this.clinicConfigService
      .getNumber('proposal.fallback_window_hours')
      .catch(() => 24);

    const conditions = [];
    if (query?.status) {
      conditions.push(eq(appointmentChangeProposals.status, query.status));
    }
    if (query?.date) {
      conditions.push(
        eq(appointmentChangeProposals.originalDate, query.date),
      );
    }

    const rows = await this.db
      .select({
        id: appointmentChangeProposals.id,
        appointmentId: appointmentChangeProposals.appointmentId,
        proposalType: appointmentChangeProposals.proposalType,
        status: appointmentChangeProposals.status,
        reason: appointmentChangeProposals.reason,
        originalDate: appointmentChangeProposals.originalDate,
        proposedDate: appointmentChangeProposals.proposedDate,
        estimatedQueueNumber:
          appointmentChangeProposals.estimatedQueueNumber,
        bookingCode: appointments.bookingCode,
        patientName: patientProfiles.fullName,
        patientPhone: patientProfiles.phone,
        serviceName: clinicServices.name,
        createdAt: appointmentChangeProposals.createdAt,
        patientResponseAt: appointmentChangeProposals.patientResponseAt,
        patientResponseNotes:
          appointmentChangeProposals.patientResponseNotes,
        defaultStartsAt: sessionDefs.defaultStartsAt,
      })
      .from(appointmentChangeProposals)
      .innerJoin(
        appointments,
        eq(appointments.id, appointmentChangeProposals.appointmentId),
      )
      .leftJoin(
        sessionDefs,
        eq(sessionDefs.id, appointmentChangeProposals.originalSessionId),
      )
      .leftJoin(
        clinicServices,
        eq(clinicServices.id, appointments.serviceId),
      )
      .innerJoin(
        patientProfiles,
        eq(patientProfiles.id, appointments.patientId),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(appointmentChangeProposals.createdAt))
      .limit(100);

    return rows.map((r) => ({
      ...r,
      expiresAt: calculateProposalExpiresAt({
        createdAt: r.createdAt,
        originalDate: r.originalDate,
        defaultStartsAt: r.defaultStartsAt,
        leadMinutes,
        fallbackWindowHours,
      }).toISOString(),
    }));
  }

  private async verifyPatientAccess(
    tx: any,
    appointmentId: string,
    user: AuthenticatedUser,
  ): Promise<boolean> {
    const [apt] = await tx
      .select({
        patientId: appointments.patientId,
        appointmentCreatedBy: appointments.createdBy,
        profileUserId: patientProfiles.userId,
        affiliationUserId: patientAffiliations.userId,
      })
      .from(appointments)
      .leftJoin(
        patientProfiles,
        eq(patientProfiles.id, appointments.patientId),
      )
      .leftJoin(
        patientAffiliations,
        eq(patientAffiliations.patientId, appointments.patientId),
      )
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    if (!apt) return false;
    return (
      apt.profileUserId === user.id ||
      apt.affiliationUserId === user.id ||
      apt.appointmentCreatedBy === user.id ||
      (user.patient?.id != null && apt.patientId === user.patient.id)
    );
  }
}
