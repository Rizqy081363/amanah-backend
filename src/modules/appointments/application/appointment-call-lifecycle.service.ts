import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import {
  DomainEvent,
  NotificationPublisher,
} from '../../notifications/contracts/domain-event.interface';
import { NOTIFICATION_PUBLISHER } from '../../notifications/notifications.constants';
import {
  APPOINTMENT_CALL_REPOSITORY,
  APPOINTMENT_CALL_STATUS,
  APPOINTMENT_EVENTS,
  DB_APPOINTMENT_STATUS,
  MAX_PATIENT_CALL_ATTEMPTS,
  QUEUE_TICKET_STATUS,
  TERMINAL_APPOINTMENT_STATUSES,
} from '../domain/constants/appointment-lifecycle.constants';
import { AppointmentCallRepository } from '../domain/repositories/appointment-call.repository';
import {
  PUSH_NOTIFICATION_PORT,
  type PushNotificationPort,
} from './ports/push-notification.port';

@Injectable()
export class AppointmentCallLifecycleService {
  private readonly logger = new Logger(AppointmentCallLifecycleService.name);

  constructor(
    @Inject(APPOINTMENT_CALL_REPOSITORY)
    private readonly callRepo: AppointmentCallRepository,
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly publisher: NotificationPublisher,
    @Optional()
    @Inject(PUSH_NOTIFICATION_PORT)
    private readonly pushNotification?: PushNotificationPort,
    @Optional()
    private readonly redisService?: RedisService,
  ) {}

  private async invalidateQueueCache(): Promise<void> {
    if (!this.redisService) return;
    await Promise.allSettled([
      this.redisService.deleteByPrefix('queue:daily'),
      this.redisService.deleteByPrefix('queue:display'),
      this.redisService.invalidateTags('queue', 'daily', 'display'),
    ]);
  }

  async callPatient(
    appointmentId: string,
    calledByUserId: string,
    notes?: string,
  ): Promise<{
    attemptNumber: number;
    maxAttempts: number;
    status: string;
  }> {
    const details =
      await this.callRepo.getAppointmentWithDetails(appointmentId);
    if (!details) {
      throw new NotFoundException('Janji temu tidak ditemukan.');
    }

    const nonCallableStatuses = [
      ...TERMINAL_APPOINTMENT_STATUSES,
      DB_APPOINTMENT_STATUS.NO_SHOW,
    ] as readonly string[];
    if (nonCallableStatuses.includes(details.status)) {
      throw new BadRequestException(
        `Janji temu dengan status "${details.status}" tidak dapat dipanggil.`,
      );
    }

    const latestAttempt = await this.callRepo.getLatestAttempt(appointmentId);
    const nextAttemptNumber = (latestAttempt?.attemptNumber ?? 0) + 1;

    if (
      latestAttempt &&
      latestAttempt.status === APPOINTMENT_CALL_STATUS.CALLED
    ) {
      await this.callRepo.updateAttemptStatus(
        latestAttempt.id,
        APPOINTMENT_CALL_STATUS.NO_RESPONSE,
      );
    }

    await this.callRepo.recordCallAttempt({
      appointmentId,
      queueTicketId: details.ticketId,
      attemptNumber: nextAttemptNumber,
      status: APPOINTMENT_CALL_STATUS.CALLED,
      calledBy: calledByUserId,
      notes,
    });

    await this.callRepo.updateAppointmentAndTicketStatus(
      appointmentId,
      details.status,
      details.ticketId,
      QUEUE_TICKET_STATUS.CALLED,
    );

    await this.invalidateQueueCache();

    const event: DomainEvent = {
      eventId: randomUUID(),
      eventType: APPOINTMENT_EVENTS.PATIENT_CALLED,
      version: 1,
      occurredAt: new Date().toISOString(),
      module: 'appointments',
      payload: {
        appointmentId,
        patientUserId: details.patientUserId,
        patientName: details.patientName,
        ticketNumber: details.ticketNumber,
        attemptNumber: nextAttemptNumber,
        maxAttempts: MAX_PATIENT_CALL_ATTEMPTS,
        poliklinikName: details.poliklinikName || '',
        roomName: details.roomName || null,
        doctorName: details.doctorName || null,
        calledBy: calledByUserId,
        notes,
      },
      actor: {
        userId: calledByUserId,
        roleCode: 'staff',
      },
    };

    await this.publisher.publish(event);

    if (this.pushNotification && details.patientUserId) {
      const roomOrPoli = details.roomName || details.poliklinikName || 'Ruang Pemeriksaan';
      const doctorText = details.doctorName ? ` (Dokter: ${details.doctorName})` : '';
      this.pushNotification
        .sendPush({
          userId: details.patientUserId,
          title: 'Giliran Konsultasi Anda',
          body: `Nomor antrean ${details.ticketNumber} (${details.patientName || 'Pasien'}) sedang dipanggil ke ${roomOrPoli}${doctorText}. Silakan segera menuju ruang pemeriksaan.`,
          data: {
            appointmentId,
            queueNumber: String(details.ticketNumber),
            status: 'CALLED',
          },
        })
        .catch((error) => {
          this.logger.warn(
            `Push notification failed on call for patient ${details.patientUserId}: ${error.message}`,
          );
        });
    }

    this.logger.log(
      `Patient called for appointment ${appointmentId} (attempt ${nextAttemptNumber}/${MAX_PATIENT_CALL_ATTEMPTS})`,
    );

    return {
      attemptNumber: nextAttemptNumber,
      maxAttempts: MAX_PATIENT_CALL_ATTEMPTS,
      status: APPOINTMENT_CALL_STATUS.CALLED,
    };
  }

