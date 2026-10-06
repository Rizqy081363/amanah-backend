import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AppointmentNotCallableError,
  AppointmentNotFoundError,
} from '../../domain/errors/appointment-domain.errors';
import type { AppointmentRecord } from '../../domain/types/appointment.types';
import {
  APPOINTMENT_REPOSITORY_PORT,
  type AppointmentRepositoryPort,
} from '../ports/appointment-repository.port';
import {
  PUSH_NOTIFICATION_PORT,
  type PushNotificationPort,
} from '../ports/push-notification.port';
import {
  REALTIME_EMITTER_PORT,
  type RealtimeEmitterPort,
} from '../ports/realtime-emitter.port';

@Injectable()
export class CallPatientUseCase {
  private readonly logger = new Logger(CallPatientUseCase.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY_PORT)
    private readonly appointmentRepo: AppointmentRepositoryPort,
    @Inject(REALTIME_EMITTER_PORT)
    private readonly realtimeEmitter: RealtimeEmitterPort,
    @Inject(PUSH_NOTIFICATION_PORT)
    private readonly pushNotification: PushNotificationPort,
  ) {}

  async execute(appointmentId: string): Promise<AppointmentRecord> {
    const appointment = await this.appointmentRepo.findById(appointmentId);
    if (!appointment) {
      throw new AppointmentNotFoundError(appointmentId);
    }

    if (appointment.status !== 'WAITING') {
      throw new AppointmentNotCallableError(appointmentId, appointment.status);
    }

    const calledAt = new Date();
    const updated = await this.appointmentRepo.updateLastCalledAt(appointmentId, calledAt);

    await this.realtimeEmitter.emitPatientCalled({
      appointmentId: updated.id,
      queueNumber: updated.queueNumber,
      practitionerId: updated.practitionerId,
      calledAt,
      patientName: updated.patientName,
    });

    if (updated.patientUserId) {
      this.pushNotification
        .sendPush({
          userId: updated.patientUserId,
          title: 'Giliran Konsultasi Anda',
          body: `Nomor antrean ${updated.queueNumber} sedang dipanggil. Silakan menuju ruang pemeriksaan.`,
          data: {
            appointmentId: updated.id,
            queueNumber: updated.queueNumber,
          },
        })
        .catch((error) => {
          this.logger.warn(`Push notification failed for patient ${updated.patientUserId}: ${error.message}`);
        });
    }

    return updated;
  }
}
