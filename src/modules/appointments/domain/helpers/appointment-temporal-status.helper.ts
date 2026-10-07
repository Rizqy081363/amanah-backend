import { parseClockTime } from '../../../schedules/domain/schedule-projection';
import { getClinicNow } from '../../../schedules/domain/services/schedule-date.formatter';
import { DB_APPOINTMENT_STATUS } from '../constants/appointment-lifecycle.constants';
import type { AppointmentEntity } from '../entities/appointment.entity';
import { toDomainStatus } from '../types/appointment.types';

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
    return toDomainStatus(status);
  }

  static resolveDbStatus(status: string, _isElapsed: boolean = false): string {
    if (
      status === DB_APPOINTMENT_STATUS.CANCELLED ||
      status === DB_APPOINTMENT_STATUS.NO_SHOW ||
      status === DB_APPOINTMENT_STATUS.NO_DOCTOR ||
      status === DB_APPOINTMENT_STATUS.LATE
    ) {
      return status;
    }
    if (status === DB_APPOINTMENT_STATUS.COMPLETED) {
      return DB_APPOINTMENT_STATUS.COMPLETED;
    }
    return status;
  }
}
