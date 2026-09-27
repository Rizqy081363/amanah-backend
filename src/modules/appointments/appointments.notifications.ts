import { Injectable, OnModuleInit } from '@nestjs/common';
import { NotificationRulesRegistry } from '../notifications/registry/notification-rules-registry';
import { APPOINTMENT_EVENTS } from './domain/constants/appointment-lifecycle.constants';

@Injectable()
export class AppointmentsNotificationRules implements OnModuleInit {
  constructor(private readonly registry: NotificationRulesRegistry) {}

  onModuleInit(): void {
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

    // 5. Appointment Rescheduled Rule
    this.registry.registerRule({
      eventType: APPOINTMENT_EVENTS.RESCHEDULED,
      category: 'appointment',
      defaultChannels: ['in_app'],
      resolveRecipients: (payload: any) => payload.patientUserId,
      titleTemplate: 'Jadwal Janji Temu Diperbarui',
      bodyTemplate: (payload: any) =>
        `Jadwal janji temu untuk ${payload.patientName || 'pasien'} telah berhasil dipindahkan ke tanggal ${payload.targetDate} (${payload.targetStartTime} - ${payload.targetEndTime}).`,
      isUrgent: false,
      badgeIcon: 'calendar',
      resolveSource: (payload: any) => ({
        sourceType: 'appointment',
        sourceId: payload.appointmentId,
      }),
    });
  }
}