  async patientResponded(
    appointmentId: string,
    calledByUserId: string,
  ): Promise<{ status: string }> {
    const details =
      await this.callRepo.getAppointmentWithDetails(appointmentId);
    if (!details) {
      throw new NotFoundException('Janji temu tidak ditemukan.');
    }

    const latestAttempt = await this.callRepo.getLatestAttempt(appointmentId);
    if (!latestAttempt) {
      throw new BadRequestException(
        'Belum ada panggilan untuk janji temu ini.',
      );
    }

    const now = new Date().toISOString();
    await this.callRepo.updateAttemptStatus(
      latestAttempt.id,
      APPOINTMENT_CALL_STATUS.RESPONDED,
      now,
    );

    await this.callRepo.updateAppointmentAndTicketStatus(
      appointmentId,
      DB_APPOINTMENT_STATUS.IN_SERVICE,
      details.ticketId,
      QUEUE_TICKET_STATUS.IN_SERVICE,
    );

    await this.invalidateQueueCache();

    const event: DomainEvent = {
      eventId: randomUUID(),
      eventType: APPOINTMENT_EVENTS.PATIENT_RESPONDED,
      version: 1,
      occurredAt: now,
      module: 'appointments',
      payload: {
        appointmentId,
        patientUserId: details.patientUserId,
        ticketNumber: details.ticketNumber,
        poliklinikName: details.roomName || details.poliklinikName || 'Poliklinik',
      },
      actor: {
        userId: calledByUserId,
        roleCode: 'staff',
      },
    };

    await this.publisher.publish(event);

    if (this.pushNotification && details.patientUserId) {
      const roomOrPoli = details.roomName || details.poliklinikName || 'Ruang Pemeriksaan';
      this.pushNotification
        .sendPush({
          userId: details.patientUserId,
          title: 'Pemeriksaan Sedang Berlangsung',
          body: `Pasien ${details.patientName || 'Pasien'} (Nomor antrean ${details.ticketNumber}) sedang dalam pemeriksaan di ${roomOrPoli}.`,
          data: {
            appointmentId,
            queueNumber: String(details.ticketNumber),
            status: 'IN_SERVICE',
          },
        })
        .catch((error) => {
          this.logger.warn(
            `Push notification failed on respond for patient ${details.patientUserId}: ${error.message}`,
          );
        });
    }

    return { status: APPOINTMENT_CALL_STATUS.RESPONDED };
  }

