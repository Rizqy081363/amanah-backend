import { practitionerScheduleSessions } from '@database/schema';
import { formatClockTime } from '@modules/schedules/domain/schedule-projection';
import { SchedulePersistenceStatus } from '@modules/schedules/domain/schedule-status';
import type { RescheduleAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/reschedule-admin-doctor-session.dto';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';

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

    if (sourceSlotStartMin === sessStartMin) {
      const nextCapacity = Math.max(1, session.capacity - 1);
      const nextAvailable = Math.min(
        nextCapacity,
        Math.max(0, session.availableSlots - 1),
      );
      await tx
        .update(practitionerScheduleSessions)
        .set({
          startTime: `${formatClockTime(sourceSlotEndMin)}:00`,
          capacity: nextCapacity,
          availableSlots: nextAvailable,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(practitionerScheduleSessions.id, sessionId));
    } else if (sourceSlotEndMin === sessEndMin) {
      const nextCapacity = Math.max(1, session.capacity - 1);
      const nextAvailable = Math.min(
        nextCapacity,
        Math.max(0, session.availableSlots - 1),
      );
      await tx
        .update(practitionerScheduleSessions)
        .set({
          endTime: `${formatClockTime(sourceSlotStartMin)}:00`,
          capacity: nextCapacity,
          availableSlots: nextAvailable,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(practitionerScheduleSessions.id, sessionId));
    } else {
      const headCapacity = Math.max(
        1,
        Math.floor((sourceSlotStartMin - sessStartMin) / durationMinutes),
      );
      const tailCapacity = Math.max(
        1,
        Math.floor((sessEndMin - sourceSlotEndMin) / durationMinutes),
      );
      const headAvailable = Math.min(
        headCapacity,
        Math.max(0, session.availableSlots - tailCapacity),
      );
      const tailAvailable = Math.min(tailCapacity, tailCapacity);

      await tx
        .update(practitionerScheduleSessions)
        .set({
          endTime: `${formatClockTime(sourceSlotStartMin)}:00`,
          capacity: headCapacity,
          availableSlots: headAvailable,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(practitionerScheduleSessions.id, sessionId));

      await tx.insert(practitionerScheduleSessions).values({
        id: randomUUID(),
        practitionerId,
        scheduleDate: session.scheduleDate,
        startTime: `${formatClockTime(sourceSlotEndMin)}:00`,
        endTime: session.endTime,
        sessionLabel: session.sessionLabel,
        sessionShift: session.sessionShift,
        capacity: tailCapacity,
        availableSlots: tailAvailable,
        status: session.status,
        roomId: session.roomId,
        notes: session.notes,
        updatedAt: new Date().toISOString(),
      });
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
