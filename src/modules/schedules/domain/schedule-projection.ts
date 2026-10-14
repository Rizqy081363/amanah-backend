export type ScheduleIntervalStatus = 'OPEN' | 'CLOSED';

export type ScheduleClosedReason =
  | 'LEAVE'
  | 'SCHEDULE_CLOSED'
  | 'OUTSIDE_BOUNDARY';

export interface AppointmentOccupation {
  appointmentId: string;
  startTime: string;
  endTime?: string | null;
  queueNumber?: string | null;
  status?: string | null;
}

export interface ScheduleProjectionInput {
  scheduleId?: string;
  selectedStartTime: string;
  boundaryEndTime: string;
  durationMinutes: number;
  appointments?: AppointmentOccupation[];
  closedReason?: ScheduleClosedReason;
}

export interface ScheduleAppointmentRef {
  appointmentId: string;
  queueNumber: string | null;
  status: string | null;
}

export interface ScheduleProjectedInterval {
  intervalId: string;
  intervalIndex: number;
  startTime: string;
  endTime: string;
  status: ScheduleIntervalStatus;
  displayLabel: 'Buka' | 'Tutup';
  appointmentRef?: ScheduleAppointmentRef;
  closedReason?: ScheduleClosedReason;
}

export interface ScheduleProjectionResult {
  projectedEndTime: string;
  nominalCapacity: number;
  durationMinutes: number;
  isClosed: boolean;
  closedReason?: ScheduleClosedReason;
  /**
   * @deprecated Artificial 30-minute intervals are eliminated in accordance with Queue Paradigm.
   * Kept empty for graceful backward-compatibility.
   */
  intervals: ScheduleProjectedInterval[];
}

export function projectScheduleProjection(
  input: ScheduleProjectionInput,
): ScheduleProjectionResult {
  const startMinutes = parseClockTime(input.selectedStartTime);
  const boundaryEndMinutes = parseClockTime(input.boundaryEndTime);
  const duration = Math.max(1, input.durationMinutes);
  const nominalCapacity = Math.max(
    0,
    Math.floor((boundaryEndMinutes - startMinutes) / duration),
  );
  const projectedEndMinutes = startMinutes + nominalCapacity * duration;

  return {
    projectedEndTime: formatClockTime(projectedEndMinutes),
    nominalCapacity,
    durationMinutes: duration,
    isClosed: Boolean(input.closedReason),
    closedReason: input.closedReason,
    intervals: [],
  };
}

export function parseClockTime(value: string): number {
  const [hourPart, minutePart] = value.split(':');
  const hours = Number(hourPart);
  const minutes = Number(minutePart);
  return hours * 60 + minutes;
}

export function formatClockTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
