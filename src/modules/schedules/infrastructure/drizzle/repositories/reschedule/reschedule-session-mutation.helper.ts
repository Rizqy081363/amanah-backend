import type { RescheduleAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/reschedule-admin-doctor-session.dto';

export interface MutateRescheduleSessionParams {
  tx: any;
  isPartialShiftMode: boolean;
  sessionId: string;
  effectiveTargetSessionId: string;
  practitionerId: string;
  session: {
    id: string;
    scheduleDate: string;
    startTime: string;
    endTime: string;
    notes?: string | null;
  };
  body: RescheduleAdminDoctorSessionDto;
  context: { contextLabel: string; sessionShift: string };
  preview: { projectedEndTime: string };
  targetRoomId: string | null;
}

export interface RescheduledSessionResult {
  id: string;
  practitionerId: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  sessionLabel: string;
  sessionShift: string;
  status: string;
  roomId: string | null;
  notes: string | null;
  updatedAt: string;
}

export async function mutateRescheduleSessionRecords(
  params: MutateRescheduleSessionParams,
): Promise<RescheduledSessionResult> {
  const {
    isPartialShiftMode,
    sessionId,
    effectiveTargetSessionId,
    practitionerId,
    session,
    body,
    context,
    preview,
    targetRoomId,
  } = params;

  const targetStartTimeFormatted =
    body.targetStartTime.length === 5
      ? `${body.targetStartTime}:00`
      : body.targetStartTime;
  const targetEndTimeFormatted =
    preview.projectedEndTime.length === 5
      ? `${preview.projectedEndTime}:00`
      : preview.projectedEndTime;

  const targetId = isPartialShiftMode ? effectiveTargetSessionId : sessionId;

  return {
    id: targetId,
    practitionerId,
    scheduleDate: body.targetDate,
    startTime: targetStartTimeFormatted,
    endTime: targetEndTimeFormatted,
    sessionLabel: context.contextLabel,
    sessionShift: context.sessionShift,
    status: 'open',
    roomId: targetRoomId,
    notes:
      body.notes || body.reason
        ? `[RESCHEDULED] ${body.notes || body.reason}`
        : (session.notes ?? null),
    updatedAt: new Date().toISOString(),
  };
}
