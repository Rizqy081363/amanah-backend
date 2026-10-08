import { appointments, practitionerScheduleSessions } from '@database/schema';
import { formatClockTime } from '@modules/schedules/domain/schedule-projection';
import { SchedulePersistenceStatus } from '@modules/schedules/domain/schedule-status';
import type { RescheduleAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/reschedule-admin-doctor-session.dto';
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';

export interface MutateRescheduleSessionParams {
  tx: any;
  isSingleSlotMode: boolean;
  sessionId: string;
  effectiveTargetSessionId: string;
  practitionerId: string;
  session: typeof practitionerScheduleSessions.$inferSelect;
  body: RescheduleAdminDoctorSessionDto;
  context: { contextLabel: string; sessionShift: string };
  preview: { capacity: number; projectedEndTime: string };
  targetRoomId: string | null;
  appointmentsToMoveCount: number;
  sourceSlotStartMin: number;
  sourceSlotEndMin: number;
  sessStartMin: number;
  sessEndMin: number;
  durationMinutes: number;
  remainingAppointments?: Array<{ id: string; scheduledStartTime: string }>;
}

export async function mutateRescheduleSessionRecords(
  params: MutateRescheduleSessionParams,
): Promise<typeof practitionerScheduleSessions.$inferSelect> {
  const {
    tx,
    isSingleSlotMode,
    sessionId,
    effectiveTargetSessionId,
    practitionerId,
    session,
    body,
    context,
    preview,
    targetRoomId,
    appointmentsToMoveCount,
    sourceSlotStartMin,
    sourceSlotEndMin,
    sessStartMin,
    sessEndMin,
    durationMinutes,
    remainingAppointments = [],
  } = params;

  const targetStartTimeFormatted =
    body.targetStartTime.length === 5
      ? `${body.targetStartTime}:00`
      : body.targetStartTime;
  const targetEndTimeFormatted =
    preview.projectedEndTime.length === 5
      ? `${preview.projectedEndTime}:00`
      : preview.projectedEndTime;

  if (isSingleSlotMode) {
    const [createdTargetSession] = await tx
      .insert(practitionerScheduleSessions)
      .values({
        id: effectiveTargetSessionId,
        practitionerId,
        scheduleDate: body.targetDate,
        startTime: targetStartTimeFormatted,
        endTime: targetEndTimeFormatted,
        sessionLabel: context.contextLabel,
        sessionShift: context.sessionShift,
        capacity: 1,
        availableSlots: Math.max(0, 1 - appointmentsToMoveCount),
        status: SchedulePersistenceStatus.OPEN,
        roomId: targetRoomId,
        notes:
          body.notes || body.reason
            ? `[RESCHEDULED] ${body.notes || body.reason}`
            : session.notes,
        updatedAt: new Date().toISOString(),
      })
      .returning();

    if (appointmentsToMoveCount > 0) {
      const nextAvailable = Math.min(
        session.capacity,
        (session.availableSlots ?? 0) + appointmentsToMoveCount,
      );
      await tx
        .update(practitionerScheduleSessions)
        .set({
          availableSlots: nextAvailable,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(practitionerScheduleSessions.id, sessionId));
    }

    return createdTargetSession;
  }

  const [rescheduled] = await tx
    .update(practitionerScheduleSessions)
    .set({
      scheduleDate: body.targetDate,
      startTime: targetStartTimeFormatted,
      endTime: targetEndTimeFormatted,
      sessionLabel: context.contextLabel,
      sessionShift: context.sessionShift,
      capacity: preview.capacity,
      availableSlots: Math.max(0, preview.capacity - appointmentsToMoveCount),
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
