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
    isElapsed: boolean,
  ): AppointmentEntity['status'] {
    if (status === 'cancelled' || status === 'BATAL') {
      return 'BATAL';
    }
    if (status === 'completed' || status === 'SELESAI' || isElapsed) {
      return 'SELESAI';
    }
    if (status === 'in_service' || status === 'SEDANG_DIPERIKSA') {
      return 'SEDANG_DIPERIKSA';
    }
    if (
      status === 'waiting' ||
      status === 'checked_in' ||
      status === 'MENUNGGU'
    ) {
      return 'MENUNGGU';
    }
    return 'SUDAH_BUAT_JANJI';
  }

  static resolveDbStatus(status: string, isElapsed: boolean): string {
    if (
      status === 'cancelled' ||
      status === 'no_show' ||
      status === 'no_doctor'
    ) {
      return status;
    }
    if (status === 'completed' || isElapsed) {
      return 'completed';
    }
    return status;
  }
}
