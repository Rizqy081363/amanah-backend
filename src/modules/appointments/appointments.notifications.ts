import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { NOTIFICATION_AUDIENCE } from '../../common/constants/notification-audience.constants';
import { NotificationIntent } from '../notifications/domain/entities/notification-rule.entity';
import { NotificationRulesRegistry } from '../notifications/registry/notification-rules-registry';
import { AppointmentNotificationMessageBuilder } from './application/appointment-notification-message.builder';
import { APPOINTMENT_EVENTS } from './domain/constants/appointment-lifecycle.constants';
import { AppointmentRecipientResolver } from './infrastructure/resolvers/appointment-recipient.resolver';

@Injectable()
export class AppointmentsNotificationRules implements OnModuleInit {
  constructor(
    private readonly registry: NotificationRulesRegistry,
    @Optional()
    private readonly recipientResolver?: AppointmentRecipientResolver,
  ) {
    this.onModuleInit();
  }

  onModuleInit(): void {
    // 0. Appointment Created Rule (Patient confirmation & Clinic Staff Alert)
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.CREATED,
      category: 'appointment',
      defaultChannels: ['in_app', 'push'],
      resolveIntents: async (
        payload: any,
        actor?: any,
      ): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];
        const isActorPatient =
          actor?.userId &&
          payload.patientUserId &&
          actor.userId === payload.patientUserId;

        // Intent 1: Patient Confirmation (Audience: NOTIFICATION_AUDIENCE.EXTERNAL)
        if (payload.patientUserId) {
          intents.push({
            recipientUserId: payload.patientUserId,
            audience: NOTIFICATION_AUDIENCE.EXTERNAL,
            title: 'Janji Temu Berhasil Dibuat',
            body: payload.doctorName
              ? `Janji temu Anda dengan ${payload.doctorName} pada tanggal ${payload.appointmentDate} telah berhasil dijadwalkan.`
              : `Janji temu Anda pada tanggal ${payload.appointmentDate} telah berhasil dijadwalkan.`,
            severity: 'success',
            action: {
              type: 'view_queue',
              params: {
                appointmentId: payload.appointmentId || '',
              },
              label: 'Lihat Antrean',
            },
            badgeIcon: 'calendar-check',
            visualKey: payload.avatarUrl ?? null,
            senderName: 'Klinik Amanah',
            senderRole: 'Sistem Pendaftaran',
            isUrgent: false,
            presentation: {
              // Fail-closed toast policy: If patient was the actor, local mutation toast is already shown
              toast: !isActorPatient,
            },
          });
        }

