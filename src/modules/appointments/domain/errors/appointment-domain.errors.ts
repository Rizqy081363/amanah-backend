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
