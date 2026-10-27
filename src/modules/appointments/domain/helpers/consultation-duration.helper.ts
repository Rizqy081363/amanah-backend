import { DOMAIN_APPOINTMENT_STATUS } from '../constants/appointment-lifecycle.constants';

function formatConsultationDuration(elapsedSeconds: number): string {
  if (elapsedSeconds <= 0) return '0 Menit';

  const days = Math.floor(elapsedSeconds / 86400);
  const remainingHoursSec = elapsedSeconds % 86400;
  const hours = Math.floor(remainingHoursSec / 3600);
  const remainingMinsSec = remainingHoursSec % 3600;
  const mins = Math.floor(remainingMinsSec / 60);
  const secs = remainingMinsSec % 60;

  // ≥ 1 Hari
  if (days > 0) {
    return hours > 0 ? `${days} Hari ${hours} Jam` : `${days} Hari`;
  }

  // ≥ 1 Jam (misal 634 menit = 10 jam 34 menit)
  if (hours > 0) {
    return mins > 0 ? `${hours} Jam ${mins} Menit` : `${hours} Jam`;
  }

  // < 1 Jam
  if (mins === 0) {
    return `${secs} Dtk`;
  }
  if (secs === 0) {
    return `${mins} Menit`;
  }
  return `${mins} Menit ${secs} Dtk`;
}

export function computeConsultationMetrics(
  actualStartedAt?: Date | string | null,
  actualCompletedAt?: Date | string | null,
  status?: string | null,
  referenceNow: Date = new Date(),
): {
  elapsedSeconds: number | null;
  formattedDuration: string | null;
} {
  if (!actualStartedAt) {
    return { elapsedSeconds: null, formattedDuration: null };
  }

  const normalizedStatus = (status || '').toUpperCase();
  const isStarted =
    normalizedStatus === DOMAIN_APPOINTMENT_STATUS.IN_SERVICE ||
    normalizedStatus === DOMAIN_APPOINTMENT_STATUS.COMPLETED;
  if (!isStarted) {
    return { elapsedSeconds: null, formattedDuration: null };
  }

  const startTime = new Date(actualStartedAt).getTime();
  if (Number.isNaN(startTime)) {
    return { elapsedSeconds: null, formattedDuration: null };
  }

  const endTime = actualCompletedAt
    ? new Date(actualCompletedAt).getTime()
    : referenceNow.getTime();

  if (Number.isNaN(endTime) || endTime < startTime) {
    return { elapsedSeconds: 0, formattedDuration: '0 Menit' };
  }

  const elapsedSeconds = Math.floor((endTime - startTime) / 1000);
  return {
    elapsedSeconds,
    formattedDuration: formatConsultationDuration(elapsedSeconds),
  };
}
