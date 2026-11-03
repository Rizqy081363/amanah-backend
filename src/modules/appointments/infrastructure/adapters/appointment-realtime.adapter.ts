import { Inject, Injectable, Logger } from '@nestjs/common';
import { SocketIoRealtimeGateway } from '../../../../modules/notifications/infrastructure/realtime/socket-io-realtime.gateway';
import {
  REALTIME_GATEWAY_PORT,
  REALTIME_ROOMS,
} from '../../../../modules/notifications/notifications.constants';
import type {
  CheckInWindowOpenedEvent,
  PatientCalledEvent,
  RealtimeEmitterPort,
  StatusChangedEvent,
} from '../../application/ports/realtime-emitter.port';

@Injectable()
export class AppointmentRealtimeAdapter implements RealtimeEmitterPort {
  private readonly logger = new Logger(AppointmentRealtimeAdapter.name);

  constructor(
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway: SocketIoRealtimeGateway,
  ) {}

  async emitStatusChanged(event: StatusChangedEvent): Promise<void> {
    try {
      if (event.patientUserId) {
        await this.realtimeGateway.emitToUser(
          event.patientUserId,
          'appointment:status_changed',
          event,
        );
        await this.realtimeGateway.emitToUser(
          event.patientUserId,
          'appointment.status_changed',
          event,
        );
      }
      await this.realtimeGateway.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'appointment:status_changed',
        event,
      );
      await this.realtimeGateway.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'appointment.status_changed',
        event,
      );
    } catch (err: any) {
      this.logger.warn(`Failed to emit status changed event: ${err.message}`);
    }
  }

  async emitPatientCalled(event: PatientCalledEvent): Promise<void> {
    try {
      if (event.patientUserId) {
        await this.realtimeGateway.emitToUser(
          event.patientUserId,
          'appointment:called',
          event,
        );
        await this.realtimeGateway.emitToUser(
          event.patientUserId,
          'appointment.patient_called',
          event,
        );
      }
      await this.realtimeGateway.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'appointment:called',
        event,
      );
      await this.realtimeGateway.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'appointment.patient_called',
        event,
      );
    } catch (err: any) {
      this.logger.warn(`Failed to emit patient called event: ${err.message}`);
    }
  }

  async emitCheckInWindowOpened(event: CheckInWindowOpenedEvent): Promise<void> {
    try {
      if (event.patientUserId) {
        await this.realtimeGateway.emitToUser(
          event.patientUserId,
          'appointment:check_in_window_opened',
          event,
        );
        await this.realtimeGateway.emitToUser(
          event.patientUserId,
          'appointment:status_changed',
          {
            appointmentId: event.appointmentId,
            status: 'BOOKED',
            action: 'CHECK_IN_WINDOW_OPENED',
          },
        );
      }
      await this.realtimeGateway.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'appointment:check_in_window_opened',
        event,
      );
      await this.realtimeGateway.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'appointment:status_changed',
        {
          appointmentId: event.appointmentId,
          status: 'BOOKED',
          action: 'CHECK_IN_WINDOW_OPENED',
        },
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to emit check-in window opened event: ${err.message}`,
      );
    }
  }
}
