export class AppointmentCheckInEntity {
  id: string;
  appointmentId: string;
  token: string;
  manualCode: string;
  expiresAt: Date;
  isUsed: boolean;
  usedAt?: Date | null;
  usedByUserId?: string | null;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CheckInQrData {
  appointmentId: string;
  patientName: string;
  queueNumber: string;
  poliklinikName: string;
  doctorName: string;
  scheduledDate: string;
  token: string;
  manualCode: string;
  qrPayload: string;
  appointmentEligibilityDeadline: string;
  expiresAt: string;
  remainingSeconds: number;
}
