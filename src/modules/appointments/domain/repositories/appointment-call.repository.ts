export interface AppointmentCallAttemptRecord {
  id: string;
  appointmentId: string;
  queueTicketId?: string | null;
  attemptNumber: number;
  status: string;
  calledBy?: string | null;
  calledAt: string;
  respondedAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface AppointmentCallDetails {
  id: string;
  status: string;
  bookingCode: string;
  patientId: string;
  patientUserId: string | null;
  patientName: string;
  ticketId: string | null;
  ticketNumber: string | null;
  ticketStatus: string | null;
  poliklinikName: string | null;
  roomName?: string | null;
  doctorName?: string | null;
  practitionerId?: string | null;
  categoryId?: string | null;
  scheduledDate?: string | null;
}

export abstract class AppointmentCallRepository {
  abstract findAttemptsByAppointmentId(
    appointmentId: string,
  ): Promise<AppointmentCallAttemptRecord[]>;

  abstract getLatestAttempt(
    appointmentId: string,
  ): Promise<AppointmentCallAttemptRecord | null>;

  abstract recordCallAttempt(data: {
    appointmentId: string;
    queueTicketId?: string | null;
    attemptNumber: number;
    status: string;
    calledBy?: string | null;
    notes?: string | null;
  }): Promise<AppointmentCallAttemptRecord>;

  abstract updateAttemptStatus(
    attemptId: string,
    status: string,
    respondedAt?: string | null,
  ): Promise<void>;

  abstract getAppointmentWithDetails(
    appointmentId: string,
  ): Promise<AppointmentCallDetails | null>;

  abstract findEarlierWaitingTicket(
    ticketId: string,
  ): Promise<{ queueNumber: string; id: string } | null>;

  abstract requeueTicket(
    ticketId: string,
    bumpPositions: number,
  ): Promise<void>;

  abstract updateAppointmentAndTicketStatus(
    appointmentId: string,
    appointmentStatus: string,
    ticketId?: string | null,
    ticketStatus?: string | null,
  ): Promise<void>;
}
