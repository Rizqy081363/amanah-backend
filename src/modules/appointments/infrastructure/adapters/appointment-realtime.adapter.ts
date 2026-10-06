import { Inject, Injectable, Logger } from '@nestjs/common';
import { SocketIoRealtimeGateway } from '../../../../modules/notifications/infrastructure/realtime/socket-io-realtime.gateway';
import { REALTIME_GATEWAY_PORT } from '../../../../modules/notifications/notifications.constants';
import type {
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
      if (this.realtimeGateway.server) {
        this.realtimeGateway.server.emit('appointment.status_changed', event);
        this.realtimeGateway.server.emit('appointment:status_changed', event);
      }
      await this.realtimeGateway.emitToRole('admin', 'appointment.status_changed', event);
      await this.realtimeGateway.emitToRole('admin', 'appointment:status_changed', event);
      await this.realtimeGateway.emitToRole('doctor', 'appointment.status_changed', event);
      await this.realtimeGateway.emitToRole('doctor', 'appointment:status_changed', event);
      await this.realtimeGateway.emitToRole('patient', 'appointment.status_changed', event);
      await this.realtimeGateway.emitToRole('patient', 'appointment:status_changed', event);
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
      await this.realtimeGateway.emitToRole('admin', 'appointment.patient_called', event);
      await this.realtimeGateway.emitToRole('admin', 'appointment:called', event);
      await this.realtimeGateway.emitToRole('doctor', 'appointment.patient_called', event);
      await this.realtimeGateway.emitToRole('doctor', 'appointment:called', event);
      await this.realtimeGateway.emitToRole('patient', 'appointment.patient_called', event);
      await this.realtimeGateway.emitToRole('patient', 'appointment:called', event);
    } catch (err: any) {
      this.logger.warn(`Failed to emit patient called event: ${err.message}`);
    }
  }
}