        // Intent 2: Clinic Staff Alert (Audience: NOTIFICATION_AUDIENCE.INTERNAL, Scoped: Admin + Frontdesk + Assigned Practitioner)
        if (this.recipientResolver) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.staffId,
            );

          for (const staffUserId of clinicUserIds) {
            const isActorStaff = actor?.userId === staffUserId;
            intents.push({
              recipientUserId: staffUserId,
              audience: NOTIFICATION_AUDIENCE.INTERNAL,
              title: 'Pasien Baru',
              body: `${payload.patientName || 'Pasien'}\n${payload.queueNumber || '-'}`,
              severity: 'info',
              action: {
                type: 'view_patient',
                params: {
                  staffId: payload.staffId || '',
                  date: payload.appointmentDate || '',
                  scheduledStartTime: payload.scheduledStartTime || '',
                },
                label: 'Lihat Pasien',
              },
              actions: [
                {
                  label: 'Lihat Pasien',
                  actionKey: 'view_patient',
                  actionType: 'primary',
                  url: `/admin/jadwal-dokter?selectedDoctorId=${payload.staffId || ''}&dialog=detail&date=${payload.appointmentDate}&openPatients=true`,
                },
              ],
              badgeIcon: 'user-plus',
              visualKey: payload.avatarUrl || null,
              senderName: payload.patientName || 'Pasien',
              senderRole: 'Pasien',
              isUrgent: false,
              presentation: {
                toast: !isActorStaff,
              },
            });
          }
        }

        return intents;
      },
      resolveRecipients: async (payload: any) => {
        if (this.recipientResolver) {
          return await this.recipientResolver.resolveScopedClinicRecipients(
            payload.staffId,
          );
        }
        return [];
      },
      titleTemplate: 'Pasien Baru',
      bodyTemplate: (payload: any) =>
        `${payload.patientName || 'Pasien'}\n${payload.queueNumber || '-'}`,
      senderName: (payload: any) => payload.patientName || 'Pasien',
      senderRole: 'Pasien',
      visualKey: (payload: any) => payload.avatarUrl || null,
      isUrgent: false,
      badgeIcon: 'user-plus',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
      resolveActions: (payload: any) => [
        {
          label: 'Lihat Pasien',
          actionKey: 'view_patient',
          actionType: 'primary',
          url: `/admin/jadwal-dokter?selectedDoctorId=${payload.staffId || ''}&dialog=detail&date=${payload.appointmentDate}&openPatients=true`,
        },
      ],
    });

    // 1. Patient Called Rule
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.PATIENT_CALLED,
      category: 'appointment',
      defaultChannels: ['in_app', 'push'],
      resolveIntents: async (
        payload: any,
        actor?: any,
      ): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];
        const messages =
          AppointmentNotificationMessageBuilder.buildPatientCalledMessages(
            payload,
            actor,
          );

        // Intent 1: Patient notification
        if (payload.patientUserId) {
          intents.push({
            recipientUserId: payload.patientUserId,
            audience: NOTIFICATION_AUDIENCE.EXTERNAL,
            title: messages.patientTitle,
            body: messages.patientBody,
            severity: 'warning',
            badgeIcon: 'bell',
            visualKey: payload.avatarUrl ?? null,
            senderName: payload.doctorName || 'Dokter',
            senderRole: 'Dokter',
            isUrgent: true,
            action: {
              type: 'view_queue',
              params: { appointmentId: payload.appointmentId || '' },
              label: 'Lihat Antrean',
            },
            actions: [
              {
                label: 'Lihat Antrean',
                actionKey: 'view_appointment',
                actionType: 'primary',
                url: `/klinik/antrean`,
              },
            ],
            presentation: { toast: true },
          });
        }

        // Intent 2: Clinic Staff Alert (Audience: NOTIFICATION_AUDIENCE.INTERNAL, Scoped: Admin + Frontdesk + Assigned Practitioner)
        if (this.recipientResolver) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.staffId,
            );

          for (const staffUserId of clinicUserIds) {
            const isActorStaff = actor?.userId === staffUserId;
            intents.push({
              recipientUserId: staffUserId,
              audience: NOTIFICATION_AUDIENCE.INTERNAL,
              title: messages.clinicTitle,
              body: messages.clinicBody,
              severity: 'info',
              badgeIcon: 'bell',
              visualKey: payload.avatarUrl ?? null,
              senderName: payload.doctorName || 'Dokter',
              senderRole: 'Dokter',
              isUrgent: false,
              presentation: {
                toast: !isActorStaff,
              },
            });
          }
        }

        return intents;
      },
      resolveRecipients: async (payload: any) => {
        const recipients: string[] = [];
        if (payload.patientUserId) recipients.push(payload.patientUserId);
        if (this.recipientResolver) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.staffId,
            );
          recipients.push(...clinicUserIds);
        }
        return recipients;
      },
      titleTemplate: 'Panggilan Antrean',
      bodyTemplate: (payload: any) =>
        AppointmentNotificationMessageBuilder.buildPatientCalledMessages(
          payload,
        ).clinicBody,
      isUrgent: true,
      badgeIcon: 'bell',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
      resolveActions: () => [
        {
          label: 'Lihat Antrean',
          actionKey: 'view_appointment',
          actionType: 'primary',
          url: `/admin/appointment-pasien`,
        },
      ],
    });

    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.PATIENT_RESPONDED,
      category: 'appointment',
      defaultChannels: ['in_app', 'push'],
      resolveIntents: async (
        payload: any,
        actor?: any,
      ): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];
        const isPractitionerActor =
          actor?.userId === payload.staffId || Boolean(actor?.isClinical);

        const messages = isPractitionerActor
          ? AppointmentNotificationMessageBuilder.buildDoctorStartedMessages(
              payload,
              actor,
            )
          : AppointmentNotificationMessageBuilder.buildAdminStatusChangedMessages(
              payload,
              'in_service',
              actor,
            );

        // Intent 1: Patient notification
        if (payload.patientUserId) {
          intents.push({
            recipientUserId: payload.patientUserId,
            audience: NOTIFICATION_AUDIENCE.EXTERNAL,
            title: messages.patientTitle,
            body: messages.patientBody,
            severity: 'info',
            badgeIcon: 'stethoscope',
            visualKey: payload.avatarUrl ?? null,
            senderName: payload.doctorName || 'Dokter',
            senderRole: 'Dokter',
            isUrgent: false,
            action: {
              type: 'view_queue',
              params: { appointmentId: payload.appointmentId || '' },
              label: 'Lihat Antrean',
            },
            actions: [
              {
                label: 'Lihat Antrean',
                actionKey: 'view_appointment',
                actionType: 'primary',
                url: `/klinik/antrean`,
              },
            ],
            presentation: { toast: true },
          });
        }

        // Intent 2: Clinic Staff & Admin Notification
        if (this.recipientResolver) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.staffId,
            );

          const clinicTitle = messages.clinicTitle;
          const clinicBody = messages.clinicBody;

          for (const staffUserId of clinicUserIds) {
            const isActorStaff = actor?.userId === staffUserId;
            intents.push({
              recipientUserId: staffUserId,
              audience: NOTIFICATION_AUDIENCE.INTERNAL,
              title: clinicTitle,
              body: clinicBody,
              severity: 'info',
              badgeIcon: 'stethoscope',
              visualKey: payload.avatarUrl ?? null,
              senderName: payload.doctorName || 'Dokter',
              senderRole: 'Dokter',
              isUrgent: false,
              action: {
                type: 'view_patient',
                params: { appointmentId: payload.appointmentId || '' },
                label: 'Lihat Detail',
              },
              presentation: { toast: !isActorStaff },
            });
          }
        }

        return intents;
      },
      resolveRecipients: async (payload: any) => {
        const recipients: string[] = [];
        if (payload.patientUserId) recipients.push(payload.patientUserId);
        if (this.recipientResolver) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.staffId,
            );
          recipients.push(...clinicUserIds);
        }
        return recipients;
      },
      titleTemplate: 'Pemeriksaan Dimulai',
      bodyTemplate: (payload: any) =>
        AppointmentNotificationMessageBuilder.buildDoctorStartedMessages(
          payload,
        ).clinicBody,
      isUrgent: false,
      badgeIcon: 'stethoscope',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
      resolveActions: () => [
        {
          label: 'Lihat Antrean',
          actionKey: 'view_appointment',
          actionType: 'primary',
          url: `/admin/appointment-pasien`,
        },
      ],
    });

    // 2. Patient Requeued Rule
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.PATIENT_REQUEUED,
      category: 'appointment',
      defaultChannels: ['in_app'],
      resolveIntents: (payload: any) => {
        if (!payload.patientUserId) return [];
        return [
          {
            recipientUserId: payload.patientUserId,
            audience: NOTIFICATION_AUDIENCE.EXTERNAL,
            title: 'Antrean Digeser',
            body: `Nomor antrean ${payload.ticketNumber || '-'} digeser 3 posisi ke belakang. Sisa kesempatan panggilan: ${payload.remainingAttempts} kali.`,
            severity: 'info',
            badgeIcon: 'clock',
            isUrgent: false,
            action: {
              type: 'view_queue',
              params: { appointmentId: payload.appointmentId || '' },
              label: 'Lihat Antrean',
            },
            presentation: { toast: true },
          },
        ];
      },
      resolveRecipients: (payload: any) => payload.patientUserId,
      titleTemplate: 'Antrean Digeser',
      bodyTemplate: (payload: any) =>
        `Nomor antrean ${payload.ticketNumber || '-'} digeser 3 posisi ke belakang. Sisa kesempatan panggilan: ${payload.remainingAttempts} kali.`,
      isUrgent: false,
      badgeIcon: 'clock',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
    });

    // 3. Patient No-Show Rule
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.NO_SHOW,
      category: 'appointment',
      defaultChannels: ['in_app', 'push'],
      resolveIntents: async (
        payload: any,
        actor?: any,
      ): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];

        // Intent 1: Patient notification
        if (payload.patientUserId) {
          intents.push({
            recipientUserId: payload.patientUserId,
            audience: NOTIFICATION_AUDIENCE.EXTERNAL,
            title: 'Panggilan Terlewati (No-Show)',
            body: payload.doctorName
              ? `Pasien tidak hadir pada pemeriksaan ${payload.doctorName} di ${payload.poliklinikName || 'Poli'}. Status: No-Show.`
              : `Pasien tidak hadir setelah ${payload.totalAttempts || 3} kali pemanggilan di ${payload.poliklinikName || 'Poli'}. Status: No-Show.`,
            severity: 'error',
            badgeIcon: 'alert-circle',
            visualKey: payload.avatarUrl ?? null,
            senderName: payload.doctorName || 'Dokter',
            senderRole: 'Dokter',
            isUrgent: true,
            presentation: { toast: true },
          });
        }

        // Intent 2: Clinic Staff & Doctor Alert
        if (this.recipientResolver && payload.staffId) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.staffId,
            );

          for (const staffUserId of clinicUserIds) {
            const isActorStaff = actor?.userId === staffUserId;
            intents.push({
              recipientUserId: staffUserId,
              audience: NOTIFICATION_AUDIENCE.INTERNAL,
              title: 'Pasien Tidak Hadir (No-Show)',
              body: payload.doctorName
                ? `Pasien ${payload.patientName || 'Pasien'} (${payload.ticketNumber || payload.queueNumber || '-'}) ditandai tidak hadir (No-Show) oleh ${payload.doctorName}.`
                : `Pasien ${payload.patientName || 'Pasien'} (${payload.ticketNumber || payload.queueNumber || '-'}) ditandai tidak hadir (No-Show) setelah ${payload.totalAttempts || 3} kali pemanggilan.`,
              severity: 'warning',
              badgeIcon: 'alert-circle',
              visualKey: payload.avatarUrl ?? null,
              senderName: payload.doctorName || 'Dokter',
              senderRole: 'Dokter',
              isUrgent: true,
              presentation: { toast: !isActorStaff },
            });
          }
        }

        return intents;
      },
      resolveRecipients: async (payload: any) => {
        const recipients: string[] = [];
        if (payload.patientUserId) recipients.push(payload.patientUserId);
        if (this.recipientResolver && payload.staffId) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.staffId,
            );
          recipients.push(...clinicUserIds);
        }
        return recipients;
      },
      titleTemplate: 'Pasien Tidak Hadir (No-Show)',
      bodyTemplate: (payload: any) =>
        `Pasien ${payload.patientName || 'Pasien'} (${payload.ticketNumber || payload.queueNumber || '-'}) ditandai tidak hadir (No-Show).`,
      isUrgent: true,
      badgeIcon: 'alert-circle',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
    });

    // 4. Appointment Completed Rule
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.COMPLETED,
      category: 'clinical',
      defaultChannels: ['in_app', 'push'],
      resolveIntents: async (
        payload: any,
        actor?: any,
      ): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];

        // Intent 1: Patient notification
        if (payload.patientUserId) {
          intents.push({
            recipientUserId: payload.patientUserId,
            audience: NOTIFICATION_AUDIENCE.EXTERNAL,
            title: 'Pemeriksaan Selesai',
            body: `Konsultasi dan pemeriksaan medis di ${payload.poliklinikName || 'Poli'} telah selesai.`,
            severity: 'success',
            badgeIcon: 'check-circle',
            visualKey: payload.avatarUrl ?? null,
            senderName: payload.doctorName || 'Dokter',
            senderRole: 'Dokter',
            isUrgent: false,
            presentation: { toast: true },
          });
        }

        // Intent 2: Clinic Staff & Admin Notification
        if (this.recipientResolver) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.staffId,
            );

          for (const staffUserId of clinicUserIds) {
            const isActorStaff = actor?.userId === staffUserId;
            intents.push({
              recipientUserId: staffUserId,
              audience: NOTIFICATION_AUDIENCE.INTERNAL,
              title: 'Pemeriksaan Selesai',
              body: payload.doctorName
                ? `${payload.doctorName} telah menyelesaikan pemeriksaan pasien ${payload.patientName || 'Pasien'} (${payload.ticketNumber || payload.queueNumber || '-'}).`
                : `Pemeriksaan antrean ${payload.ticketNumber || payload.queueNumber || '-'} (${payload.patientName || 'Pasien'}) telah selesai.`,
              severity: 'success',
              badgeIcon: 'check-circle',
              visualKey: payload.avatarUrl ?? null,
              senderName: payload.doctorName || 'Dokter',
              senderRole: 'Dokter',
              isUrgent: false,
              action: {
                type: 'view_patient',
                params: { appointmentId: payload.appointmentId || '' },
                label: 'Lihat Detail',
              },
              presentation: { toast: !isActorStaff },
            });
          }
        }

        return intents;
      },
      resolveRecipients: async (payload: any) => {
        const recipients: string[] = [];
        if (payload.patientUserId) recipients.push(payload.patientUserId);
        if (this.recipientResolver) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.staffId,
            );
          recipients.push(...clinicUserIds);
        }
        return recipients;
      },
      titleTemplate: 'Pemeriksaan Selesai',
      bodyTemplate: (payload: any) =>
        `Konsultasi dan pemeriksaan medis di ${payload.poliklinikName || 'Poli'} telah selesai.`,
      isUrgent: false,
      badgeIcon: 'check-circle',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
    });

    // 5. Appointment Rescheduled Rule (Duplex: Patient-initiated or Admin-initiated)
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.RESCHEDULED,
      category: 'appointment',
      defaultChannels: ['in_app', 'push'],
      resolveIntents: async (
        payload: any,
        actor?: any,
      ): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];
        const isClinicActor =
          (payload.rescheduledByAudience ?? actor?.audience) ===
          NOTIFICATION_AUDIENCE.INTERNAL;

        const timeInfo = payload.targetStartTime
          ? ` (${payload.targetStartTime.slice(0, 5)})`
          : '';

        // 1. Patient Notification
        if (payload.patientUserId) {
          intents.push({
            recipientUserId: payload.patientUserId,
            audience: NOTIFICATION_AUDIENCE.EXTERNAL,
            title: 'Jadwal Diperbarui',
            body: isClinicActor
              ? `Jadwal konsultasi Anda${timeInfo} dipindahkan ke tanggal ${payload.targetDate} oleh ${payload.actorName || 'pihak klinik'}.`
              : `Jadwal Anda berhasil dipindahkan ke tanggal ${payload.targetDate}.`,
            severity: isClinicActor ? 'info' : 'success',
            badgeIcon: 'calendar',
            visualKey: payload.avatarUrl ?? null,
            senderName:
              payload.actorName || payload.doctorName || 'Klinik Amanah',
            senderRole:
              payload.actorRoleName || (isClinicActor ? 'Klinik' : 'Pasien'),
            action: {
              type: 'view_queue',
              params: { appointmentId: payload.appointmentId || '' },
              label: 'Lihat Antrean',
            },
            presentation: { toast: isClinicActor },
          });
        }

        // 2. Clinic Staff & Doctor Notification
        if (this.recipientResolver) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.practitionerId || payload.staffId,
            );
          for (const staffUserId of clinicUserIds) {
            const isActorStaff = actor?.userId === staffUserId;
            intents.push({
              recipientUserId: staffUserId,
              audience: NOTIFICATION_AUDIENCE.INTERNAL,
              title: 'Jadwal Dijadwalkan Ulang',
              body: `Jadwal pasien ${payload.patientName || 'Pasien'} (${payload.queueNumber || '-'}) dipindahkan ke tanggal ${payload.targetDate}${timeInfo}. Alasan: ${payload.reason || '-'}.`,
              severity: 'info',
              badgeIcon: 'calendar',
              visualKey: payload.avatarUrl || null,
              senderName: isClinicActor
                ? 'Klinik Amanah'
                : payload.patientName || 'Pasien',
              senderRole: isClinicActor ? 'Staf' : 'Pasien',
              action: {
                type: 'view_schedule_detail',
                params: {
                  doctorId: payload.practitionerId || payload.staffId || '',
                  date: payload.targetDate || '',
                },
                label: 'Lihat Jadwal',
              },
              actions: [
                {
                  label: 'Lihat Jadwal',
                  actionKey: 'view_schedule',
                  actionType: 'primary',
                  url: `/admin/jadwal-dokter?selectedDoctorId=${payload.practitionerId || payload.staffId || ''}&dialog=detail&date=${payload.targetDate}&openPatients=true`,
                },
              ],
              presentation: { toast: !isActorStaff },
            });
          }
        }

        return intents;
      },
      resolveRecipients: async (payload: any) => {
        if (payload.rescheduledByAudience === NOTIFICATION_AUDIENCE.INTERNAL) {
          return payload.patientUserId ? [payload.patientUserId] : [];
        }
        if (this.recipientResolver) {
          return await this.recipientResolver.resolveScopedClinicRecipients(
            payload.practitionerId || payload.staffId,
          );
        }
        return [];
      },
      titleTemplate: (payload: any) =>
        payload.rescheduledByAudience === NOTIFICATION_AUDIENCE.INTERNAL
          ? 'Jadwal Janji Temu Diperbarui oleh Klinik'
          : 'Perubahan Jadwal Janji Temu Pasien',
      bodyTemplate: (payload: any) => {
        const timeInfo =
          payload.targetStartTime && payload.targetEndTime
            ? ` (${payload.targetStartTime} - ${payload.targetEndTime})`
            : payload.targetStartTime
              ? ` (${payload.targetStartTime.slice(0, 5)})`
              : '';
        if (payload.rescheduledByAudience === NOTIFICATION_AUDIENCE.INTERNAL) {
          return `Jadwal janji temu Anda telah dipindahkan ke tanggal ${payload.targetDate}${timeInfo}. Alasan: ${payload.reason || 'Penyesuaian jadwal'}.`;
        }
        return `Pasien ${payload.patientName || 'Pasien'} telah memindahkan jadwal ke tanggal ${payload.targetDate}${timeInfo}.`;
      },
      senderName: (payload: any) =>
        payload.rescheduledByAudience === NOTIFICATION_AUDIENCE.INTERNAL
          ? payload.actorName || 'Klinik Amanah'
          : payload.patientName || 'Pasien',
      senderRole: (payload: any) =>
        payload.rescheduledByAudience === NOTIFICATION_AUDIENCE.INTERNAL
          ? payload.actorRoleName || 'Klinik'
          : 'Pasien',
      visualKey: (payload: any) => payload.avatarUrl ?? null,
      isUrgent: false,
      badgeIcon: 'calendar',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
      resolveActions: (payload: any) => [
        {
          label: 'Lihat Jadwal',
          actionKey: 'view_schedule',
          actionType: 'primary',
          url: `/admin/jadwal-dokter?selectedDoctorId=${payload.practitionerId || payload.staffId || ''}&dialog=detail&date=${payload.targetDate}&openPatients=true`,
        },
      ],
    });

    // 6. Appointment Cancelled Rule (Bi-directional: Patient-initiated or Admin-initiated)
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.CANCELLED,
      category: 'appointment',
      defaultChannels: ['in_app', 'push'],
      resolveIntents: async (
        payload: any,
        actor?: any,
      ): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];
        const isClinicActor =
          (payload.cancelledByAudience ?? actor?.audience) ===
          NOTIFICATION_AUDIENCE.INTERNAL;

        // 1. Patient Notification
        if (payload.patientUserId) {
          intents.push({
            recipientUserId: payload.patientUserId,
            audience: NOTIFICATION_AUDIENCE.EXTERNAL,
            title: 'Janji Temu Dibatalkan',
            body: isClinicActor
              ? `Janji temu Anda (${payload.queueNumber || '-'}) dengan ${payload.doctorName || 'praktisi'} dibatalkan oleh ${payload.actorName || 'pihak klinik'}. Alasan: ${payload.reason || '-'}.`
              : `Janji temu Anda dengan ${payload.doctorName || 'praktisi'} telah berhasil dibatalkan.`,
            severity: isClinicActor ? 'error' : 'info',
            badgeIcon: 'alert-circle',
            visualKey: payload.avatarUrl ?? null,
            senderName:
              payload.actorName || payload.doctorName || 'Klinik Amanah',
            senderRole:
              payload.actorRoleName || (isClinicActor ? 'Klinik' : 'Pasien'),
            isUrgent: isClinicActor,
            presentation: { toast: isClinicActor },
          });
        }

        // 2. Clinic Staff & Doctor Notification
        if (this.recipientResolver) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.staffId || payload.practitionerId,
            );
          for (const staffUserId of clinicUserIds) {
            const isActorStaff = actor?.userId === staffUserId;
            intents.push({
              recipientUserId: staffUserId,
              audience: NOTIFICATION_AUDIENCE.INTERNAL,
              title: 'Janji Temu Dibatalkan',
              body: `${payload.patientName || 'Pasien'}\n${payload.queueNumber || '-'}`,
              severity: 'warning',
              badgeIcon: 'alert-circle',
              visualKey: payload.avatarUrl ?? null,
              senderName: isClinicActor
                ? payload.actorName || 'Klinik Amanah'
                : payload.patientName || 'Pasien',
              senderRole: isClinicActor
                ? payload.actorRoleName || 'Klinik'
                : 'Pasien',
              action: {
                type: 'view_schedule',
                params: {
                  doctorId: payload.staffId || payload.practitionerId || '',
                  date: payload.appointmentDate || '',
                },
                label: 'Lihat Jadwal',
              },
              actions: [
                {
                  label: 'Lihat Jadwal',
                  actionKey: 'view_schedule',
                  actionType: 'primary',
                  url: `/admin/jadwal-dokter`,
                },
              ],
              isUrgent: true,
              presentation: { toast: !isActorStaff },
            });
          }
        }

        return intents;
      },
      resolveRecipients: async (payload: any) => {
        if (payload.cancelledByAudience === NOTIFICATION_AUDIENCE.INTERNAL) {
          return payload.patientUserId ? [payload.patientUserId] : [];
        }
        if (this.recipientResolver) {
          return await this.recipientResolver.resolveScopedClinicRecipients(
            payload.staffId || payload.practitionerId,
          );
        }
        return [];
      },
      titleTemplate: (payload: any) =>
        payload.cancelledByAudience === NOTIFICATION_AUDIENCE.INTERNAL
          ? 'Janji Temu Dibatalkan oleh Klinik'
          : 'Pembatalan Janji Temu Pasien',
      bodyTemplate: (payload: any) => {
        if (payload.cancelledByAudience === NOTIFICATION_AUDIENCE.INTERNAL) {
          return `Janji temu Anda (${payload.queueNumber || '-'}) telah dibatalkan oleh pihak klinik. Alasan: ${payload.reason || 'Dibatalkan oleh pihak klinik'}.`;
        }
        return `${payload.patientName || 'Pasien'}\n${payload.queueNumber || '-'}`;
      },
      senderName: (payload: any) =>
        payload.cancelledByAudience === NOTIFICATION_AUDIENCE.INTERNAL
          ? payload.actorName || 'Klinik Amanah'
          : payload.patientName || 'Pasien',
      senderRole: (payload: any) =>
        payload.cancelledByAudience === NOTIFICATION_AUDIENCE.INTERNAL
          ? payload.actorRoleName || 'Klinik'
          : 'Pasien',
      visualKey: (payload: any) => payload.avatarUrl ?? null,
      isUrgent: true,
      badgeIcon: 'alert-circle',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
      resolveActions: () => [
        {
          label: 'Lihat Jadwal',
          actionKey: 'view_schedule',
          actionType: 'primary',
          url: `/admin/jadwal-dokter`,
        },
      ],
    });

    // 7. Appointment Assignment Updated Rule (Doctor or Room changed by Admin)
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.ASSIGNMENT_UPDATED,
      category: 'appointment',
      defaultChannels: ['in_app', 'push'],
      resolveIntents: async (
        payload: any,
        actor?: any,
      ): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];
        const isPractitionerChange =
          payload.changeType === 'doctor' ||
          payload.changeType === 'practitioner';

        // 1. Notify Patient (Audience: external)
        if (payload.patientUserId) {
          const isActorPatient = actor?.userId === payload.patientUserId;
          if (!isActorPatient) {
            const patientTitle = isPractitionerChange
              ? 'Perubahan Praktisi Janji Temu'
              : 'Perubahan Ruangan Janji Temu';
            const patientBody = isPractitionerChange
              ? `Praktisi janji temu Anda telah dialihkan ke ${payload.doctorName || payload.practitionerName || 'praktisi baru'}.`
              : `Ruangan janji temu Anda telah dialihkan ke ${payload.roomName || 'ruangan baru'}.`;

            intents.push({
              recipientUserId: payload.patientUserId,
              audience: NOTIFICATION_AUDIENCE.EXTERNAL,
              title: patientTitle,
              body: patientBody,
              severity: 'info',
              badgeIcon: 'stethoscope',
              visualKey: payload.avatarUrl ?? null,
              senderName: payload.actorName || 'Klinik Amanah',
              senderRole: payload.actorRoleName || 'Klinik',
              action: {
                type: 'view_queue',
                params: { appointmentId: payload.appointmentId || '' },
                label: 'Lihat Antrean',
              },
              presentation: { toast: true },
            });
          }
        }

        // 2. Notify assigned practitioner or broadcast clinical staff (Audience: internal)
        if (this.recipientResolver) {
          if (isPractitionerChange) {
            // Specific Doctor Assignment Alert: Send strictly to the assigned doctor
            if (payload.staffId) {
              const assignedDoctorUserId =
                await this.recipientResolver.resolveAssignedPractitionerUserId(
                  payload.staffId,
                );

              if (assignedDoctorUserId) {
                const isActorDoctor = actor?.userId === assignedDoctorUserId;
                intents.push({
                  recipientUserId: assignedDoctorUserId,
                  audience: NOTIFICATION_AUDIENCE.INTERNAL,
                  title: 'Penugasan Pasien Baru',
                  body: `Anda telah ditugaskan untuk menangani pasien ${payload.patientName || 'Pasien'} (${payload.queueNumber || '-'}).`,
                  severity: 'info',
                  badgeIcon: 'stethoscope',
                  visualKey: payload.avatarUrl ?? null,
                  senderName: payload.actorName || 'Klinik Amanah',
                  senderRole: payload.actorRoleName || 'Klinik',
                  action: {
                    type: 'view_schedule_detail',
                    params: {
                      doctorId: payload.staffId || '',
                      date: payload.scheduledDate || '',
                    },
                    label: 'Lihat Jadwal',
                  },
                  actions: [
                    {
                      label: 'Lihat Jadwal',
                      actionKey: 'view_schedule',
                      actionType: 'primary',
                      url: `/admin/jadwal-dokter?selectedDoctorId=${payload.staffId || ''}&dialog=detail&date=${payload.scheduledDate}&openPatients=true`,
                    },
                  ],
                  presentation: {
                    toast: !isActorDoctor,
                  },
                });
              }
            }
          } else {
            // Room Assignment: Broadcast to ALL active clinical practitioners
            const clinicalUserIds =
              await this.recipientResolver.resolveAllClinicalPractitionerUserIds();

            for (const clinicalUserId of clinicalUserIds) {
              const isActorClinical = actor?.userId === clinicalUserId;
              intents.push({
                recipientUserId: clinicalUserId,
                audience: NOTIFICATION_AUDIENCE.INTERNAL,
                title: 'Pembaruan Ruangan Pasien',
                body: `Ruangan periksa pasien ${payload.patientName || 'Pasien'} (${payload.queueNumber || '-'}) dialihkan ke ${payload.roomName || 'ruangan baru'}.`,
                severity: 'info',
                badgeIcon: 'stethoscope',
                visualKey: payload.avatarUrl ?? null,
                senderName: payload.actorName || 'Klinik Amanah',
                senderRole: payload.actorRoleName || 'Klinik',
                action: {
                  type: 'view_schedule_detail',
                  params: {
                    doctorId: payload.staffId || '',
                    date: payload.scheduledDate || '',
                  },
                  label: 'Lihat Jadwal',
                },
                actions: [
                  {
                    label: 'Lihat Jadwal',
                    actionKey: 'view_schedule',
                    actionType: 'primary',
                    url: `/admin/jadwal-dokter?selectedDoctorId=${payload.staffId || ''}&dialog=detail&date=${payload.scheduledDate}&openPatients=true`,
                  },
                ],
                presentation: {
                  toast: !isActorClinical,
                },
              });
            }
          }
        }

        return intents;
      },
      resolveRecipients: (payload: any) => {
        return payload.patientUserId ? [payload.patientUserId] : [];
      },
      titleTemplate: (payload: any) =>
        payload.title ||
        (payload.changeType === 'doctor' ||
        payload.changeType === 'practitioner'
          ? 'Perubahan Praktisi Janji Temu'
          : 'Perubahan Ruangan Janji Temu'),
      bodyTemplate: (payload: any) => {
        if (payload.message) return payload.message;
        if (
          payload.changeType === 'doctor' ||
          payload.changeType === 'practitioner'
        ) {
          return `Praktisi dialihkan ke ${payload.doctorName || payload.practitionerName || 'praktisi baru'}.`;
        }
        return `Ruangan dialihkan ke ${payload.roomName || 'ruangan baru'}.`;
      },
      senderName: 'Klinik Amanah',
      senderRole: 'Klinik',
      visualKey: (payload: any) => payload.avatarUrl ?? null,
      isUrgent: false,
      badgeIcon: 'stethoscope',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
      resolveActions: (payload: any) => [
        {
          label: 'Lihat Jadwal',
          actionKey: 'view_schedule',
          actionType: 'primary',
          url: `/admin/jadwal-dokter?selectedDoctorId=${payload.staffId || ''}&dialog=detail&date=${payload.scheduledDate}&openPatients=true`,
        },
      ],
    });

    // 8. Appointment Checked-In Rule (Patient check-in -> Alert assigned doctor & clinic frontdesk)
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.CHECKED_IN,
      category: 'appointment',
      defaultChannels: ['in_app', 'push'],
      resolveIntents: async (
        payload: any,
        actor?: any,
      ): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];

        // 1. Notify Patient (confirmation)
        if (payload.patientUserId) {
          intents.push({
            recipientUserId: payload.patientUserId,
            audience: NOTIFICATION_AUDIENCE.EXTERNAL,
            title: 'Check-In Berhasil',
            body: `Nomor antrean Anda ${payload.queueNumber || '-'}. Silakan menunggu panggilan di ${payload.roomName || 'ruang tunggu'}.`,
            severity: 'success',
            badgeIcon: 'check-circle',
            action: {
              type: 'view_queue',
              params: { appointmentId: payload.appointmentId || '' },
              label: 'Lihat Antrean',
            },
            presentation: { toast: true },
          });
        }

        // 2. Notify Assigned Doctor & Clinic Staff
        if (this.recipientResolver && payload.staffId) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.staffId,
            );

          for (const staffUserId of clinicUserIds) {
            const isActorStaff = actor?.userId === staffUserId;
            intents.push({
              recipientUserId: staffUserId,
              audience: NOTIFICATION_AUDIENCE.INTERNAL,
              title: 'Pasien Telah Check-In',
              body: `Pasien ${payload.patientName || 'Pasien'} (Nomor antrean ${payload.queueNumber || '-'}) telah hadir di klinik dan menunggu di ruang tunggu.`,
              severity: 'info',
              badgeIcon: 'user-check',
              action: {
                type: 'view_patient',
                params: { appointmentId: payload.appointmentId || '' },
                label: 'Lihat Antrean',
              },
              presentation: { toast: !isActorStaff },
            });
          }
        }

        return intents;
      },
      resolveRecipients: async (payload: any) => {
        const recipients: string[] = [];
        if (payload.patientUserId) recipients.push(payload.patientUserId);
        if (this.recipientResolver && payload.staffId) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.staffId,
            );
          recipients.push(...clinicUserIds);
        }
        return recipients;
      },
      titleTemplate: 'Pasien Telah Check-In',
      bodyTemplate: (payload: any) =>
        `Pasien ${payload.patientName || 'Pasien'} (${payload.queueNumber || '-'}) telah hadir di klinik dan menunggu di ruang tunggu.`,
      isUrgent: false,
      badgeIcon: 'user-check',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
    });
  }
}
