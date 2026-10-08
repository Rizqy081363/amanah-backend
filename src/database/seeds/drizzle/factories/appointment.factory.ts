import { fakerID_ID as faker } from '@faker-js/faker';

export interface CreateAppointmentSeedOptions {
  patientId: string;
  practitionerId: string;
  scheduleSessionId: string;
  serviceId: string;
  roomId: string;
  bookingCode?: string;
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  queueNumber?: number;
  visitType?: 'new_visit' | 'follow_up';
  status?: 'booked' | 'waiting' | 'in_service' | 'completed' | 'cancelled';
  complaint?: string;
}

export interface CreateQueueTicketSeedOptions {
  appointmentId: string;
  serviceId: string;
  roomId?: string;
  queueDate?: string;
  queueNumber?: string;
  priority?: 'regular' | 'priority' | 'emergency';
  status?: 'waiting' | 'called' | 'in_service' | 'completed' | 'cancelled';
  waitingPosition?: number | null;
}

const COMMON_COMPLAINTS = [
  'Pemeriksaan kesehatan rutin dan cek tensi berkala',
  'Demam ringan dan sakit kepala sejak dua hari yang lalu',
  'Batuk berdahak dan tenggorokan sakit sejak 3 hari',
  'Kontrol berkala gula darah dan konsultasi pola makan',
  'Nyeri sendi lutut terutama saat bangun tidur di pagi hari',
  'Konsultasi alergi kulit dan gatal-gatal kambuhan',
  'Pusing berputar (vertigo ringan) saat perubahan posisi',
  'Pemeriksaan kondisi fisik umum untuk surat keterangan sehat',
];

export class AppointmentFactory {
  /**
   * Generates a realistic clinical appointment record for development seeding.
   * Aligned with the queue-based ticketing paradigm (no artificial 30-min rigid slot carving).
   */
  static createAppointmentSeed(options: CreateAppointmentSeedOptions) {
    const complaint =
      options.complaint ||
      COMMON_COMPLAINTS[Math.floor(Math.random() * COMMON_COMPLAINTS.length)];

    return {
      bookingCode:
        options.bookingCode ||
        `BOOK-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
      patientId: options.patientId,
      practitionerId: options.practitionerId,
      scheduleSessionId: options.scheduleSessionId,
      serviceId: options.serviceId,
      roomId: options.roomId,
      visitType: options.visitType || 'new_visit',
      status: options.status || 'booked',
      scheduledDate: options.scheduledDate || 'current_date',
      scheduledStartTime: options.scheduledStartTime || '08:00',
      scheduledEndTime: options.scheduledEndTime || '12:00',
      queueNumber: options.queueNumber ?? 1,
      complaint,
    };
  }

  /**
   * Generates a realistic queue ticket record corresponding to an appointment.
   */
  static createQueueTicketSeed(options: CreateQueueTicketSeedOptions) {
    return {
      appointmentId: options.appointmentId,
      serviceId: options.serviceId,
      roomId: options.roomId || null,
      queueDate: options.queueDate || 'current_date',
      queueNumber: options.queueNumber || 'UM-001',
      priority: options.priority || 'regular',
      status: options.status || 'waiting',
      waitingPosition: options.waitingPosition ?? 1,
    };
  }
}
