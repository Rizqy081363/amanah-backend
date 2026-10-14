export class AppointmentDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class StaleStatusError extends AppointmentDomainError {
  constructor(
    appointmentId: string,
    expectedStatus: string,
    currentStatus?: string,
  ) {
    super(
      'STALE_STATUS',
      `Janji temu ${appointmentId} telah diperbarui oleh pengguna lain. Status saat ini tidak sesuai (diharapkan: ${expectedStatus}).`,
      { appointmentId, expectedStatus, currentStatus },
    );
  }
}

export class InvalidStatusTransitionError extends AppointmentDomainError {
  constructor(fromStatus: string, toStatus: string) {
    super(
      'INVALID_STATUS_TRANSITION',
      `Transisi status dari "${fromStatus}" ke "${toStatus}" tidak diizinkan.`,
      { fromStatus, toStatus },
    );
  }
}

export class AppointmentNotFoundError extends AppointmentDomainError {
  constructor(appointmentId: string) {
    super(
      'APPOINTMENT_NOT_FOUND',
      `Janji temu dengan ID "${appointmentId}" tidak ditemukan.`,
      { appointmentId },
    );
  }
}

export class AppointmentNotCallableError extends AppointmentDomainError {
  constructor(appointmentId: string, currentStatus: string) {
    super(
      'APPOINTMENT_NOT_CALLABLE',
      `Hanya janji temu dengan status WAITING yang dapat dipanggil. Status saat ini: "${currentStatus}".`,
      { appointmentId, currentStatus },
    );
  }
}

export class SchedulePolicyNotFoundError extends AppointmentDomainError {
  constructor(practitionerId: string, date: string) {
    super(
      'SCHEDULE_POLICY_NOT_FOUND',
      `Kebijakan jadwal tidak ditemukan untuk praktisi "${practitionerId}" pada tanggal ${date}.`,
      { practitionerId, date },
    );
  }
}

export class DailyQuotaExceededError extends AppointmentDomainError {
  constructor(practitionerId: string, maxQuota: number) {
    super(
      'DAILY_QUOTA_EXCEEDED',
      `Kuota antrean harian untuk praktisi "${practitionerId}" telah tercapai (maksimal ${maxQuota}).`,
      { practitionerId, maxQuota },
    );
  }
}

export class PatientActiveTicketConflictError extends AppointmentDomainError {
  constructor(
    patientId: string,
    categoryId: string,
    queueDate: string,
    existingTicket?: Record<string, unknown>,
  ) {
    super(
      'ACTIVE_TICKET_CONFLICT',
      `Pasien sudah memiliki tiket antrean aktif (${existingTicket?.queueNumber || 'aktif'}) untuk kategori layanan ini pada tanggal ${queueDate}. Silakan gunakan tiket yang sudah ada atau batalkan terlebih dahulu (Rule H2).`,
      { patientId, categoryId, queueDate, existingTicket },
    );
  }
}

export class AppointmentMissingDoctorError extends AppointmentDomainError {
  constructor(appointmentId: string, actionName: string = 'operasi ini') {
    super(
      'MISSING_DOCTOR_ASSIGNMENT',
      `Dokter penanggung jawab belum ditugaskan untuk janji temu "${appointmentId}". Dokter wajib ditugaskan sebelum ${actionName}.`,
      { appointmentId, actionName },
    );
  }
}

export class AppointmentMissingRoomError extends AppointmentDomainError {
  constructor(appointmentId: string, actionName: string = 'operasi ini') {
    super(
      'MISSING_ROOM_ASSIGNMENT',
      `Ruangan periksa belum ditugaskan untuk janji temu "${appointmentId}". Ruangan wajib ditugaskan sebelum ${actionName}.`,
      { appointmentId, actionName },
    );
  }
}

export class AppointmentNotCheckedInError extends AppointmentDomainError {
  constructor(appointmentId: string, currentStatus: string) {
    super(
      'NOT_CHECKED_IN',
      `Pasien belum melakukan check-in kedatangan di klinik untuk janji temu "${appointmentId}" (status saat ini: "${currentStatus}"). Pasien wajib check-in terlebih dahulu sebelum pemeriksaan dapat dimulai.`,
      { appointmentId, currentStatus },
    );
  }
}

export class DoctorAlreadyServingError extends AppointmentDomainError {
  constructor(practitionerId: string, servingQueueNumber: number | string) {
    super(
      'DOCTOR_ALREADY_SERVING',
      `Dokter sedang memeriksa pasien lain (Nomor antrean ${servingQueueNumber}). Selesaikan pemeriksaan pasien tersebut terlebih dahulu sebelum memulai pemeriksaan baru.`,
      { practitionerId, servingQueueNumber },
    );
  }
}

export class AppointmentQueueTurnNotReachedError extends AppointmentDomainError {
  constructor(
    appointmentId: string,
    currentQueueNumber: number | string,
    earlierQueueNumber: number | string,
  ) {
    super(
      'QUEUE_TURN_NOT_REACHED',
      `Pasien belum giliran. Nomor antrean sebelumnya (${earlierQueueNumber}) masih menunggu dan harus diperiksa terlebih dahulu.`,
      { appointmentId, currentQueueNumber, earlierQueueNumber },
    );
  }
}
