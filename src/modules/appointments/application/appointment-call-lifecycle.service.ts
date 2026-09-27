import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DomainEvent,
  NotificationPublisher,
} from '../../notifications/contracts/domain-event.interface';
import { NOTIFICATION_PUBLISHER } from '../../notifications/notifications.constants';
import {
  APPOINTMENT_CALL_REPOSITORY,
  APPOINTMENT_CALL_STATUS,
  APPOINTMENT_EVENTS,
  MAX_PATIENT_CALL_ATTEMPTS,
} from '../domain/constants/appointment-lifecycle.constants';
import { AppointmentCallRepository } from '../domain/repositories/appointment-call.repository';

@Injectable()
export class AppointmentCallLifecycleService {
  private readonly logger = new Logger(AppointmentCallLifecycleService.name);

  constructor(
    @Inject(APPOINTMENT_CALL_REPOSITORY)
    private readonly callRepo: AppointmentCallRepository,
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly publisher: NotificationPublisher,
  ) {}

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

    const nonCallableStatuses = ['completed', 'cancelled', 'no_show'];
    if (nonCallableStatuses.includes(details.status)) {
      throw new BadRequestException(
        `Janji temu dengan status "${details.status}" tidak dapat dipanggil.`,
      );
    }

    const latestAttempt = await this.callRepo.getLatestAttempt(appointmentId);
    const nextAttemptNumber = (latestAttempt?.attemptNumber ?? 0) + 1;

    if (nextAttemptNumber > MAX_PATIENT_CALL_ATTEMPTS) {
      throw new BadRequestException(
        `Maksimum ${MAX_PATIENT_CALL_ATTEMPTS} kali panggilan telah tercapai untuk janji temu ini.`,
      );
    }

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
      'called',
    );

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
        poliklinikName: details.poliklinikName || 'Poli Umum',
        calledBy: calledByUserId,
        notes,
      },
      actor: {
        userId: calledByUserId,
        roleCode: 'staff',
      },
    };

    await this.publisher.publish(event);

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
      'in_service',
      details.ticketId,
      'in_service',
    );

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
        poliklinikName: details.poliklinikName || 'Poli Umum',
      },
      actor: {
        userId: calledByUserId,
        roleCode: 'staff',
      },
    };

    await this.publisher.publish(event);

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
          poliklinikName: details.poliklinikName || 'Poli Umum',
          notes,
        },
        actor: {
          userId: calledByUserId,
          roleCode: 'staff',
        },
      };

      await this.publisher.publish(event);

      return {
        requeued: true,
        attemptNumber: latestAttempt.attemptNumber,
        remainingAttempts:
          MAX_PATIENT_CALL_ATTEMPTS - latestAttempt.attemptNumber,
        status: 'waiting',
      };
    }

    // Terminal: Reached 3 attempts, mark appointment as NO_SHOW and ticket as SKIPPED
    await this.callRepo.updateAppointmentAndTicketStatus(
      appointmentId,
      'no_show',
      details.ticketId,
      'skipped',
    );

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
        poliklinikName: details.poliklinikName || 'Poli Umum',
        notes,
      },
      actor: {
        userId: calledByUserId,
        roleCode: 'staff',
      },
    };

    await this.publisher.publish(event);

    return {
      noShow: true,
      attemptNumber: latestAttempt.attemptNumber,
      status: 'no_show',
    };
  }
}
