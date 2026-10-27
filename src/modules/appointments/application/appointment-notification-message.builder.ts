export interface NotificationActorContext {
  userId?: string | null;
  roleCode?: string | null;
}

export interface AppointmentNotificationPayloadContext {
  appointmentId: string;
  patientId?: string | null;
  patientUserId?: string | null;
  patientName?: string | null;
  doctorName?: string | null;
  staffId?: string | null;
  poliklinikName?: string | null;
  roomName?: string | null;
  queueNumber?: number | string | null;
  ticketNumber?: string | null;
  attemptNumber?: number | null;
  maxAttempts?: number | null;
  status?: string | null;
  reason?: string | null;
}

export interface FormattedNotificationMessages {
  clinicTitle: string;
  clinicBody: string;
  doctorTitle: string;
  doctorBody: string;
  patientTitle: string;
  patientBody: string;
}

export class AppointmentNotificationMessageBuilder {
  static formatQueueNumber(
    ticketNumber?: string | null,
    queueNumber?: number | string | null,
  ): string {
    if (ticketNumber && ticketNumber.trim() !== '') return ticketNumber;
    if (queueNumber !== null && queueNumber !== undefined) {
      return String(queueNumber);
    }
    return '-';
  }

  static formatStatusLabel(status?: string | null): string {
    if (!status) return 'diperbarui';
    switch (status.toLowerCase()) {
      case 'in_service':
      case 'sedang_diperiksa':
        return 'sedang diproses';
      case 'completed':
      case 'selesai':
        return 'selesai';
      case 'cancelled':
      case 'batal':
        return 'dibatalkan';
      case 'no_show':
      case 'tidak_hadir':
        return 'tidak hadir';
      case 'waiting':
      case 'checked_in':
      case 'menunggu':
        return 'menunggu antrean';
      case 'late':
      case 'terlambat':
        return 'terlambat';
      default:
        return status;
    }
  }

  static buildDoctorStartedMessages(
    payload: AppointmentNotificationPayloadContext,
    _actor?: NotificationActorContext,
  ): FormattedNotificationMessages {
    const queueNum = this.formatQueueNumber(
      payload.ticketNumber,
      payload.queueNumber,
    );
    const patientName = payload.patientName || 'Pasien';
    const doctorPrefix = payload.doctorName
      ? payload.doctorName.startsWith('dr.') ||
        payload.doctorName.startsWith('Dokter')
        ? payload.doctorName
        : `Dokter ${payload.doctorName}`
      : 'Dokter';

    const location =
      payload.roomName || payload.poliklinikName || 'ruang periksa';
    const clinicTitle = 'Pemeriksaan Dimulai';
    const clinicBody = `${doctorPrefix} sedang memproses pasien ${patientName} dengan nomor antrean ${queueNum}.`;

    return {
      clinicTitle,
      clinicBody,
      doctorTitle: clinicTitle,
      doctorBody: clinicBody,
      patientTitle: 'Pemeriksaan Sedang Berlangsung',
      patientBody: `Pemeriksaan untuk antrean ${queueNum} di ${location} sedang berlangsung.`,
    };
  }

  static buildAdminStatusChangedMessages(
    payload: AppointmentNotificationPayloadContext,
    targetStatus: string,
    _actor?: NotificationActorContext,
  ): FormattedNotificationMessages {
    const queueNum = this.formatQueueNumber(
      payload.ticketNumber,
      payload.queueNumber,
    );
    const patientName = payload.patientName || 'Pasien';
    const statusLabel = this.formatStatusLabel(targetStatus);
    const doctorTitle = 'Status Janji Temu Diperbarui';
    const doctorBody = `Admin telah mengubah status pasien ${patientName} dengan nomor antrean ${queueNum} menjadi ${statusLabel}.`;

    return {
      doctorTitle,
      doctorBody,
      clinicTitle: doctorTitle,
      clinicBody: doctorBody,
      patientTitle: 'Status Janji Temu Diperbarui',
      patientBody: `Status antrean Anda ${queueNum} telah diperbarui menjadi ${statusLabel}.`,
    };
  }

  static buildPatientCalledMessages(
    payload: AppointmentNotificationPayloadContext,
    _actor?: NotificationActorContext,
  ): {
    clinicTitle: string;
    clinicBody: string;
    patientTitle: string;
    patientBody: string;
  } {
    const queueNum = this.formatQueueNumber(
      payload.ticketNumber,
      payload.queueNumber,
    );
    const patientName = payload.patientName || 'Pasien';
    const destination = payload.roomName
      ? `Ruangan ${payload.roomName}`
      : payload.poliklinikName || 'ruang periksa';
    const attemptInfo =
      payload.attemptNumber && payload.maxAttempts
        ? ` Panggilan ke-${payload.attemptNumber} dari ${payload.maxAttempts}.`
        : '';

    return {
      clinicTitle: 'Pasien Dipanggil',
      clinicBody: `Nomor antrean ${queueNum} (${patientName}) sedang dipanggil ke ${destination}.${attemptInfo}`,
      patientTitle: 'Panggilan Antrean',
      patientBody: `Anda dipanggil untuk antrean ${queueNum}. Silakan menuju ${destination}.${attemptInfo ? attemptInfo.trim() : ''}`,
    };
  }
}
