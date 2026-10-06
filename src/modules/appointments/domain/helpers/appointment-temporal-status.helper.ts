import { parseClockTime } from '../../../schedules/domain/schedule-projection';
import { getClinicNow } from '../../../schedules/domain/services/schedule-date.formatter';
import type { AppointmentEntity } from '../entities/appointment.entity';

export interface TemporalAppointmentInput {
  scheduledDate: string;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  estimatedDurationMinutes?: number;
}

export class AppointmentTemporalStatusHelper {
  static isElapsed(input: TemporalAppointmentInput): boolean {
    if (!input.scheduledDate) {
      return false;
    }

    const { date: todayDate, currentMinutes } = getClinicNow();

    if (input.scheduledDate < todayDate) {
      return true;
    }
    if (input.scheduledDate > todayDate) {
      return false;
    }

    let endMinutes: number | null = null;
    if (input.scheduledEndTime) {
      endMinutes = parseClockTime(input.scheduledEndTime);
    } else if (input.scheduledStartTime) {
      const startMinutes = parseClockTime(input.scheduledStartTime);
      const duration = input.estimatedDurationMinutes ?? 30;
      endMinutes = startMinutes + duration;
    }

    if (endMinutes !== null) {
      return endMinutes <= currentMinutes;
    }

    return false;
  }

  static resolveEntityStatus(
    status: string,
    _isElapsed: boolean = false,
  ): AppointmentEntity['status'] {
    if (status === 'cancelled' || status === 'BATAL' || status === 'CANCELLED') {
      return 'CANCELLED';
    }
    if (status === 'completed' || status === 'SELESAI' || status === 'COMPLETED') {
      return 'COMPLETED';
    }
    if (status === 'in_service' || status === 'SEDANG_DIPERIKSA' || status === 'IN_SERVICE') {
      return 'IN_SERVICE';
    }
    if (status === 'late' || status === 'TERLAMBAT' || status === 'LATE' || status === 'no_show') {
      return 'LATE';
    }
    return 'WAITING';
  }

  static resolveDbStatus(status: string, _isElapsed: boolean = false): string {
    if (
      status === 'cancelled' ||
      status === 'no_show' ||
      status === 'no_doctor' ||
      status === 'late'
    ) {
      return status;
    }
    if (status === 'completed') {
      return 'completed';
    }
    return status;
  }
}
