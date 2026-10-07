import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { NotificationIntent } from '../notifications/domain/entities/notification-rule.entity';
import { NotificationRulesRegistry } from '../notifications/registry/notification-rules-registry';
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
      defaultChannels: ['in_app'],
      resolveIntents: async (
        payload: any,
        actor?: any,
      ): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];
        const isActorPatient =
          actor?.userId &&
          payload.patientUserId &&
          actor.userId === payload.patientUserId;

        // Intent 1: Patient Confirmation (Audience: 'patient')
        if (payload.patientUserId) {
          intents.push({
            recipientUserId: payload.patientUserId,
            audience: 'patient',
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
            visualKey: payload.doctorAvatarUrl || null,
            senderName: 'Klinik Amanah',
            senderRole: 'Sistem Pendaftaran',
            isUrgent: false,
            presentation: {
              // Fail-closed toast policy: If patient was the actor, local mutation toast is already shown
              toast: !isActorPatient,
            },
          });
        }

        // Intent 2: Clinic Staff Alert (Audience: 'clinic', Scoped: Admin + Frontdesk + Assigned Practitioner)
        if (this.recipientResolver) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.staffId,
            );

          for (const staffUserId of clinicUserIds) {
            const isActorStaff = actor?.userId === staffUserId;
            intents.push({
              recipientUserId: staffUserId,
              audience: 'clinic',
              title: 'Pasien Baru',
              body: payload.doctorName
                ? `${payload.doctorName} mendapatkan 1 pasien baru (${payload.patientName || 'Pasien'}).`
                : `Pasien baru ${payload.patientName || 'Pasien'} (${payload.queueNumber || '-'}) terdaftar untuk tanggal ${payload.appointmentDate}.`,
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
                  url: `/dashboard/jadwal-dokter?selectedDoctorId=${payload.staffId || ''}&dialog=detail&date=${payload.appointmentDate}&openPatients=true&highlightSlotTime=${payload.scheduledStartTime ? payload.scheduledStartTime.slice(0, 5) : ''}`,
                },
              ],
              badgeIcon: 'user-plus',
              visualKey: payload.patientAvatarUrl || null,
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
        payload.doctorName
          ? `${payload.doctorName} mendapatkan 1 pasien baru (${payload.patientName || 'Pasien'}).`
          : `Pasien baru ${payload.patientName || 'Pasien'} (${payload.queueNumber || '-'}) terdaftar untuk tanggal ${payload.appointmentDate}.`,
      senderName: (payload: any) => payload.patientName || 'Pasien',
      senderRole: 'Pasien',
      visualKey: (payload: any) => payload.patientAvatarUrl || null,
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
          url: `/dashboard/jadwal-dokter?selectedDoctorId=${payload.staffId || ''}&dialog=detail&date=${payload.appointmentDate}&openPatients=true&highlightSlotTime=${payload.scheduledStartTime ? payload.scheduledStartTime.slice(0, 5) : ''}`,
        },
      ],
    });

    // 1. Patient Called Rule
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.PATIENT_CALLED,
      category: 'appointment',
      defaultChannels: ['in_app'],
      resolveIntents: (payload: any) => {
        if (!payload.patientUserId) return [];
        const attemptInfo =
          payload.attemptNumber && payload.maxAttempts
            ? ` Panggilan ke-${payload.attemptNumber} dari ${payload.maxAttempts}.`
            : '';
        return [
          {
            recipientUserId: payload.patientUserId,
            audience: 'patient',
            title: 'Panggilan Antrean',
            body: `Nomor antrean ${payload.ticketNumber || '-'} dipanggil ke ${payload.poliklinikName || 'Poli'}.${attemptInfo} Segera menuju ruang periksa.`,
            severity: 'warning',
            badgeIcon: 'bell',
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
                url: `/dashboard/antrean-pasien`,
              },
            ],
            presentation: { toast: true },
          },
        ];
      },
      resolveRecipients: (payload: any) => payload.patientUserId,
      titleTemplate: 'Panggilan Antrean',
      bodyTemplate: (payload: any) => {
        const attemptInfo =
          payload.attemptNumber && payload.maxAttempts
            ? ` Panggilan ke-${payload.attemptNumber} dari ${payload.maxAttempts}.`
            : '';
        return `Nomor antrean ${payload.ticketNumber || '-'} dipanggil ke ${payload.poliklinikName || 'Poli'}.${attemptInfo} Segera menuju ruang periksa.`;
      },
      isUrgent: true,
      badgeIcon: 'bell',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
      resolveActions: (payload: any) => [
        {
          label: 'Lihat Antrean',
          actionKey: 'view_appointment',
          actionType: 'primary',
          url: `/dashboard/antrean-pasien`,
        },
      ],
    });

    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.PATIENT_RESPONDED,
      category: 'appointment',
      defaultChannels: ['in_app'],
      resolveIntents: (payload: any) => {
        if (!payload.patientUserId) return [];
        return [
          {
            recipientUserId: payload.patientUserId,
            audience: 'patient',
            title: 'Pemeriksaan Dimulai',
            body: `Pemeriksaan untuk antrean ${payload.ticketNumber || '-'} di ${payload.poliklinikName || 'Poli'} sedang berlangsung.`,
            severity: 'info',
            badgeIcon: 'stethoscope',
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
                url: `/dashboard/antrean-pasien`,
              },
            ],
            presentation: { toast: true },
          },
        ];
      },
      resolveRecipients: (payload: any) => payload.patientUserId,
      titleTemplate: 'Pemeriksaan Dimulai',
      bodyTemplate: (payload: any) =>
        `Pemeriksaan untuk antrean ${payload.ticketNumber || '-'} di ${payload.poliklinikName || 'Poli'} sedang berlangsung.`,
      isUrgent: false,
      badgeIcon: 'stethoscope',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
      resolveActions: (payload: any) => [
        {
          label: 'Lihat Antrean',
          actionKey: 'view_appointment',
          actionType: 'primary',
          url: `/dashboard/antrean-pasien`,
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
            audience: 'patient',
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
      defaultChannels: ['in_app'],
      resolveIntents: (payload: any) => {
        if (!payload.patientUserId) return [];
        return [
          {
            recipientUserId: payload.patientUserId,
            audience: 'patient',
            title: 'Janji Temu Dibatalkan',
            body: `Pasien tidak hadir setelah ${payload.totalAttempts} kali pemanggilan di ${payload.poliklinikName || 'Poli'}. Status: No-Show.`,
            severity: 'error',
            badgeIcon: 'alert-circle',
            isUrgent: true,
            presentation: { toast: true },
          },
        ];
      },
      resolveRecipients: (payload: any) => payload.patientUserId,
      titleTemplate: 'Janji Temu Dibatalkan',
      bodyTemplate: (payload: any) =>
        `Pasien tidak hadir setelah ${payload.totalAttempts} kali pemanggilan di ${payload.poliklinikName || 'Poli'}. Status: No-Show.`,
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
      defaultChannels: ['in_app'],
      resolveIntents: (payload: any) => {
        if (!payload.patientUserId) return [];
        return [
          {
            recipientUserId: payload.patientUserId,
            audience: 'patient',
            title: 'Pemeriksaan Selesai',
            body: `Konsultasi dan pemeriksaan medis di ${payload.poliklinikName || 'Poli'} telah selesai.`,
            severity: 'success',
            badgeIcon: 'check-circle',
            isUrgent: false,
            presentation: { toast: true },
          },
        ];
      },
      resolveRecipients: (payload: any) => payload.patientUserId,
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
      defaultChannels: ['in_app'],
      resolveIntents: async (
        payload: any,
        actor?: any,
      ): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];
        const isClinicActor =
          payload.rescheduledByRole === 'admin' ||
          payload.rescheduledByRole === 'staff';

        const timeInfo = payload.targetStartTime
          ? ` (${payload.targetStartTime.slice(0, 5)})`
          : '';

        if (isClinicActor) {
          // Admin changed schedule -> notify Patient
          if (payload.patientUserId) {
            intents.push({
              recipientUserId: payload.patientUserId,
              audience: 'patient',
              title: 'Jadwal Diperbarui',
              body: `Jadwal konsultasi Anda${timeInfo} dipindahkan ke tanggal ${payload.targetDate}.`,
              severity: 'info',
              badgeIcon: 'calendar',
              visualKey: payload.doctorAvatarUrl || null,
              senderName: 'Klinik Amanah',
              senderRole: 'Admin',
              action: {
                type: 'view_queue',
                params: { appointmentId: payload.appointmentId || '' },
                label: 'Lihat Antrean',
              },
              presentation: { toast: true },
            });
          }
        } else {
          // Patient changed schedule -> notify Clinic staff, and notify patient without duplicate toast
          if (this.recipientResolver) {
            const clinicUserIds =
              await this.recipientResolver.resolveScopedClinicRecipients(
                payload.practitionerId || payload.staffId,
              );
            for (const staffUserId of clinicUserIds) {
              intents.push({
                recipientUserId: staffUserId,
                audience: 'clinic',
                title: 'Jadwal Diperbarui',
                body: `Jadwal ${payload.doctorName || 'Dokter'}${timeInfo} dipindahkan ke tanggal ${payload.targetDate}.`,
                severity: 'info',
                badgeIcon: 'calendar',
                visualKey: payload.patientAvatarUrl || null,
                senderName: payload.patientName || 'Pasien',
                senderRole: 'Pasien',
                action: {
                  type: 'view_schedule_detail',
                  params: {
                    doctorId: payload.practitionerId || payload.staffId || '',
                    date: payload.targetDate || '',
                    slotTime: payload.targetStartTime || '',
                  },
                  label: 'Lihat Jadwal',
                },
                actions: [
                  {
                    label: 'Lihat Jadwal',
                    actionKey: 'view_schedule',
                    actionType: 'primary',
                    url: `/dashboard/jadwal-dokter?selectedDoctorId=${payload.practitionerId || payload.staffId || ''}&dialog=detail&date=${payload.targetDate}&highlightSlotTime=${payload.targetStartTime ? payload.targetStartTime.slice(0, 5) : ''}`,
                  },
                ],
                presentation: { toast: true },
              });
            }
          }

          if (payload.patientUserId) {
            intents.push({
              recipientUserId: payload.patientUserId,
              audience: 'patient',
              title: 'Jadwal Diperbarui',
              body: `Jadwal Anda berhasil dipindahkan ke tanggal ${payload.targetDate}.`,
              severity: 'success',
              badgeIcon: 'calendar',
              presentation: { toast: false }, // Patient was the actor
            });
          }
        }

        return intents;
      },
      resolveRecipients: async (payload: any) => {
        if (
          payload.rescheduledByRole === 'admin' ||
          payload.rescheduledByRole === 'staff'
        ) {
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
        payload.rescheduledByRole === 'admin' ||
        payload.rescheduledByRole === 'staff'
          ? 'Jadwal Janji Temu Diperbarui oleh Klinik'
          : 'Perubahan Jadwal Janji Temu Pasien',
      bodyTemplate: (payload: any) => {
        const timeInfo =
          payload.targetStartTime && payload.targetEndTime
            ? ` (${payload.targetStartTime} - ${payload.targetEndTime})`
            : payload.targetStartTime
              ? ` (${payload.targetStartTime.slice(0, 5)})`
              : '';
        if (
          payload.rescheduledByRole === 'admin' ||
          payload.rescheduledByRole === 'staff'
        ) {
          return `Jadwal janji temu Anda telah dipindahkan ke tanggal ${payload.targetDate}${timeInfo}. Alasan: ${payload.reason || 'Penyesuaian jadwal'}.`;
        }
        return `Pasien ${payload.patientName || 'Pasien'} telah memindahkan jadwal ke tanggal ${payload.targetDate}${timeInfo}.`;
      },
      senderName: (payload: any) =>
        payload.rescheduledByRole === 'admin' ||
        payload.rescheduledByRole === 'staff'
          ? 'Klinik Amanah'
          : payload.patientName || 'Pasien',
      senderRole: (payload: any) =>
        payload.rescheduledByRole === 'admin' ||
        payload.rescheduledByRole === 'staff'
          ? 'Admin'
          : 'Pasien',
      visualKey: (payload: any) =>
        payload.rescheduledByRole === 'admin' ||
        payload.rescheduledByRole === 'staff'
          ? payload.doctorAvatarUrl || null
          : payload.patientAvatarUrl || null,
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
          url: `/dashboard/jadwal-dokter?selectedDoctorId=${payload.practitionerId || payload.staffId || ''}&dialog=detail&date=${payload.targetDate}&highlightSlotTime=${payload.targetStartTime ? payload.targetStartTime.slice(0, 5) : ''}`,
        },
      ],
    });

    // 6. Appointment Cancelled Rule (Bi-directional: Patient-initiated or Admin-initiated)
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.CANCELLED,
      category: 'appointment',
      defaultChannels: ['in_app'],
      resolveIntents: async (
        payload: any,
        actor?: any,
      ): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];
        const isClinicActor =
          payload.cancelledByRole === 'admin' ||
          payload.cancelledByRole === 'staff';

        if (isClinicActor) {
          // Admin cancelled -> notify Patient
          if (payload.patientUserId) {
            intents.push({
              recipientUserId: payload.patientUserId,
              audience: 'patient',
              title: 'Janji Temu Dibatalkan',
              body: `Janji temu Anda (${payload.queueNumber || '-'}) dengan ${payload.doctorName || 'Dokter'} dibatalkan oleh klinik. Alasan: ${payload.reason || '-'}.`,
              severity: 'error',
              badgeIcon: 'alert-circle',
              visualKey: payload.doctorAvatarUrl || null,
              senderName: 'Klinik Amanah',
              senderRole: 'Admin',
              isUrgent: true,
              presentation: { toast: true },
            });
          }
        } else {
          // Patient cancelled -> notify Clinic staff, and notify patient with toast: false
          if (this.recipientResolver) {
            const clinicUserIds =
              await this.recipientResolver.resolveScopedClinicRecipients(
                payload.staffId,
              );
            for (const staffUserId of clinicUserIds) {
              intents.push({
                recipientUserId: staffUserId,
                audience: 'clinic',
                title: 'Janji Temu Dibatalkan',
                body: `Pasien ${payload.patientName || 'Pasien'} membatalkan janji temu (${payload.queueNumber || '-'}). Alasan: ${payload.reason || '-'}.`,
                severity: 'warning',
                badgeIcon: 'alert-circle',
                visualKey: payload.patientAvatarUrl || null,
                senderName: payload.patientName || 'Pasien',
                senderRole: 'Pasien',
                action: {
                  type: 'view_schedule',
                  params: {
                    doctorId: payload.staffId || '',
                    date: payload.appointmentDate || '',
                  },
                  label: 'Lihat Jadwal',
                },
                actions: [
                  {
                    label: 'Lihat Jadwal',
                    actionKey: 'view_schedule',
                    actionType: 'primary',
                    url: `/dashboard/jadwal-dokter`,
                  },
                ],
                isUrgent: true,
                presentation: { toast: true },
              });
            }
          }

          if (payload.patientUserId) {
            intents.push({
              recipientUserId: payload.patientUserId,
              audience: 'patient',
              title: 'Janji Temu Dibatalkan',
              body: `Janji temu Anda dengan ${payload.doctorName || 'Dokter'} telah berhasil dibatalkan.`,
              severity: 'info',
              badgeIcon: 'alert-circle',
              presentation: { toast: false }, // Patient was the actor
            });
          }
        }

        return intents;
      },
      resolveRecipients: async (payload: any) => {
        if (
          payload.cancelledByRole === 'admin' ||
          payload.cancelledByRole === 'staff'
        ) {
          return payload.patientUserId ? [payload.patientUserId] : [];
        }
        if (this.recipientResolver) {
          return await this.recipientResolver.resolveScopedClinicRecipients(
            payload.staffId,
          );
        }
        return [];
      },
      titleTemplate: (payload: any) =>
        payload.cancelledByRole === 'admin' ||
        payload.cancelledByRole === 'staff'
          ? 'Janji Temu Dibatalkan oleh Klinik'
          : 'Pembatalan Janji Temu Pasien',
      bodyTemplate: (payload: any) => {
        if (
          payload.cancelledByRole === 'admin' ||
          payload.cancelledByRole === 'staff'
        ) {
          return `Janji temu Anda (${payload.queueNumber || '-'}) telah dibatalkan oleh pihak klinik. Alasan: ${payload.reason || 'Dibatalkan oleh staf'}.`;
        }
        return `Pasien ${payload.patientName || 'Pasien'} membatalkan janji temu (${payload.queueNumber || '-'}). Alasan: ${payload.reason || 'Dibatalkan oleh pasien'}. Slot kuota telah dipulihkan.`;
      },
      senderName: (payload: any) =>
        payload.cancelledByRole === 'admin' ||
        payload.cancelledByRole === 'staff'
          ? 'Klinik Amanah'
          : payload.patientName || 'Pasien',
      senderRole: (payload: any) =>
        payload.cancelledByRole === 'admin' ||
        payload.cancelledByRole === 'staff'
          ? 'Admin'
          : 'Pasien',
      visualKey: (payload: any) =>
        payload.cancelledByRole === 'admin' ||
        payload.cancelledByRole === 'staff'
          ? payload.doctorAvatarUrl || null
          : payload.patientAvatarUrl || null,
      isUrgent: true,
      badgeIcon: 'alert-circle',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
      resolveActions: (payload: any) => [
        {
          label: 'Lihat Jadwal',
          actionKey: 'view_schedule',
          actionType: 'primary',
          url: `/dashboard/jadwal-dokter`,
        },
      ],
    });

    // 7. Appointment Assignment Updated Rule (Doctor or Room changed by Admin)
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.ASSIGNMENT_UPDATED,
      category: 'appointment',
      defaultChannels: ['in_app'],
      resolveIntents: async (payload: any): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];
        const changeTitle =
          payload.title ||
          (payload.changeType === 'doctor'
            ? 'Perubahan Dokter'
            : 'Perubahan Ruangan');
        const changeBody = payload.message
          ? payload.message
          : payload.changeType === 'doctor'
            ? `Dokter dialihkan ke ${payload.doctorName || 'dokter baru'}.`
            : `Ruangan dialihkan ke ${payload.roomName || 'ruangan baru'}.`;

        // 1. Notify Patient
        if (payload.patientUserId) {
          intents.push({
            recipientUserId: payload.patientUserId,
            audience: 'patient',
            title: changeTitle,
            body: changeBody,
            severity: 'info',
            badgeIcon: 'stethoscope',
            visualKey: payload.doctorAvatarUrl || null,
            senderName: 'Klinik Amanah',
            senderRole: 'Admin',
            action: {
              type: 'view_queue',
              params: { appointmentId: payload.appointmentId || '' },
              label: 'Lihat Antrean',
            },
            presentation: { toast: true },
          });
        }

        // 2. Notify newly assigned staff
        if (this.recipientResolver && payload.staffId) {
          const clinicUserIds =
            await this.recipientResolver.resolveScopedClinicRecipients(
              payload.staffId,
            );
          for (const staffUserId of clinicUserIds) {
            intents.push({
              recipientUserId: staffUserId,
              audience: 'clinic',
              title: changeTitle,
              body: changeBody,
              severity: 'info',
              badgeIcon: 'stethoscope',
              visualKey: payload.doctorAvatarUrl || null,
              senderName: 'Klinik Amanah',
              senderRole: 'Admin',
              action: {
                type: 'view_schedule_detail',
                params: {
                  doctorId: payload.staffId || '',
                  date: payload.scheduledDate || '',
                  slotTime: payload.scheduledStartTime || '',
                },
                label: 'Lihat Jadwal',
              },
              actions: [
                {
                  label: 'Lihat Jadwal',
                  actionKey: 'view_schedule',
                  actionType: 'primary',
                  url: `/dashboard/jadwal-dokter?selectedDoctorId=${payload.staffId || ''}&dialog=detail&date=${payload.scheduledDate}&highlightSlotTime=${payload.scheduledStartTime ? payload.scheduledStartTime.slice(0, 5) : ''}`,
                },
              ],
              presentation: { toast: true },
            });
          }
        }

        return intents;
      },
      resolveRecipients: (payload: any) => {
        return payload.patientUserId ? [payload.patientUserId] : [];
      },
      titleTemplate: (payload: any) =>
        payload.title ||
        (payload.changeType === 'doctor'
          ? 'Perubahan Dokter Janji Temu'
          : 'Perubahan Ruangan Janji Temu'),
      bodyTemplate: (payload: any) => {
        if (payload.message) return payload.message;
        if (payload.changeType === 'doctor') {
          return `Dokter dialihkan ke ${payload.doctorName || 'dokter baru'}.`;
        }
        return `Ruangan dialihkan ke ${payload.roomName || 'ruangan baru'}.`;
      },
      senderName: 'Klinik Amanah',
      senderRole: 'Admin',
      visualKey: (payload: any) => payload.doctorAvatarUrl || null,
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
          url: `/dashboard/jadwal-dokter?selectedDoctorId=${payload.staffId || ''}&dialog=detail&date=${payload.scheduledDate}&highlightSlotTime=${payload.scheduledStartTime ? payload.scheduledStartTime.slice(0, 5) : ''}`,
        },
      ],
    });
  }
}
