import { BadRequestException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointmentStatusEvents,
  appointments,
  queueTickets,
} from '../../../../database/schema';
import {
  DB_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/appointment-lifecycle.constants';
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

      if (
        apt.status === DB_APPOINTMENT_STATUS.IN_SERVICE ||
        apt.status === DB_APPOINTMENT_STATUS.COMPLETED
      ) {
        throw new BadRequestException(
          'Janji temu tidak dapat dibatalkan karena pasien sedang dalam pemeriksaan dokter atau telah selesai.',
        );
      }

      if (apt.status === DB_APPOINTMENT_STATUS.CANCELLED) {
        return {
          success: true,
          message: 'Janji temu sudah berstatus dibatalkan',
          data: {
            appointmentId: apt.id,
            previousStatus: apt.status,
            newStatus: DB_APPOINTMENT_STATUS.CANCELLED,
            cancelledAt: apt.cancelledAt,
            cancelReason: apt.cancelReason,
            scheduleSession: null,
          },
        };
      }

      const nowIso = new Date().toISOString();
      const newStatus: typeof appointments.$inferSelect.status = dto.isNoShow
        ? DB_APPOINTMENT_STATUS.NO_SHOW
        : DB_APPOINTMENT_STATUS.CANCELLED;

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
          status: QUEUE_TICKET_STATUS.CANCELLED,
        })
        .where(eq(queueTickets.appointmentId, appointmentId));

      // In queue ticketing model, appointments do not manipulate session capacity counters
      const sessionResult = null;

      await tx.insert(appointmentStatusEvents).values({
        appointmentId,
        previousStatus: apt.status,
        newStatus,
        changedBy: actorUserId || null,
        reason: dto.reason,
      });

      return {
        success: true,
        message: 'Janji temu berhasil dibatalkan',
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
        previousStatus === DB_APPOINTMENT_STATUS.COMPLETED ||
        previousStatus === DB_APPOINTMENT_STATUS.CANCELLED
      ) {
        throw new BadRequestException(
          `Janji temu sudah berstatus terminal '${previousStatus}' dan tidak dapat diubah lagi.`,
        );
      }

      if (
        (targetStatus === DB_APPOINTMENT_STATUS.CANCELLED ||
          targetStatus === DB_APPOINTMENT_STATUS.NO_SHOW) &&
        previousStatus === DB_APPOINTMENT_STATUS.IN_SERVICE
      ) {
        throw new BadRequestException(
          'Janji temu tidak dapat dibatalkan karena pasien sedang dalam pemeriksaan dokter.',
        );
      }

      const nowIso = new Date().toISOString();
      const updateFields: Record<string, any> = {
        status: targetStatus,
        updatedAt: nowIso,
        updatedBy: actorUserId || null,
      };

      if (
        targetStatus === DB_APPOINTMENT_STATUS.CANCELLED ||
        targetStatus === DB_APPOINTMENT_STATUS.NO_SHOW
      ) {
        updateFields.cancelledAt = nowIso;
        updateFields.cancelReason = dto.reason || 'Dibatalkan oleh staf/admin';
      } else if (targetStatus === DB_APPOINTMENT_STATUS.IN_SERVICE) {
        updateFields.startedAt = nowIso;
        updateFields.actualStartedAt = nowIso;
      } else if (targetStatus === DB_APPOINTMENT_STATUS.COMPLETED) {
        updateFields.completedAt = nowIso;
        updateFields.actualCompletedAt = nowIso;
      } else if (
        targetStatus === DB_APPOINTMENT_STATUS.CHECKED_IN ||
        targetStatus === DB_APPOINTMENT_STATUS.WAITING
      ) {
        updateFields.checkedInAt = apt.checkedInAt || nowIso;
      }

      await tx
        .update(appointments)
        .set(updateFields)
        .where(eq(appointments.id, appointmentId));

      let ticketStatus: typeof queueTickets.$inferSelect.status =
        QUEUE_TICKET_STATUS.WAITING;
      if (targetStatus === DB_APPOINTMENT_STATUS.IN_SERVICE)
        ticketStatus = QUEUE_TICKET_STATUS.IN_SERVICE;
      else if (targetStatus === DB_APPOINTMENT_STATUS.COMPLETED)
        ticketStatus = QUEUE_TICKET_STATUS.COMPLETED;
      else if (targetStatus === DB_APPOINTMENT_STATUS.CANCELLED)
        ticketStatus = QUEUE_TICKET_STATUS.CANCELLED;
      else if (targetStatus === DB_APPOINTMENT_STATUS.NO_SHOW)
        ticketStatus = QUEUE_TICKET_STATUS.SKIPPED;

      await tx
        .update(queueTickets)
        .set({
          status: ticketStatus,
          ...(targetStatus === DB_APPOINTMENT_STATUS.IN_SERVICE
            ? { startedAt: nowIso }
            : {}),
          ...(targetStatus === DB_APPOINTMENT_STATUS.COMPLETED
            ? { completedAt: nowIso }
            : {}),
        })
        .where(eq(queueTickets.appointmentId, appointmentId));

      // In queue ticketing model, appointments do not manipulate session capacity counters
      const sessionResult = null;

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