  async patientNoShow(
    appointmentId: string,
    calledByUserId: string,
    notes?: string,
  ): Promise<{
    requeued?: boolean;
    noShow?: boolean;
    attemptNumber: number;
    remainingAttempts?: number;
    status: string;
  }> {
    const details =
      await this.callRepo.getAppointmentWithDetails(appointmentId);
    if (!details) {
      throw new NotFoundException('Janji temu tidak ditemukan.');
    }

    const latestAttempt = await this.callRepo.getLatestAttempt(appointmentId);
    if (!latestAttempt) {
      throw new BadRequestException(
        'Belum ada panggilan untuk janji temu ini.',
      );
    }

    await this.callRepo.updateAttemptStatus(
      latestAttempt.id,
      APPOINTMENT_CALL_STATUS.NO_RESPONSE,
    );

    const now = new Date().toISOString();

    if (latestAttempt.attemptNumber < MAX_PATIENT_CALL_ATTEMPTS) {
      // Requeue behind 3 positions
      if (details.ticketId) {
        await this.callRepo.requeueTicket(details.ticketId, 3);
      }

      await this.invalidateQueueCache();

      const event: DomainEvent = {
        eventId: randomUUID(),
        eventType: APPOINTMENT_EVENTS.PATIENT_REQUEUED,
        version: 1,
        occurredAt: now,
        module: 'appointments',
        payload: {
          appointmentId,
          patientUserId: details.patientUserId,
          ticketNumber: details.ticketNumber,
          attemptNumber: latestAttempt.attemptNumber,
          remainingAttempts:
            MAX_PATIENT_CALL_ATTEMPTS - latestAttempt.attemptNumber,
          poliklinikName: details.roomName || details.poliklinikName || 'Poliklinik',
          notes,
        },
        actor: {
          userId: calledByUserId,
          roleCode: 'staff',
        },
      };

      await this.publisher.publish(event);

      if (this.pushNotification && details.patientUserId) {
        this.pushNotification
          .sendPush({
            userId: details.patientUserId,
            title: 'Antrean Digeser',
            body: `Nomor antrean ${details.ticketNumber} (${details.patientName || 'Pasien'}) digeser 3 posisi ke belakang karena belum merespons. Sisa kesempatan panggilan: ${MAX_PATIENT_CALL_ATTEMPTS - latestAttempt.attemptNumber} kali.`,
            data: {
              appointmentId,
              queueNumber: String(details.ticketNumber),
              status: 'WAITING',
            },
          })
          .catch((error) => {
            this.logger.warn(
              `Push notification failed on requeue for patient ${details.patientUserId}: ${error.message}`,
            );
          });
      }

      return {
        requeued: true,
        attemptNumber: latestAttempt.attemptNumber,
        remainingAttempts:
          MAX_PATIENT_CALL_ATTEMPTS - latestAttempt.attemptNumber,
        status: QUEUE_TICKET_STATUS.WAITING,
      };
    }

    // Terminal: Reached 3 attempts, mark appointment as NO_SHOW and ticket as SKIPPED
    await this.callRepo.updateAppointmentAndTicketStatus(
      appointmentId,
      DB_APPOINTMENT_STATUS.NO_SHOW,
      details.ticketId,
      QUEUE_TICKET_STATUS.SKIPPED,
    );

    await this.invalidateQueueCache();

    const event: DomainEvent = {
      eventId: randomUUID(),
      eventType: APPOINTMENT_EVENTS.NO_SHOW,
      version: 1,
      occurredAt: now,
      module: 'appointments',
      payload: {
        appointmentId,
        patientUserId: details.patientUserId,
        patientName: details.patientName,
        ticketNumber: details.ticketNumber,
        totalAttempts: latestAttempt.attemptNumber,
        poliklinikName: details.roomName || details.poliklinikName || 'Poliklinik',
        notes,
      },
      actor: {
        userId: calledByUserId,
        roleCode: 'staff',
      },
    };

    await this.publisher.publish(event);

    if (this.pushNotification && details.patientUserId) {
      const roomOrPoli = details.roomName || details.poliklinikName || 'Ruang Pemeriksaan';
      this.pushNotification
        .sendPush({
          userId: details.patientUserId,
          title: 'Panggilan Terlewati (No-Show)',
          body: `Nomor antrean ${details.ticketNumber} (${details.patientName || 'Pasien'}) tidak hadir setelah 3 kali pemanggilan di ${roomOrPoli}.`,
          data: {
            appointmentId,
            queueNumber: String(details.ticketNumber),
            status: 'NO_SHOW',
          },
        })
        .catch((error) => {
          this.logger.warn(
            `Push notification failed on no-show for patient ${details.patientUserId}: ${error.message}`,
          );
        });
    }

    return {
      noShow: true,
      attemptNumber: latestAttempt.attemptNumber,
      status: DB_APPOINTMENT_STATUS.NO_SHOW,
    };
  }
}
