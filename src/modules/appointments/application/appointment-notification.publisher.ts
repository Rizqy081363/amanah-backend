import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  type DomainEvent,
  type NotificationPublisher,
} from '../../notifications/contracts/domain-event.interface';
import { NOTIFICATION_PUBLISHER } from '../../notifications/notifications.constants';
import { APPOINTMENT_EVENTS } from '../domain/constants/appointment-lifecycle.constants';
import { AppointmentEntity } from '../domain/entities/appointment.entity';

@Injectable()
export class AppointmentNotificationPublisher {
  private readonly logger = new Logger(AppointmentNotificationPublisher.name);

  constructor(
    @Optional()
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notificationPublisher?: NotificationPublisher,
  ) {
    this.logger.log(
      `AppointmentNotificationPublisher initialized: hasPublisher=${!!this.notificationPublisher}`,
    );
  }

  async publishCreated(created: AppointmentEntity, user?: any): Promise<void> {
    if (!this.notificationPublisher) return;

    try {
      const domainEvent: DomainEvent = {
        eventId: randomUUID(),
        eventType: APPOINTMENT_EVENTS.CREATED,
        version: 1,
        occurredAt: new Date().toISOString(),
        module: 'appointments',
        payload: {
          appointmentId: created.id,
          patientId: created.patientId,
          patientUserId: created.patientUserId || user?.id || user?.sub,
          patientName: created.patientName || user?.name || 'Pasien',
          patientAvatarUrl: created.patientAvatarUrl || null,
          poliklinikId: created.poliklinikId,
          poliklinikName: created.poliklinikName || null,
          layananId: created.layananId,
          layananName: created.layananName || null,
          doctorName: created.doctorName || null,
          doctorAvatarUrl: created.doctorAvatarUrl || null,
          appointmentDate: created.appointmentDate,
          session: created.session,
          queueNumber: created.queueNumber,
          status: created.status,
          visitType: created.visitType,
          complaint: created.complaint || null,
        },
        actor: {
          userId: user?.id || user?.sub,
          roleCode:
            typeof user?.role === 'object' && user?.role
              ? user.role.name
              : user?.role || user?.systemRole || 'PATIENT',
        },
      };
      await this.notificationPublisher.publish(domainEvent);
    } catch (pubError) {
      this.logger.warn(
        `Failed to publish notification event on appointment creation: ${pubError}`,
      );
    }
  }

  async publishCancelled(
    appointment: AppointmentEntity,
    reason: string,
    user?: any,
  ): Promise<void> {
    if (!this.notificationPublisher) return;

    try {
      const actorUserId = user?.id || user?.sub;
      const isPatientOwner = Boolean(
        appointment.patientUserId &&
          actorUserId &&
          appointment.patientUserId === actorUserId,
      );

      const rawRole =
        typeof user?.role === 'object' && user?.role
          ? user.role.name || user.role.code
          : user?.role || user?.systemRole;
      const normalizedRole = (rawRole || '').toUpperCase();
      const isStaffOrAdmin =
        normalizedRole === 'ADMIN' ||
        normalizedRole === 'STAF' ||
        normalizedRole === 'STAFF' ||
        normalizedRole === 'DOCTOR' ||
        normalizedRole === 'DOKTER';

      const isCancelledByAdmin = isPatientOwner ? false : isStaffOrAdmin;

      const domainEvent: DomainEvent = {
        eventId: randomUUID(),
        eventType: APPOINTMENT_EVENTS.CANCELLED,
        version: 1,
        occurredAt: new Date().toISOString(),
        module: 'appointments',
        payload: {
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          patientUserId: appointment.patientUserId || null,
          patientName: appointment.patientName || 'Pasien',
          patientAvatarUrl: appointment.patientAvatarUrl || null,
          doctorName: appointment.doctorName || null,
          doctorAvatarUrl: appointment.doctorAvatarUrl || null,
          poliklinikId: appointment.poliklinikId,
          poliklinikName: appointment.poliklinikName || null,
          layananId: appointment.layananId,
          layananName: appointment.layananName || null,
          roomName: appointment.roomName || null,
          appointmentDate: appointment.appointmentDate,
          session: appointment.session,
          scheduledStartTime: appointment.scheduledStartTime,
          scheduledEndTime: appointment.scheduledEndTime,
          queueNumber: appointment.queueNumber,
          status: 'BATAL',
          reason,
          cancelledByRole: isCancelledByAdmin ? 'admin' : 'patient',
        },
        actor: {
          userId: user?.id || user?.sub,
          roleCode: isCancelledByAdmin ? 'ADMIN' : 'PATIENT',
        },
      };

      await this.notificationPublisher.publish(domainEvent);
    } catch (pubError) {
      this.logger.warn(
        `Failed to publish notification event on appointment cancellation: ${pubError}`,
      );
    }
  }

