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

  private extractRoleCode(user?: any, fallback = 'STAF'): string {
    if (!user) return fallback;
    const rawRole =
      user.roleCode ||
      user.role?.code ||
      user.systemRole ||
      user.role?.name ||
      (typeof user.role === 'string' ? user.role : fallback);
    if (typeof rawRole === 'string' && rawRole.trim() !== '') {
      return rawRole.toUpperCase();
    }
    return fallback;
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
          avatarUrl: created.avatarUrl || null,
          poliklinikId: created.poliklinikId,
          poliklinikName: created.poliklinikName || null,
          layananId: created.layananId,
          layananName: created.layananName || null,
          staffId: created.staffId || null,
          doctorName: created.doctorName || null,
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
          roleCode: this.extractRoleCode(user, 'PATIENT'),
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
    appointment: {
      id: string;
      patientId?: string | null;
      patientUserId?: string | null;
      patientName?: string | null;
      avatarUrl?: string | null;
      doctorName?: string | null;
      staffId?: string | null;
      poliklinikId?: string | null;
      poliklinikName?: string | null;
      layananId?: string | null;
      layananName?: string | null;
      roomName?: string | null;
      appointmentDate?: string | null;
      session?: any;
      scheduledStartTime?: string | null;
      scheduledEndTime?: string | null;
      queueNumber?: number | string | null;
      status?: string | null;
    },
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

      const normalizedRole = this.extractRoleCode(user, 'PATIENT');
      const isDoctorRole =
        normalizedRole === 'DOCTOR' || normalizedRole === 'DOKTER';
      const isStaffOrAdmin =
        normalizedRole === 'ADMIN' ||
        normalizedRole === 'STAF' ||
        normalizedRole === 'STAFF';

      const determinedRole = isDoctorRole
        ? 'doctor'
        : isPatientOwner
          ? 'patient'
          : isStaffOrAdmin
            ? 'admin'
            : 'patient';

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
          avatarUrl: appointment.avatarUrl || null,
          doctorName: appointment.doctorName || null,
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
          cancelledByRole: determinedRole,
        },
        actor: {
          userId: user?.id || user?.sub,
          roleCode:
            determinedRole === 'doctor'
              ? 'DOCTOR'
              : determinedRole === 'admin'
                ? 'ADMIN'
                : 'PATIENT',
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

      const normalizedRole = this.extractRoleCode(user, 'PATIENT');
      const isDoctorCaller =
        normalizedRole === 'DOCTOR' || normalizedRole === 'DOKTER';
      const isStaffOrAdmin =
        normalizedRole === 'ADMIN' ||
        normalizedRole === 'STAF' ||
        normalizedRole === 'STAFF';

      const determinedRole = options.rescheduledByRole
        ? options.rescheduledByRole
        : isDoctorCaller
          ? 'doctor'
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
          avatarUrl: appointment.avatarUrl || null,
          doctorName: appointment.doctorName || null,
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
          roleCode:
            determinedRole === 'doctor'
              ? 'DOCTOR'
              : determinedRole === 'admin'
                ? 'ADMIN'
                : 'PATIENT',
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
          roleCode: this.extractRoleCode(user, 'ADMIN'),
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
          avatarUrl: appointment.avatarUrl || null,
          staffId: appointment.staffId || null,
          doctorName: appointment.doctorName || null,
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
          roleCode: this.extractRoleCode(user, 'PATIENT'),
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
      avatarUrl?: string | null;
      doctorName?: string | null;
      staffId?: string | null;
      poliklinikName?: string | null;
      roomName?: string | null;
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
          avatarUrl: appointment.avatarUrl || null,
          staffId: appointment.staffId || null,
          doctorName: appointment.doctorName || null,
          poliklinikName: appointment.poliklinikName || null,
          roomName: appointment.roomName || null,
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
          roleCode: this.extractRoleCode(user, 'STAF'),
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
      avatarUrl?: string | null;
      doctorName?: string | null;
      staffId?: string | null;
      poliklinikName?: string | null;
      roomName?: string | null;
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
          avatarUrl: appointment.avatarUrl || null,
          staffId: appointment.staffId || null,
          doctorName: appointment.doctorName || null,
          poliklinikName: appointment.poliklinikName || null,
          roomName: appointment.roomName || null,
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
          roleCode: this.extractRoleCode(user, 'STAF'),
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
