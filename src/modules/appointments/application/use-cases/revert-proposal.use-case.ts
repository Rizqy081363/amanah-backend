import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { NOTIFICATION_AUDIENCE } from '../../../../common/constants/notification-audience.constants';
import { RedisService } from '../../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointmentChangeProposals,
  appointments,
  appointmentStatusEvents,
  clinicServices,
  patientProfiles,
  queueTickets,
  sessionDefs,
} from '../../../../database/schema';
import { QueuePositionRecalculationService } from '../../../queue-engine/application/services/queue-position-recalculation.service';
import { NotificationRepository } from '../../../notifications/domain/repositories/notification.repository';
import { SocketIoRealtimeGateway } from '../../../notifications/infrastructure/realtime/socket-io-realtime.gateway';
import {
  NOTIFICATION_REPOSITORY,
  REALTIME_EVENTS,
  REALTIME_GATEWAY_PORT,
  REALTIME_ROOMS,
} from '../../../notifications/notifications.constants';
import {
  DB_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/appointment-lifecycle.constants';
import type { AuthenticatedUser } from '../../../../common/auth/authenticated-user.interface';
import type { BulkProposalResult } from '../services/appointment-proposal.service';

@Injectable()
export class RevertProposalUseCase {
  private readonly logger = new Logger(RevertProposalUseCase.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly queuePositionRecalculationService: QueuePositionRecalculationService,
    @Optional()
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo?: NotificationRepository,
    @Optional()
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
    @Optional()
    private readonly redisService?: RedisService,
  ) {}

  async execute(
    appointmentId: string,
    reason?: string,
    user?: AuthenticatedUser,
  ) {
    return this.db.transaction(async (tx) => {
      // 1. Lock and load appointment with patient details
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
        .where(eq(appointments.id, appointmentId))
        .limit(1);

      if (!apt) {
        throw new NotFoundException(
          `Janji temu terkait dengan ID ${appointmentId} tidak ditemukan.`,
        );
      }

      // 2. Lock and load latest accepted proposal for this appointment
      const [proposal] = await tx
        .select()
        .from(appointmentChangeProposals)
        .where(
          and(
            eq(appointmentChangeProposals.appointmentId, appointmentId),
            eq(appointmentChangeProposals.status, 'accepted'),
          ),
        )
        .orderBy(desc(appointmentChangeProposals.patientResponseAt))
        .limit(1)
        .for('update');

      if (!proposal) {
        throw new BadRequestException(
          `Tidak ditemukan persetujuan usulan aktif yang dapat dibatalkan (revert) untuk janji temu ID ${appointmentId}.`,
        );
      }

      const now = new Date();
      const nowIso = now.toISOString();

      // 3. Revert based on proposalType
      if (proposal.proposalType === 'cancellation') {
        // Re-activate queue ticket first (consistent lock order: queueTickets -> appointments)
        const [currentTicket] = await tx
          .select({
            id: queueTickets.id,
            queueNumber: queueTickets.queueNumber,
            queueDate: queueTickets.queueDate,
            sessionId: queueTickets.sessionId,
            doctorId: queueTickets.doctorId,
            categoryId: queueTickets.categoryId,
            serviceId: queueTickets.serviceId,
          })
          .from(queueTickets)
          .where(eq(queueTickets.appointmentId, apt.id))
          .limit(1);

        let finalTicketNumber = currentTicket?.queueNumber;
        if (currentTicket) {
          const ticketScopeCondition = currentTicket.doctorId
            ? eq(queueTickets.doctorId, currentTicket.doctorId)
            : and(
                isNull(queueTickets.doctorId),
                currentTicket.categoryId
                  ? eq(queueTickets.categoryId, currentTicket.categoryId)
                  : eq(queueTickets.serviceId, currentTicket.serviceId),
              );

          const existingTickets = await tx
            .select({ queueNumber: queueTickets.queueNumber })
            .from(queueTickets)
            .where(
              and(
                ticketScopeCondition,
                eq(queueTickets.queueDate, currentTicket.queueDate),
                sql`${queueTickets.id} != ${currentTicket.id}`,
                inArray(queueTickets.status, [
                  QUEUE_TICKET_STATUS.WAITING,
                  QUEUE_TICKET_STATUS.CALLED,
                  QUEUE_TICKET_STATUS.IN_SERVICE,
                ]),
              ),
            );

          const usedNumbers = new Set(existingTickets.map((t) => t.queueNumber));
          if (usedNumbers.has(finalTicketNumber)) {
            const [service] = await tx
              .select({ codePrefix: clinicServices.codePrefix })
              .from(clinicServices)
              .where(eq(clinicServices.id, currentTicket.serviceId))
              .limit(1);

            let sessionPrefix = '';
            if (currentTicket.sessionId) {
              const [s] = await tx
                .select({ codePrefix: sessionDefs.codePrefix })
                .from(sessionDefs)
                .where(eq(sessionDefs.id, currentTicket.sessionId))
                .limit(1);
              if (s?.codePrefix) {
                sessionPrefix = s.codePrefix;
              }
            }

            const servicePrefix = service?.codePrefix || '';
            const ticketPrefix = sessionPrefix
              ? `${servicePrefix}-${sessionPrefix}`
              : servicePrefix;

            let idx = (existingTickets.length || 0) + 1;
            finalTicketNumber = `${ticketPrefix}${String(idx).padStart(3, '0')}`;
            while (usedNumbers.has(finalTicketNumber)) {
              idx++;
              finalTicketNumber = `${ticketPrefix}${String(idx).padStart(3, '0')}`;
            }
          }
        }

        await tx
          .update(queueTickets)
          .set({
            status: QUEUE_TICKET_STATUS.WAITING,
            ...(finalTicketNumber ? { queueNumber: finalTicketNumber } : {}),
            updatedAt: sql`NOW()`,
          })
          .where(eq(queueTickets.appointmentId, apt.id));

        // Revert cancellation: restore appointment to booked status
        await tx
          .update(appointments)
          .set({
            status: DB_APPOINTMENT_STATUS.BOOKED,
            cancelledAt: null,
            cancelReason: null,
            updatedAt: sql`NOW()`,
          })
          .where(eq(appointments.id, apt.id));

        // Audit status event
        await tx.insert(appointmentStatusEvents).values({
          appointmentId: apt.id,
          previousStatus: apt.status,
          newStatus: DB_APPOINTMENT_STATUS.BOOKED,
          changedBy: user?.id || null,
          reason: `Admin membatalkan settlement pembatalan (Revert). ${reason || ''}`.trim(),
        });
      } else if (proposal.proposalType === 'reschedule') {
        // Revert reschedule: restore to original date and session
        let originalStartTime: string | null = null;
        let originalEndTime: string | null = null;
        let sessionPrefix = '';

        if (proposal.originalSessionId) {
          const [origSession] = await tx
            .select({
              codePrefix: sessionDefs.codePrefix,
              defaultStartsAt: sessionDefs.defaultStartsAt,
              defaultEndsAt: sessionDefs.defaultEndsAt,
            })
            .from(sessionDefs)
            .where(eq(sessionDefs.id, proposal.originalSessionId))
            .limit(1);

          if (origSession) {
            sessionPrefix = origSession.codePrefix;
            originalStartTime = origSession.defaultStartsAt;
            originalEndTime = origSession.defaultEndsAt;
          }
        }

        // Canonical ticket resolution on originalDate (matching appointment-reschedule.handler.ts)
        const [service] = await tx
          .select({
            codePrefix: clinicServices.codePrefix,
            serviceCategoryId: clinicServices.serviceCategoryId,
          })
          .from(clinicServices)
          .where(eq(clinicServices.id, apt.serviceId))
          .limit(1);

        const categoryPrefix = service?.codePrefix || '';
        const categoryId = service?.serviceCategoryId || null;

        let activeCountRow: { count: number } | undefined;
        if (apt.practitionerId) {
          [activeCountRow] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(appointments)
            .where(
              and(
                eq(appointments.scheduledDate, proposal.originalDate),
                eq(appointments.practitionerId, apt.practitionerId),
                sql`${appointments.id} != ${apt.id}`,
                inArray(appointments.status, [
                  DB_APPOINTMENT_STATUS.BOOKED,
                  DB_APPOINTMENT_STATUS.WAITING,
                  DB_APPOINTMENT_STATUS.IN_SERVICE,
                ]),
              ),
            );
        } else {
          [activeCountRow] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(appointments)
            .innerJoin(
              clinicServices,
              eq(appointments.serviceId, clinicServices.id),
            )
            .where(
              and(
                eq(appointments.scheduledDate, proposal.originalDate),
                isNull(appointments.practitionerId),
                categoryId
                  ? eq(clinicServices.serviceCategoryId, categoryId)
                  : eq(appointments.serviceId, apt.serviceId),
                sql`${appointments.id} != ${apt.id}`,
                inArray(appointments.status, [
                  DB_APPOINTMENT_STATUS.BOOKED,
                  DB_APPOINTMENT_STATUS.WAITING,
                  DB_APPOINTMENT_STATUS.IN_SERVICE,
                ]),
              ),
            );
        }

        const numericQueueNumber = (activeCountRow?.count || 0) + 1;

        const ticketScopeCondition = apt.practitionerId
          ? eq(queueTickets.doctorId, apt.practitionerId)
          : and(
              isNull(queueTickets.doctorId),
              categoryId
                ? eq(queueTickets.categoryId, categoryId)
                : eq(queueTickets.serviceId, apt.serviceId),
            );

        const existingTickets = await tx
          .select({ queueNumber: queueTickets.queueNumber })
          .from(queueTickets)
          .where(
            and(
              ticketScopeCondition,
              eq(queueTickets.queueDate, proposal.originalDate),
              sql`${queueTickets.appointmentId} != ${apt.id}`,
              inArray(queueTickets.status, [
                QUEUE_TICKET_STATUS.WAITING,
                QUEUE_TICKET_STATUS.CALLED,
                QUEUE_TICKET_STATUS.IN_SERVICE,
              ]),
            ),
          );

        const usedNumbers = new Set(existingTickets.map((t) => t.queueNumber));
        let ticketIndex = numericQueueNumber;
        let formattedTicketNumber = `${categoryPrefix}-${sessionPrefix}${String(ticketIndex).padStart(3, '0')}`;
        while (usedNumbers.has(formattedTicketNumber)) {
          ticketIndex++;
          formattedTicketNumber = `${categoryPrefix}-${sessionPrefix}${String(ticketIndex).padStart(3, '0')}`;
        }

        // Find previous status before reschedule acceptance
        const [lastEvent] = await tx
          .select({ previousStatus: appointmentStatusEvents.previousStatus })
          .from(appointmentStatusEvents)
          .where(
            and(
              eq(appointmentStatusEvents.appointmentId, apt.id),
              eq(appointmentStatusEvents.newStatus, DB_APPOINTMENT_STATUS.BOOKED),
            ),
          )
          .orderBy(desc(appointmentStatusEvents.createdAt))
          .limit(1);

        const restoredStatus =
          lastEvent?.previousStatus || DB_APPOINTMENT_STATUS.BOOKED;
        const restoredTicketStatus =
          restoredStatus === DB_APPOINTMENT_STATUS.NO_SHOW
            ? QUEUE_TICKET_STATUS.SKIPPED
            : QUEUE_TICKET_STATUS.WAITING;

        // Revert reschedule: update queue ticket first (consistent lock order: queueTickets -> appointments)
        await tx
          .update(queueTickets)
          .set({
            queueDate: proposal.originalDate,
            sessionId: proposal.originalSessionId || null,
            queueNumber: formattedTicketNumber,
            waitingPosition: numericQueueNumber,
            status: restoredTicketStatus,
            updatedAt: sql`NOW()`,
          })
          .where(eq(queueTickets.appointmentId, apt.id));

        // Restore appointment scheduled date and queue number
        await tx
          .update(appointments)
          .set({
            status: restoredStatus,
            scheduledDate: proposal.originalDate,
            queueNumber: numericQueueNumber,
            ...(originalStartTime ? { scheduledStartTime: originalStartTime } : {}),
            ...(originalEndTime ? { scheduledEndTime: originalEndTime } : {}),
            updatedAt: sql`NOW()`,
          })
          .where(eq(appointments.id, apt.id));

        await tx.insert(appointmentStatusEvents).values({
          appointmentId: apt.id,
          previousStatus: apt.status,
          newStatus: restoredStatus,
          changedBy: user?.id || null,
          reason: `Admin membatalkan settlement reschedule (Revert ke tanggal asal ${proposal.originalDate}). ${reason || ''}`.trim(),
        });
      }

      // 4. Mark proposal withdrawn (withdrawn is officially valid in CHECK constraint)
      await tx
        .update(appointmentChangeProposals)
        .set({
          status: 'withdrawn',
          patientResponseNotes: `Dibatalkan oleh admin (Revert). ${reason || ''}`.trim(),
          version: proposal.version + 1,
          updatedAt: sql`NOW()`,
        })
        .where(eq(appointmentChangeProposals.id, proposal.id));

      // 5. Invalidate caches
      if (this.redisService) {
        await Promise.allSettled([
          this.redisService.deleteByPrefix('queue:'),
          this.redisService.deleteByPrefix('appointments:'),
        ]);
      }

      // 6. Recalculate queue positions
      setImmediate(async () => {
        try {
          await this.queuePositionRecalculationService.recalculateDoctorQueue({
            serviceDate: proposal.originalDate,
            practitionerId: apt.practitionerId,
          });
          if (proposal.proposedDate) {
            await this.queuePositionRecalculationService.recalculateDoctorQueue({
              serviceDate: proposal.proposedDate,
              practitionerId: apt.practitionerId,
            });
          }
        } catch (err: any) {
          this.logger.warn(`Queue recalculation after revert failed: ${err.message}`);
        }
      });

      // 7. Dispatch Notification to Patient
      if (this.notificationRepo && proposal.patientUserId) {
        try {
          const notifTitle = 'Pembaruan Janji Temu (Revert)';
          const notifBody =
            proposal.proposalType === 'reschedule'
              ? `Klinik membatalkan perubahan jadwal janji temu (${apt.bookingCode}). Jadwal Anda dikembalikan ke tanggal semula: ${proposal.originalDate}.${reason ? ` Alasan: ${reason}` : ''}`
              : `Klinik mengaktifkan kembali janji temu (${apt.bookingCode}). Pembatalan sebelumnya telah dibatalkan.${reason ? ` Alasan: ${reason}` : ''}`;

          await this.notificationRepo.createIfNotExists({
            category: 'appointment',
            audience: NOTIFICATION_AUDIENCE.EXTERNAL,
            title: notifTitle,
            body: notifBody,
            recipientUserIds: [proposal.patientUserId],
            badgeIcon: 'calendar',
            visualKey: apt.avatarUrl || null,
            senderName: 'Admin Klinik',
            senderRole: 'Klinik Amanah',
            actions: [
              {
                label: 'Lihat Antrean',
                actionKey: 'view_appointment',
                actionType: 'primary',
                url: '/klinik/antrean',
              },
            ],
            metadata: {
              appointmentId: apt.id,
              proposalId: proposal.id,
              action: 'revert',
              proposalType: proposal.proposalType,
            },
          });

          if (this.realtimeGateway) {
            const envelope = {
              id: `notif-${Date.now()}`,
              type: 'appointment:proposal_resolved',
              title: notifTitle,
              body: notifBody,
              category: 'appointment',
              audience: NOTIFICATION_AUDIENCE.EXTERNAL,
              badgeIcon: 'calendar',
              visualKey: apt.avatarUrl || null,
              senderName: 'Admin Klinik',
              senderRole: 'Klinik Amanah',
              presentation: { toast: true },
              createdAt: nowIso,
              actions: [
                {
                  label: 'Lihat Antrean',
                  actionKey: 'view_appointment',
                  actionType: 'primary',
                  url: '/klinik/antrean',
                },
              ],
              metadata: {
                appointmentId: apt.id,
                proposalId: proposal.id,
                action: 'revert',
              },
            };

            await this.realtimeGateway.emitToUser(
              proposal.patientUserId,
              REALTIME_EVENTS.NOTIFICATION_NEW,
              envelope,
            );
          }
        } catch (notifErr: any) {
          this.logger.warn(`Failed to dispatch patient notification on revert: ${notifErr.message}`);
        }
      }

      // 8. Targeted resolution event to clinic room & patient
      if (this.realtimeGateway) {
        const payload = {
          proposalId: proposal.id,
          appointmentId: apt.id,
          action: 'revert',
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

      return {
        success: true,
        appointmentId: apt.id,
        proposalId: proposal.id,
        proposalType: proposal.proposalType,
        message:
          proposal.proposalType === 'reschedule'
            ? `Persetujuan perubahan jadwal berhasil dibatalkan. Janji temu dikembalikan ke ${proposal.originalDate}.`
            : 'Persetujuan pembatalan berhasil dibatalkan. Janji temu telah diaktifkan kembali.',
      };
    });
  }

  async executeBulk(
    appointmentIds: string[],
    reason?: string,
    user?: AuthenticatedUser,
  ): Promise<BulkProposalResult> {
    const succeededIds: string[] = [];
    const errors: Array<{ id: string; message: string }> = [];

    for (const id of appointmentIds) {
      try {
        await this.execute(id, reason, user);
        succeededIds.push(id);
      } catch (err: any) {
        errors.push({ id, message: err.message || 'Gagal membatalkan persetujuan' });
      }
    }

    return {
      total: appointmentIds.length,
      succeededCount: succeededIds.length,
      failedCount: errors.length,
      succeededIds,
      errors,
    };
  }
}