  async publishRescheduled(
    appointment: AppointmentEntity,
    options: {
      targetDate?: string | null;
      targetStartTime?: string | null;
      targetEndTime?: string | null;
      reason?: string | null;
      rescheduledByRole?: 'admin' | 'patient' | 'staff';
    },
    user?: any,
  ): Promise<void> {
    if (!this.notificationPublisher) return;

    try {
      const actorUserId = user?.id || user?.sub;
      const isPatientOwner = Boolean(
        appointment.patientUserId &&
          actorUserId &&
          appointment.patientUserId === actorUserId,
      );

      const rawRole =
        typeof user?.role === 'object' && user?.role
          ? user.role.name || user.role.code
          : user?.role || user?.systemRole;
      const normalizedRole = (rawRole || '').toUpperCase();
      const isStaffOrAdmin =
        normalizedRole === 'ADMIN' ||
        normalizedRole === 'STAF' ||
        normalizedRole === 'STAFF' ||
        normalizedRole === 'DOCTOR' ||
        normalizedRole === 'DOKTER';

      const determinedRole = options.rescheduledByRole
        ? options.rescheduledByRole
        : isPatientOwner
          ? 'patient'
          : isStaffOrAdmin
            ? 'admin'
            : 'patient';

      const domainEvent: DomainEvent = {
        eventId: randomUUID(),
        eventType: APPOINTMENT_EVENTS.RESCHEDULED,
        version: 1,
        occurredAt: new Date().toISOString(),
        module: 'appointments',
        payload: {
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          patientUserId: appointment.patientUserId || null,
          patientName: appointment.patientName || 'Pasien',
          patientAvatarUrl: appointment.patientAvatarUrl || null,
          doctorName: appointment.doctorName || null,
          doctorAvatarUrl: appointment.doctorAvatarUrl || null,
          practitionerId: appointment.staffId || null,
          poliklinikId: appointment.poliklinikId,
          poliklinikName: appointment.poliklinikName || null,
          layananId: appointment.layananId,
          layananName: appointment.layananName || null,
          roomName: appointment.roomName || null,
          targetDate: options.targetDate || appointment.appointmentDate,
          targetStartTime:
            options.targetStartTime || appointment.scheduledStartTime,
          targetEndTime:
            options.targetEndTime || appointment.scheduledEndTime,
          appointmentDate: appointment.appointmentDate,
          session: appointment.session,
          queueNumber: appointment.queueNumber,
          status: appointment.status,
          reason: options.reason || 'Reschedule jadwal janji temu',
          rescheduledByRole: determinedRole,
        },
        actor: {
          userId: user?.id || user?.sub,
          roleCode: determinedRole === 'admin' ? 'ADMIN' : 'PATIENT',
        },
      };

      await this.notificationPublisher.publish(domainEvent);
    } catch (pubError) {
      this.logger.warn(
        `Failed to publish notification event on appointment reschedule: ${pubError}`,
      );
    }
  }
}
