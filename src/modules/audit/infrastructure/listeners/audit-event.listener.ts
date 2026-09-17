import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AppointmentCreatedEvent,
  AppointmentStatusChangedEvent,
  AuditRecordEvent,
} from '../../../../common/events';
import { AuditService } from '../../application/audit.service';

@Injectable()
export class AuditEventListener {
  private readonly logger = new Logger(AuditEventListener.name);

  constructor(private readonly auditService: AuditService) {}

  @OnEvent(AppointmentCreatedEvent.EVENT_NAME, { async: true })
  async handleAppointmentCreated(event: AppointmentCreatedEvent): Promise<void> {
    try {
      await this.auditService.recordLog({
        action: 'create_appointment',
        entityTable: 'appointments',
        entityId: event.appointmentId,
        newValues: {
          patientId: event.patientId,
          poliklinikId: event.poliklinikId,
          appointmentDate: event.appointmentDate,
          session: event.session,
          queueNumber: event.queueNumber,
          status: event.status,
        },
        actorUserId: event.actor?.userId,
        actorRoleCode: event.actor?.roleCode,
        ipAddress: event.actor?.ipAddress,
        userAgent: event.actor?.userAgent,
      });
    } catch (error) {
      this.logger.error(
        `Error handling ${event.eventName} for appointment ${event.appointmentId}: ${String(error)}`,
      );
    }
  }

  @OnEvent(AppointmentStatusChangedEvent.EVENT_NAME, { async: true })
  async handleAppointmentStatusChanged(
    event: AppointmentStatusChangedEvent,
  ): Promise<void> {
    try {
      await this.auditService.recordLog({
        action: 'update_appointment_status',
        entityTable: 'appointments',
        entityId: event.appointmentId,
        oldValues: event.previousStatus
          ? { status: event.previousStatus }
          : null,
        newValues: {
          status: event.newStatus,
          reason: event.reason,
        },
        actorUserId: event.actor?.userId,
        actorRoleCode: event.actor?.roleCode,
        ipAddress: event.actor?.ipAddress,
        userAgent: event.actor?.userAgent,
      });
    } catch (error) {
      this.logger.error(
        `Error handling ${event.eventName} for appointment ${event.appointmentId}: ${String(error)}`,
      );
    }
  }

  @OnEvent(AuditRecordEvent.EVENT_NAME, { async: true })
  async handleGenericAuditRecord(event: AuditRecordEvent): Promise<void> {
    try {
      await this.auditService.recordLog({
        action: event.action,
        entityTable: event.entityTable,
        entityId: event.entityId,
        oldValues: event.oldValues,
        newValues: event.newValues,
        actorUserId: event.actor?.userId,
        actorRoleCode: event.actor?.roleCode,
        ipAddress: event.actor?.ipAddress,
        userAgent: event.actor?.userAgent,
      });
    } catch (error) {
      this.logger.error(
        `Error handling ${event.eventName} for ${event.action}: ${String(error)}`,
      );
    }
  }
}
