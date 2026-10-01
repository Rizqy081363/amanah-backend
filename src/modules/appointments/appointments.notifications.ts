import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
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
      resolveRecipients: async (payload: any) => {
        const recipients: string[] = [];
        if (payload.patientUserId) {
          recipients.push(payload.patientUserId);
        }
        if (this.recipientResolver) {
          const staffUserIds =
            await this.recipientResolver.resolveAdminAndStaffUserIds();
          recipients.push(...staffUserIds);
        }
        return Array.from(new Set(recipients));
      },
      titleTemplate: 'Pendaftaran Janji Temu Berhasil',
      bodyTemplate: (payload: any) =>
        `Nomor antrean ${payload.queueNumber || '-'} atas nama ${payload.patientName || 'Pasien'} telah berhasil dikonfirmasi untuk tanggal ${payload.appointmentDate} (Sesi ${payload.session}).`,
      senderName: (payload: any) => payload.patientName || 'Pasien',
      senderRole: 'Pasien',
      visualKey: (payload: any) => payload.patientAvatarUrl || null,
      isUrgent: false,
      badgeIcon: 'calendar',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
      resolveActions: (payload: any) => [
        {
          label: 'Lihat Antrean',
          actionKey: 'view_appointment',
          actionType: 'primary',
          url: `/dashboard/appointments/${payload.appointmentId}`,
        },
      ],
    });

    // 1. Patient Called Rule
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.PATIENT_CALLED,
      category: 'appointment',
      defaultChannels: ['in_app'],
      resolveRecipients: (payload: any) => payload.patientUserId,
      titleTemplate: 'Panggilan Antrean Pasien',
      bodyTemplate: (payload: any) =>
        `Nomor antrean ${payload.ticketNumber || '-'} dipanggil ke ${payload.poliklinikName || 'Poli'}. Panggilan ke-${payload.attemptNumber} dari ${payload.maxAttempts}. Silakan segera menuju ruang periksa.`,
      isUrgent: true,
      badgeIcon: 'bell',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
      resolveActions: (payload: any) => [
        {
          label: 'Lihat Detail',
          actionKey: 'view_appointment',
          actionType: 'primary',
          url: `/appointments/${payload.appointmentId}`,
        },
      ],
    });

    // 2. Patient Requeued Rule
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.PATIENT_REQUEUED,
      category: 'appointment',
      defaultChannels: ['in_app'],
      resolveRecipients: (payload: any) => payload.patientUserId,
      titleTemplate: 'Antrean Digeser ke Belakang',
      bodyTemplate: (payload: any) =>
        `Anda belum memasuki ruang periksa pada panggilan ke-${payload.attemptNumber}. Nomor antrean ${payload.ticketNumber || '-'} telah digeser 3 posisi ke belakang. Sisa kesempatan panggilan: ${payload.remainingAttempts} kali.`,
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
      resolveRecipients: (payload: any) => payload.patientUserId,
      titleTemplate: 'Janji Temu Dibatalkan (Tidak Hadir)',
      bodyTemplate: (payload: any) =>
        `Anda tidak hadir setelah ${payload.totalAttempts} kali pemanggilan. Janji temu untuk ${payload.poliklinikName || 'Poli'} ditandai Tidak Hadir (No-Show). Silakan lakukan pendaftaran ulang jika masih membutuhkan pelayanan.`,
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
      resolveRecipients: (payload: any) => payload.patientUserId,
      titleTemplate: 'Pemeriksaan Selesai',
      bodyTemplate: (payload: any) =>
        `Konsultasi dan pemeriksaan medis di ${payload.poliklinikName || 'Poli'} telah selesai. Terima kasih telah mempercayakan layanan kesehatan Anda di Klinik Amanah.`,
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
      resolveRecipients: async (payload: any) => {
        if (
          payload.rescheduledByRole === 'admin' ||
          payload.rescheduledByRole === 'staff'
        ) {
          return payload.patientUserId ? [payload.patientUserId] : [];
        }
        const recipients: string[] = [];
        if (this.recipientResolver) {
          const staffUserIds =
            await this.recipientResolver.resolveAdminAndStaffUserIds();
          recipients.push(...staffUserIds);
        }
        if (payload.patientUserId) {
          recipients.push(payload.patientUserId);
        }
        return Array.from(new Set(recipients));
      },
      titleTemplate: (payload: any) =>
        payload.rescheduledByRole === 'admin' ||
        payload.rescheduledByRole === 'staff'
          ? 'Jadwal Janji Temu Diperbarui oleh Klinik'
          : 'Perubahan Jadwal Janji Temu Pasien',
      bodyTemplate: (payload: any) => {
        const timeInfo =
          payload.targetStartTime && payload.targetEndTime
            ? `${payload.targetStartTime} - ${payload.targetEndTime}`
            : `Sesi ${payload.session || '-'}`;
        const locInfo = payload.roomName
          ? ` di ${payload.roomName}`
          : payload.poliklinikName
            ? ` di ${payload.poliklinikName}`
            : '';

        if (
          payload.rescheduledByRole === 'admin' ||
          payload.rescheduledByRole === 'staff'
        ) {
          return `Janji temu Anda (${payload.queueNumber || '-'}) dengan ${payload.doctorName || 'Dokter'} telah dipindahkan ke tanggal ${payload.targetDate} (${timeInfo})${locInfo}. Alasan: ${payload.reason || 'Penyesuaian jadwal dokter'}.`;
        }
        return `Pasien ${payload.patientName || 'Pasien'} (${payload.queueNumber || '-'}) telah memindahkan jadwal janji temu ke tanggal ${payload.targetDate} (${timeInfo})${locInfo} dengan ${payload.doctorName || 'Dokter'}. Alasan: ${payload.reason || 'Diajukan oleh pasien'}.`;
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
          label: 'Lihat Antrean',
          actionKey: 'view_appointment',
          actionType: 'primary',
          url: `/dashboard/appointments/${payload.appointmentId}`,
        },
      ],
    });

    // 6. Appointment Cancelled Rule (Bi-directional: Patient-initiated or Admin-initiated)
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.CANCELLED,
      category: 'appointment',
      defaultChannels: ['in_app'],
      resolveRecipients: async (payload: any) => {
        if (
          payload.cancelledByRole === 'admin' ||
          payload.cancelledByRole === 'staff'
        ) {
          return payload.patientUserId ? [payload.patientUserId] : [];
        }
        if (this.recipientResolver) {
          return await this.recipientResolver.resolveAdminAndStaffUserIds();
        }
        return [];
      },
      titleTemplate: (payload: any) =>
        payload.cancelledByRole === 'admin' ||
        payload.cancelledByRole === 'staff'
          ? 'Janji Temu Dibatalkan oleh Klinik'
          : 'Pembatalan Janji Temu Pasien',
      bodyTemplate: (payload: any) => {
        const timeInfo =
          payload.scheduledStartTime && payload.scheduledEndTime
            ? `${payload.scheduledStartTime} - ${payload.scheduledEndTime}`
            : `Sesi ${payload.session || '-'}`;
        const locInfo = payload.roomName
          ? ` di ${payload.roomName}`
          : payload.poliklinikName
            ? ` di ${payload.poliklinikName}`
            : '';

        if (
          payload.cancelledByRole === 'admin' ||
          payload.cancelledByRole === 'staff'
        ) {
          return `Janji temu Anda (${payload.queueNumber || '-'}) dengan ${payload.doctorName || 'Dokter'} pada tanggal ${payload.appointmentDate} (${timeInfo})${locInfo} telah dibatalkan oleh pihak klinik. Alasan: ${payload.reason || 'Dibatalkan oleh staf'}.`;
        }
        return `Pasien ${payload.patientName || 'Pasien'} membatalkan janji temu (${payload.queueNumber || '-'}) dengan ${payload.doctorName || 'Dokter'} untuk tanggal ${payload.appointmentDate} (${timeInfo})${locInfo}. Alasan: ${payload.reason || 'Dibatalkan oleh pasien'}. Slot kuota telah dipulihkan.`;
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
          label: 'Lihat Antrean',
          actionKey: 'view_appointment',
          actionType: 'primary',
          url: `/dashboard/appointments/${payload.appointmentId}`,
        },
      ],
    });
  }
}
