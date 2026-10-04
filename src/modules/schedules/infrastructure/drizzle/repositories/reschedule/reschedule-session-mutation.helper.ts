import { appointments, practitionerScheduleSessions } from '@database/schema';
import { formatClockTime } from '@modules/schedules/domain/schedule-projection';
import { SchedulePersistenceStatus } from '@modules/schedules/domain/schedule-status';
import type { RescheduleAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/reschedule-admin-doctor-session.dto';
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';

export interface CarveOutSourceSlotParams {
  tx: any;
  session: typeof practitionerScheduleSessions.$inferSelect;
  sourceSlotStartMin: number;
  sourceSlotEndMin: number;
  sessStartMin: number;
  sessEndMin: number;
  durationMinutes: number;
  remainingAppointments: Array<{ id: string; scheduledStartTime: string }>;
}

export async function carveOutSourceSlotFromSession(
  params: CarveOutSourceSlotParams,
): Promise<void> {
  const {
    tx,
    session,
    sourceSlotStartMin,
    sourceSlotEndMin,
    sessStartMin,
    sessEndMin,
    durationMinutes,
    remainingAppointments,
  } = params;

  // Case 1: Session only covers this slot (or is entirely within the slot)
  if (sessStartMin >= sourceSlotStartMin && sessEndMin <= sourceSlotEndMin) {
    await tx
      .delete(practitionerScheduleSessions)
      .where(eq(practitionerScheduleSessions.id, session.id));
    return;
  }

  // Case 2: Slot is at the start of the session -> shrink start time
  if (sourceSlotStartMin === sessStartMin && sourceSlotEndMin < sessEndMin) {
    const newStartTime = `${formatClockTime(sourceSlotEndMin)}:00`;
    const newSlotsCount = Math.max(
      1,
      Math.floor((sessEndMin - sourceSlotEndMin) / durationMinutes),
    );
    const newAvailableSlots = Math.max(
      0,
      newSlotsCount - remainingAppointments.length,
    );
    await tx
      .update(practitionerScheduleSessions)
      .set({
        startTime: newStartTime,
        capacity: newSlotsCount,
        availableSlots: newAvailableSlots,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(practitionerScheduleSessions.id, session.id));
    return;
  }

  // Case 3: Slot is at the end of the session -> shrink end time
  if (sourceSlotStartMin > sessStartMin && sourceSlotEndMin === sessEndMin) {
    const newEndTime = `${formatClockTime(sourceSlotStartMin)}:00`;
    const newSlotsCount = Math.max(
      1,
      Math.floor((sourceSlotStartMin - sessStartMin) / durationMinutes),
    );
    const newAvailableSlots = Math.max(
      0,
      newSlotsCount - remainingAppointments.length,
    );
    await tx
      .update(practitionerScheduleSessions)
      .set({
        endTime: newEndTime,
        capacity: newSlotsCount,
        availableSlots: newAvailableSlots,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(practitionerScheduleSessions.id, session.id));
    return;
  }

  // Case 4: Slot is in the middle -> split into head and tail sessions
  if (sourceSlotStartMin > sessStartMin && sourceSlotEndMin < sessEndMin) {
    const headEndTime = `${formatClockTime(sourceSlotStartMin)}:00`;
    const headSlotsCount = Math.max(
      1,
      Math.floor((sourceSlotStartMin - sessStartMin) / durationMinutes),
    );
    const headAppts = remainingAppointments.filter((a) => {
      const aStart = a.scheduledStartTime.slice(0, 5);
      return aStart < formatClockTime(sourceSlotStartMin);
    });
    const headAvailableSlots = Math.max(0, headSlotsCount - headAppts.length);

    await tx
      .update(practitionerScheduleSessions)
      .set({
        endTime: headEndTime,
        capacity: headSlotsCount,
        availableSlots: headAvailableSlots,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(practitionerScheduleSessions.id, session.id));

    // Tail session
    const tailStartTime = `${formatClockTime(sourceSlotEndMin)}:00`;
    const tailEndTime = `${formatClockTime(sessEndMin)}:00`;
    const tailSlotsCount = Math.max(
      1,
      Math.floor((sessEndMin - sourceSlotEndMin) / durationMinutes),
    );
    const tailAppts = remainingAppointments.filter((a) => {
      const aStart = a.scheduledStartTime.slice(0, 5);
      return aStart >= formatClockTime(sourceSlotEndMin);
    });
    const tailAvailableSlots = Math.max(0, tailSlotsCount - tailAppts.length);
    const tailSessionId = randomUUID();

    await tx.insert(practitionerScheduleSessions).values({
      id: tailSessionId,
      practitionerId: session.practitionerId,
      daySettingId: session.daySettingId,
      serviceId: session.serviceId,
      roomId: session.roomId,
      scheduleDate: session.scheduleDate,
      sessionLabel: session.sessionLabel,
      sessionShift: session.sessionShift,
      startTime: tailStartTime,
      endTime: tailEndTime,
      capacity: tailSlotsCount,
      availableSlots: tailAvailableSlots,
      status: session.status,
      notes: session.notes,
      updatedAt: new Date().toISOString(),
    });

    if (tailAppts.length > 0) {
      await tx
        .update(appointments)
        .set({
          scheduleSessionId: tailSessionId,
          updatedAt: new Date().toISOString(),
        })
        .where(
          inArray(
            appointments.id,
            tailAppts.map((a) => a.id),
          ),
        );
    }
  }
}

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

    if (body.unscheduleSourceSlot) {
      await carveOutSourceSlotFromSession({
        tx,
        session,
        sourceSlotStartMin,
        sourceSlotEndMin,
        sessStartMin,
        sessEndMin,
        durationMinutes,
        remainingAppointments,
      });
    } else if (appointmentsToMoveCount > 0) {
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
