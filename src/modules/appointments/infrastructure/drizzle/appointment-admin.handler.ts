import { BadRequestException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointmentStatusEvents,
  appointments,
  practitionerScheduleSessions,
  queueTickets,
} from '../../../../database/schema';
import { AdminUpdateAppointmentStatusDto } from '../../presentation/dto/admin-update-appointment-status.dto';
import { CancelAppointmentDto } from '../../presentation/dto/cancel-appointment.dto';

export class AppointmentAdminHandler {
  static async cancelAdminAppointment(
    db: DrizzleDatabase,
    appointmentId: string,
    dto: CancelAppointmentDto,
    actorUserId?: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    return await db.transaction(async (tx) => {
      const [apt] = await tx
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId))
        .for('update');

      if (!apt) {
        throw new NotFoundException('Janji temu tidak ditemukan');
      }

      if (apt.status === 'in_service' || apt.status === 'completed') {
        throw new BadRequestException(
          'Janji temu tidak dapat dibatalkan karena pasien sedang dalam pemeriksaan dokter atau telah selesai.',
        );
      }

      if (apt.status === 'cancelled') {
        return {
          success: true,
          message: 'Janji temu sudah berstatus dibatalkan',
          data: {
            appointmentId: apt.id,
            previousStatus: apt.status,
            newStatus: 'cancelled',
            cancelledAt: apt.cancelledAt,
            cancelReason: apt.cancelReason,
            scheduleSession: null,
          },
        };
      }

      const nowIso = new Date().toISOString();
      const newStatus: typeof appointments.$inferSelect.status = dto.isNoShow
        ? 'no_show'
        : 'cancelled';

      await tx
        .update(appointments)
        .set({
          status: newStatus,
          cancelledAt: nowIso,
          cancelReason: dto.reason,
          updatedAt: nowIso,
          updatedBy: actorUserId || null,
        })
        .where(eq(appointments.id, appointmentId));

      await tx
        .update(queueTickets)
        .set({
          status: 'cancelled',
        })
        .where(eq(queueTickets.appointmentId, appointmentId));

      let sessionResult: any = null;
      let targetSessionId = apt.scheduleSessionId;
      if (!targetSessionId && apt.practitionerId && apt.scheduledDate) {
        const apptStart =
          apt.scheduledStartTime?.length === 5
            ? `${apt.scheduledStartTime}:00`
            : apt.scheduledStartTime || '08:00:00';
        const candidateSessions =
          await tx.query.practitionerScheduleSessions.findMany({
            where: and(
              eq(
                practitionerScheduleSessions.practitionerId,
                apt.practitionerId,
              ),
              eq(practitionerScheduleSessions.scheduleDate, apt.scheduledDate),
            ),
          });
        const matched =
          candidateSessions.find((s) => {
            const sStart =
              s.startTime.length === 5 ? `${s.startTime}:00` : s.startTime;
            const sEnd = s.endTime.length === 5 ? `${s.endTime}:00` : s.endTime;
            return apptStart >= sStart && apptStart < sEnd;
          }) || candidateSessions[0];
        if (matched) targetSessionId = matched.id;
      }

      if (targetSessionId) {
        const [session] = await tx
          .select()
          .from(practitionerScheduleSessions)
          .where(eq(practitionerScheduleSessions.id, targetSessionId))
          .for('update');

        if (session) {
          const newAvailable = Math.min(
            session.capacity,
            session.availableSlots + 1,
          );
          await tx
            .update(practitionerScheduleSessions)
            .set({
              availableSlots: newAvailable,
              updatedAt: nowIso,
            })
            .where(eq(practitionerScheduleSessions.id, session.id));

          sessionResult = {
            sessionId: session.id,
            restoredAvailableSlots: newAvailable,
            totalCapacity: session.capacity,
            sessionStatus: session.status,
          };
        }
      }

      await tx.insert(appointmentStatusEvents).values({
        appointmentId,
        previousStatus: apt.status,
        newStatus,
        changedBy: actorUserId || null,
        reason: dto.reason,
      });

      return {
        success: true,
        message:
          'Janji temu berhasil dibatalkan dan 1 slot kuota sesi telah dipulihkan',
        data: {
          appointmentId: apt.id,
          previousStatus: apt.status,
          newStatus,
          cancelledAt: nowIso,
          cancelReason: dto.reason,
          scheduleSession: sessionResult,
        },
      };
    });
  }

  static async updateAdminAppointmentStatus(
    db: DrizzleDatabase,
    appointmentId: string,
    dto: AdminUpdateAppointmentStatusDto,
    actorUserId?: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    return await db.transaction(async (tx) => {
      const [apt] = await tx
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId))
        .for('update');

      if (!apt) {
        throw new NotFoundException('Janji temu tidak ditemukan');
      }

      const previousStatus = apt.status;
      const targetStatus =
        dto.status as typeof appointments.$inferSelect.status;

      if (
        (targetStatus === 'cancelled' || targetStatus === 'no_show') &&
        (previousStatus === 'in_service' || previousStatus === 'completed')
      ) {
        throw new BadRequestException(
          'Janji temu tidak dapat dibatalkan karena pasien sedang dalam pemeriksaan dokter atau telah selesai.',
        );
      }

      const nowIso = new Date().toISOString();
      const updateFields: Record<string, any> = {
        status: targetStatus,
        updatedAt: nowIso,
        updatedBy: actorUserId || null,
      };

      if (targetStatus === 'cancelled' || targetStatus === 'no_show') {
        updateFields.cancelledAt = nowIso;
        updateFields.cancelReason = dto.reason || 'Dibatalkan oleh staf/admin';
      } else if (targetStatus === 'in_service') {
        updateFields.startedAt = nowIso;
      } else if (targetStatus === 'completed') {
        updateFields.completedAt = nowIso;
      } else if (targetStatus === 'checked_in' || targetStatus === 'waiting') {
        updateFields.checkedInAt = apt.checkedInAt || nowIso;
      }

      await tx
        .update(appointments)
        .set(updateFields)
        .where(eq(appointments.id, appointmentId));

      let ticketStatus: typeof queueTickets.$inferSelect.status = 'waiting';
      if (targetStatus === 'in_service') ticketStatus = 'in_service';
      else if (targetStatus === 'completed') ticketStatus = 'completed';
      else if (targetStatus === 'cancelled') ticketStatus = 'cancelled';
      else if (targetStatus === 'no_show') ticketStatus = 'skipped';

      await tx
        .update(queueTickets)
        .set({
          status: ticketStatus,
          ...(targetStatus === 'in_service'
            ? { calledAt: nowIso, startedAt: nowIso }
            : {}),
          ...(targetStatus === 'completed' ? { completedAt: nowIso } : {}),
        })
        .where(eq(queueTickets.appointmentId, appointmentId));

      let sessionResult: any = null;
      let targetSessionId = apt.scheduleSessionId;
      if (
        (targetStatus === 'cancelled' || targetStatus === 'no_show') &&
        previousStatus !== 'cancelled' &&
        previousStatus !== 'no_show'
      ) {
        if (!targetSessionId && apt.practitionerId && apt.scheduledDate) {
          const apptStart =
            apt.scheduledStartTime?.length === 5
              ? `${apt.scheduledStartTime}:00`
              : apt.scheduledStartTime || '08:00:00';
          const candidateSessions =
            await tx.query.practitionerScheduleSessions.findMany({
              where: and(
                eq(
                  practitionerScheduleSessions.practitionerId,
                  apt.practitionerId,
                ),
                eq(
                  practitionerScheduleSessions.scheduleDate,
                  apt.scheduledDate,
                ),
              ),
            });
          const matched =
            candidateSessions.find((s) => {
              const sStart =
                s.startTime.length === 5 ? `${s.startTime}:00` : s.startTime;
              const sEnd =
                s.endTime.length === 5 ? `${s.endTime}:00` : s.endTime;
              return apptStart >= sStart && apptStart < sEnd;
            }) || candidateSessions[0];
          if (matched) targetSessionId = matched.id;
        }

        if (targetSessionId) {
          const [session] = await tx
            .select()
            .from(practitionerScheduleSessions)
            .where(eq(practitionerScheduleSessions.id, targetSessionId))
            .for('update');

          if (session) {
            const newAvailable = Math.min(
              session.capacity,
              session.availableSlots + 1,
            );
            await tx
              .update(practitionerScheduleSessions)
              .set({
                availableSlots: newAvailable,
                updatedAt: nowIso,
              })
              .where(eq(practitionerScheduleSessions.id, session.id));

            sessionResult = {
              sessionId: session.id,
              restoredAvailableSlots: newAvailable,
              totalCapacity: session.capacity,
              sessionStatus: session.status,
            };
          }
        }
      }

      await tx.insert(appointmentStatusEvents).values({
        appointmentId,
        previousStatus,
        newStatus: targetStatus,
        changedBy: actorUserId || null,
        reason: dto.reason || null,
      });

      return {
        success: true,
        message: `Status janji temu berhasil diubah menjadi ${targetStatus}`,
        data: {
          appointmentId,
          previousStatus,
          newStatus: targetStatus,
          updatedAt: nowIso,
          reason: dto.reason || null,
          scheduleSession: sessionResult,
        },
      };
    });
  }
}
