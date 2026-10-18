import { ScheduleOperationalStatus } from './entities/schedule.entity';

export enum SchedulePersistenceStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

export enum AdminScheduleStatusRequest {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

const PERSISTENCE_STATUS_BY_VALUE: Record<string, SchedulePersistenceStatus> = {
  [SchedulePersistenceStatus.OPEN]: SchedulePersistenceStatus.OPEN,
  [SchedulePersistenceStatus.CLOSED]: SchedulePersistenceStatus.CLOSED,
};

const ADMIN_STATUS_REQUEST_BY_VALUE: Record<
  string,
  AdminScheduleStatusRequest
> = {
  [AdminScheduleStatusRequest.OPEN]: AdminScheduleStatusRequest.OPEN,
  [AdminScheduleStatusRequest.CLOSED]: AdminScheduleStatusRequest.CLOSED,
};

const ADMIN_DAY_STATUS_RESPONSE_LABEL: Record<
  AdminScheduleStatusRequest,
  string
> = {
  [AdminScheduleStatusRequest.OPEN]: AdminScheduleStatusRequest.OPEN,
  [AdminScheduleStatusRequest.CLOSED]: AdminScheduleStatusRequest.CLOSED,
};

export function toSchedulePersistenceStatus(
  value?: string | null,
): SchedulePersistenceStatus | null {
  const statusKey = value?.trim();
  if (!statusKey) {
    return null;
  }

  return PERSISTENCE_STATUS_BY_VALUE[statusKey] ?? null;
}

export function toAdminScheduleStatusRequest(
  value?: string | null,
): AdminScheduleStatusRequest | null {
  const statusKey = value?.trim();
  if (!statusKey) {
    return null;
  }

  return ADMIN_STATUS_REQUEST_BY_VALUE[statusKey] ?? null;
}

export function toAdminDayStatusResponseLabel(
  status: AdminScheduleStatusRequest,
): string {
  return ADMIN_DAY_STATUS_RESPONSE_LABEL[status];
}

export function toDaySessionPersistenceStatus(
  status: AdminScheduleStatusRequest,
): SchedulePersistenceStatus {
  if (status === AdminScheduleStatusRequest.CLOSED) {
    return SchedulePersistenceStatus.CLOSED;
  }

  return SchedulePersistenceStatus.OPEN;
}

export function isClosedScheduleStatus(value?: string | null): boolean {
  return (
    toSchedulePersistenceStatus(value) === SchedulePersistenceStatus.CLOSED
  );
}

export function resolveSessionOperationalStatus(params: {
  isClosedForLeave: boolean;
  persistedStatus: string;
}): ScheduleOperationalStatus {
  if (params.isClosedForLeave) {
    return ScheduleOperationalStatus.CLOSED;
  }

  const persistedStatus = toSchedulePersistenceStatus(params.persistedStatus);
  if (!persistedStatus) {
    throw new Error(
      `Unsupported schedule persistence status: ${params.persistedStatus}`,
    );
  }

  if (persistedStatus === SchedulePersistenceStatus.CLOSED) {
    return ScheduleOperationalStatus.CLOSED;
  }

  return ScheduleOperationalStatus.OPEN;
}

export function resolveAggregateOperationalStatus(params: {
  isClosedForLeave: boolean;
  sessionStatuses: ScheduleOperationalStatus[];
}): ScheduleOperationalStatus {
  if (params.isClosedForLeave) {
    return ScheduleOperationalStatus.ON_LEAVE;
  }

  if (params.sessionStatuses.length === 0) {
    return ScheduleOperationalStatus.CLOSED;
  }

  if (
    params.sessionStatuses.some(
      (status) => status === ScheduleOperationalStatus.OPEN,
    )
  ) {
    return ScheduleOperationalStatus.OPEN;
  }

  return ScheduleOperationalStatus.CLOSED;
}
