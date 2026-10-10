import { practitionerScheduleSessions } from '@database/schema';
import { SchedulePersistenceStatus } from '@modules/schedules/domain/schedule-status';
import type { RescheduleAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/reschedule-admin-doctor-session.dto';
import { eq } from 'drizzle-orm';

export interface MutateRescheduleSessionParams {
  tx: any;
  isPartialShiftMode: boolean;
  sessionId: string;
  effectiveTargetSessionId: string;
  practitionerId: string;
  session: typeof practitionerScheduleSessions.$inferSelect;
  body: RescheduleAdminDoctorSessionDto;
  context: { contextLabel: string; sessionShift: string };
  preview: { projectedEndTime: string };
  targetRoomId: string | null;
}

export async function mutateRescheduleSessionRecords(
  params: MutateRescheduleSessionParams,
): Promise<typeof practitionerScheduleSessions.$inferSelect> {
  const {
    tx,
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

  if (isPartialShiftMode) {
    const [createdTargetSession] = await tx
      .insert(practitionerScheduleSessions)
      .values({
        id: effectiveTargetSessionId,
        practitionerId,
        scheduleDate: body.targetDate,
        startTime: targetStartTimeFormatted,
        endTime: targetEndTimeFormatted,
        sessionLabel: context.contextLabel,
        sessionShift: context.sessionShift as any,
        status: SchedulePersistenceStatus.OPEN,
        roomId: targetRoomId,
        notes:
          body.notes || body.reason
            ? `[RESCHEDULED] ${body.notes || body.reason}`
            : session.notes,
        updatedAt: new Date().toISOString(),
      })
      .returning();

    return createdTargetSession;
  }

  const [rescheduled] = await tx
    .update(practitionerScheduleSessions)
    .set({
      scheduleDate: body.targetDate,
      startTime: targetStartTimeFormatted,
      endTime: targetEndTimeFormatted,
      sessionLabel: context.contextLabel,
      sessionShift: context.sessionShift as any,
      roomId: targetRoomId,
      notes:
        body.notes || body.reason
          ? `[RESCHEDULED] ${body.notes || body.reason}`
          : session.notes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(practitionerScheduleSessions.id, sessionId))
    .returning();

  return rescheduled;
}
