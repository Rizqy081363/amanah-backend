import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
          staffId: created.staffId || null,
          doctorName: created.doctorName || null,
          doctorAvatarUrl: created.doctorAvatarUrl || null,
          appointmentDate: created.appointmentDate,
          scheduledStartTime: created.scheduledStartTime || null,
          scheduledEndTime: created.scheduledEndTime || null,
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
          staffId: appointment.staffId || null,
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
          staffId: appointment.staffId || null,
          poliklinikId: appointment.poliklinikId,
          poliklinikName: appointment.poliklinikName || null,
          layananId: appointment.layananId,
          layananName: appointment.layananName || null,
          roomName: appointment.roomName || null,
          targetDate: options.targetDate || appointment.appointmentDate,
          targetStartTime:
            options.targetStartTime || appointment.scheduledStartTime,
          targetEndTime: options.targetEndTime || appointment.scheduledEndTime,
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

  async publishAssignmentChanged(
    appointment: AppointmentEntity,
    changes: {
      doctorName?: string | null;
      roomName?: string | null;
      type: 'doctor' | 'room';
    },
    user?: any,
  ): Promise<void> {
    if (!this.notificationPublisher) return;

    try {
      const domainEvent: DomainEvent = {
        eventId: randomUUID(),
        eventType: APPOINTMENT_EVENTS.ASSIGNMENT_UPDATED,
        version: 1,
        occurredAt: new Date().toISOString(),
        module: 'appointments',
        payload: {
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          patientUserId: appointment.patientUserId || null,
          patientName: appointment.patientName || 'Pasien',
          staffId: appointment.staffId || null,
          doctorName: appointment.doctorName || null,
          roomName: appointment.roomName || null,
          scheduledDate: appointment.appointmentDate,
          scheduledStartTime: appointment.scheduledStartTime,
          scheduledEndTime: appointment.scheduledEndTime,
          changeType: changes.type,
          status: appointment.status,
          title:
            changes.type === 'doctor'
              ? 'Perubahan Dokter Janji Temu'
              : 'Perubahan Ruangan Janji Temu',
          message:
            changes.type === 'doctor'
              ? `Dokter janji temu Anda telah dialihkan ke ${appointment.doctorName || 'dokter baru'}.`
              : `Ruangan janji temu Anda telah dialihkan ke ${appointment.roomName || 'ruangan baru'}.`,
        },
        actor: {
          userId: user?.id || user?.sub,
          roleCode: user?.role || 'ADMIN',
        },
      };

      await this.notificationPublisher.publish(domainEvent);
    } catch (pubError) {
      this.logger.warn(
        `Failed to publish notification event on appointment assignment change: ${pubError}`,
      );
    }
  }

  async publishCheckedIn(
    appointment: AppointmentEntity,
    user?: any,
  ): Promise<void> {
    if (!this.notificationPublisher) return;

    try {
      const domainEvent: DomainEvent = {
        eventId: randomUUID(),
        eventType: APPOINTMENT_EVENTS.CHECKED_IN,
        version: 1,
        occurredAt: new Date().toISOString(),
        module: 'appointments',
        payload: {
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          patientUserId: appointment.patientUserId || null,
          patientName: appointment.patientName || 'Pasien',
          patientAvatarUrl: appointment.patientAvatarUrl || null,
          staffId: appointment.staffId || null,
          doctorName: appointment.doctorName || null,
          doctorAvatarUrl: appointment.doctorAvatarUrl || null,
          roomName: appointment.roomName || null,
          poliklinikName: appointment.poliklinikName || null,
          scheduledDate: appointment.appointmentDate,
          scheduledStartTime: appointment.scheduledStartTime,
          scheduledEndTime: appointment.scheduledEndTime,
          queueNumber: appointment.queueNumber || 'A01',
          status: appointment.status,
          title: 'Pasien Telah Check-In',
          message: `Pasien ${appointment.patientName || 'Pasien'} (Nomor antrean #${appointment.queueNumber}) telah hadir di klinik dan menunggu di ruang tunggu.`,
        },
        actor: {
          userId: user?.id || user?.sub,
          roleCode: user?.role || 'PATIENT',
        },
      };

      await this.notificationPublisher.publish(domainEvent);
    } catch (pubError) {
      this.logger.warn(
        `Failed to publish notification event on check-in: ${pubError}`,
      );
    }
  }

  async publishStarted(
    appointment: {
      id: string;
      patientId?: string | null;
      patientUserId?: string | null;
      patientName?: string | null;
      patientAvatarUrl?: string | null;
      doctorName?: string | null;
      doctorAvatarUrl?: string | null;
      staffId?: string | null;
      poliklinikName?: string | null;
      queueNumber?: number | string | null;
      ticketNumber?: string | null;
      scheduledDate?: string | null;
    },
    user?: any,
  ): Promise<void> {
    if (!this.notificationPublisher) return;

    try {
      const domainEvent: DomainEvent = {
        eventId: randomUUID(),
        eventType: APPOINTMENT_EVENTS.PATIENT_RESPONDED,
        version: 1,
        occurredAt: new Date().toISOString(),
        module: 'appointments',
        payload: {
          appointmentId: appointment.id,
          patientId: appointment.patientId || null,
          patientUserId: appointment.patientUserId || null,
          patientName: appointment.patientName || 'Pasien',
          patientAvatarUrl: appointment.patientAvatarUrl || null,
          staffId: appointment.staffId || null,
          doctorName: appointment.doctorName || null,
          doctorAvatarUrl: appointment.doctorAvatarUrl || null,
          poliklinikName: appointment.poliklinikName || null,
          ticketNumber:
            appointment.ticketNumber ||
            String(appointment.queueNumber || '-'),
          queueNumber: appointment.queueNumber || null,
          scheduledDate: appointment.scheduledDate || null,
          title: 'Pemeriksaan Dimulai',
          message: appointment.doctorName
            ? `${appointment.doctorName} telah memulai pemeriksaan pasien ${appointment.patientName || 'Pasien'} (${appointment.ticketNumber || appointment.queueNumber || '-'}).`
            : `Pemeriksaan antrean ${appointment.ticketNumber || appointment.queueNumber || '-'} sedang berlangsung.`,
        },
        actor: {
          userId: user?.id || user?.sub,
          roleCode: user?.role || user?.systemRole || 'STAF',
        },
      };

      await this.notificationPublisher.publish(domainEvent);
    } catch (pubError) {
      this.logger.warn(
        `Failed to publish notification event on appointment started: ${pubError}`,
      );
    }
  }

  async publishCompleted(
    appointment: {
      id: string;
      patientId?: string | null;
      patientUserId?: string | null;
      patientName?: string | null;
      patientAvatarUrl?: string | null;
      doctorName?: string | null;
      doctorAvatarUrl?: string | null;
      staffId?: string | null;
      poliklinikName?: string | null;
      queueNumber?: number | string | null;
      ticketNumber?: string | null;
      scheduledDate?: string | null;
    },
    user?: any,
  ): Promise<void> {
    if (!this.notificationPublisher) return;

    try {
      const domainEvent: DomainEvent = {
        eventId: randomUUID(),
        eventType: APPOINTMENT_EVENTS.COMPLETED,
        version: 1,
        occurredAt: new Date().toISOString(),
        module: 'appointments',
        payload: {
          appointmentId: appointment.id,
          patientId: appointment.patientId || null,
          patientUserId: appointment.patientUserId || null,
          patientName: appointment.patientName || 'Pasien',
          patientAvatarUrl: appointment.patientAvatarUrl || null,
          staffId: appointment.staffId || null,
          doctorName: appointment.doctorName || null,
          doctorAvatarUrl: appointment.doctorAvatarUrl || null,
          poliklinikName: appointment.poliklinikName || null,
          ticketNumber:
            appointment.ticketNumber ||
            String(appointment.queueNumber || '-'),
          queueNumber: appointment.queueNumber || null,
          scheduledDate: appointment.scheduledDate || null,
          title: 'Pemeriksaan Selesai',
          message: appointment.doctorName
            ? `${appointment.doctorName} telah menyelesaikan pemeriksaan pasien ${appointment.patientName || 'Pasien'} (${appointment.ticketNumber || appointment.queueNumber || '-'}).`
            : `Pemeriksaan antrean ${appointment.ticketNumber || appointment.queueNumber || '-'} telah selesai.`,
        },
        actor: {
          userId: user?.id || user?.sub,
          roleCode: user?.role || user?.systemRole || 'STAF',
        },
      };

      await this.notificationPublisher.publish(domainEvent);
    } catch (pubError) {
      this.logger.warn(
        `Failed to publish notification event on appointment completed: ${pubError}`,
      );
    }
  }
}
