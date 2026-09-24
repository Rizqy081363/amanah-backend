export type ScheduleIntervalStatus = 'OPEN' | 'OCCUPIED' | 'CLOSED';

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
  appointments: AppointmentOccupation[];
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
  displayLabel: 'Buka' | 'Terisi' | 'Tutup';
  isOccupied: boolean;
  appointmentRef?: ScheduleAppointmentRef;
  closedReason?: ScheduleClosedReason;
}

export interface ScheduleProjectionResult {
  capacity: number;
  projectedEndTime: string;
  intervals: ScheduleProjectedInterval[];
}

const DISPLAY_LABEL_BY_STATUS: Record<
  ScheduleIntervalStatus,
  ScheduleProjectedInterval['displayLabel']
> = {
  OPEN: 'Buka',
  OCCUPIED: 'Terisi',
  CLOSED: 'Tutup',
};

export function projectScheduleIntervals(
  input: ScheduleProjectionInput,
): ScheduleProjectionResult {
  const startMinutes = parseClockTime(input.selectedStartTime);
  const boundaryEndMinutes = parseClockTime(input.boundaryEndTime);
  const capacity = Math.max(
    0,
    Math.floor((boundaryEndMinutes - startMinutes) / input.durationMinutes),
  );
  const projectedEndMinutes = startMinutes + capacity * input.durationMinutes;

  return {
    capacity,
    projectedEndTime: formatClockTime(projectedEndMinutes),
    intervals: buildIntervals({
      input,
      startMinutes,
      capacity,
    }),
  };
}

function buildIntervals(params: {
  input: ScheduleProjectionInput;
  startMinutes: number;
  capacity: number;
}): ScheduleProjectedInterval[] {
  const intervals: ScheduleProjectedInterval[] = [];

  for (let index = 0; index < params.capacity; index++) {
    const intervalStart =
      params.startMinutes + index * params.input.durationMinutes;
    const intervalEnd = intervalStart + params.input.durationMinutes;
    const appointment = findOverlappingAppointment(
      params.input.appointments,
      intervalStart,
      intervalEnd,
    );
    const status = resolveIntervalStatus(
      params.input.closedReason,
      appointment,
    );

    intervals.push({
      intervalId: buildIntervalId(
        params.input.scheduleId,
        intervalStart,
        intervalEnd,
      ),
      intervalIndex: index + 1,
      startTime: formatClockTime(intervalStart),
      endTime: formatClockTime(intervalEnd),
      status,
      displayLabel: DISPLAY_LABEL_BY_STATUS[status],
      isOccupied: status === 'OCCUPIED',
      ...(appointment && !params.input.closedReason
        ? { appointmentRef: toAppointmentRef(appointment) }
        : {}),
      ...(params.input.closedReason
        ? { closedReason: params.input.closedReason }
        : {}),
    });
  }

  return intervals;
}

function resolveIntervalStatus(
  closedReason: ScheduleClosedReason | undefined,
  appointment: AppointmentOccupation | undefined,
): ScheduleIntervalStatus {
  if (closedReason) {
    return 'CLOSED';
  }
  if (appointment) {
    return 'OCCUPIED';
  }
  return 'OPEN';
}

function findOverlappingAppointment(
  appointments: AppointmentOccupation[],
  intervalStart: number,
  intervalEnd: number,
): AppointmentOccupation | undefined {
  return appointments.find((appointment) => {
    const appointmentStart = parseClockTime(appointment.startTime);
    if (!appointment.endTime) {
      return (
        appointmentStart >= intervalStart && appointmentStart < intervalEnd
      );
    }

    const appointmentEnd = parseClockTime(appointment.endTime);
    return appointmentStart < intervalEnd && appointmentEnd > intervalStart;
  });
}

function toAppointmentRef(
  appointment: AppointmentOccupation,
): ScheduleAppointmentRef {
  return {
    appointmentId: appointment.appointmentId,
    queueNumber: appointment.queueNumber ?? null,
    status: appointment.status ?? null,
  };
}

function buildIntervalId(
  scheduleId: string | undefined,
  startMinutes: number,
  endMinutes: number,
): string {
  const prefix = scheduleId || 'projection';
  return `${prefix}:${formatClockTime(startMinutes)}-${formatClockTime(endMinutes)}`;
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
