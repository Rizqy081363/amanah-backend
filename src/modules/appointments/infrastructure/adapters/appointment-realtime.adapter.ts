import { Inject, Injectable, Logger } from '@nestjs/common';
import { CANONICAL_ROLES } from '../../../../auth/constants/auth.constants';
import { SocketIoRealtimeGateway } from '../../../../modules/notifications/infrastructure/realtime/socket-io-realtime.gateway';
import { REALTIME_GATEWAY_PORT } from '../../../../modules/notifications/notifications.constants';
import type {
  PatientCalledEvent,
  RealtimeEmitterPort,
  StatusChangedEvent,
} from '../../application/ports/realtime-emitter.port';

const APPOINTMENT_NOTIFICATION_ROLES = [
  CANONICAL_ROLES.ADMIN,
  CANONICAL_ROLES.STAFF_DOCTOR,
  CANONICAL_ROLES.STAFF_MIDWIFE,
  CANONICAL_ROLES.STAFF_WORKER,
  CANONICAL_ROLES.PATIENT,
] as const;

@Injectable()
export class AppointmentRealtimeAdapter implements RealtimeEmitterPort {
  private readonly logger = new Logger(AppointmentRealtimeAdapter.name);

  constructor(
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway: SocketIoRealtimeGateway,
  ) {}

  async emitStatusChanged(event: StatusChangedEvent): Promise<void> {
    try {
      if (this.realtimeGateway.server) {
        this.realtimeGateway.server.emit('appointment.status_changed', event);
        this.realtimeGateway.server.emit('appointment:status_changed', event);
      }
      for (const role of APPOINTMENT_NOTIFICATION_ROLES) {
        await this.realtimeGateway.emitToRole(
          role,
          'appointment.status_changed',
          event,
        );
        await this.realtimeGateway.emitToRole(
          role,
          'appointment:status_changed',
          event,
        );
      }
    } catch (err: any) {
      this.logger.warn(`Failed to emit status changed event: ${err.message}`);
    }
  }

  async emitPatientCalled(event: PatientCalledEvent): Promise<void> {
    try {
      if (this.realtimeGateway.server) {
        this.realtimeGateway.server.emit('appointment.patient_called', event);
        this.realtimeGateway.server.emit('appointment:called', event);
      }
      for (const role of APPOINTMENT_NOTIFICATION_ROLES) {
        await this.realtimeGateway.emitToRole(
          role,
          'appointment.patient_called',
          event,
        );
        await this.realtimeGateway.emitToRole(
          role,
          'appointment:called',
          event,
        );
      }
    } catch (err: any) {
      this.logger.warn(`Failed to emit patient called event: ${err.message}`);
    }
  }
}
