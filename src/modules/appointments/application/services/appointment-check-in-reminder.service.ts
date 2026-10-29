import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, eq, isNotNull, like } from 'drizzle-orm';
import { ClinicConfigService } from '../../../../common/clinic-config';
import { RedisService } from '../../../../common/redis/redis.service';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { appointments, notifications } from '../../../../database/schema';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';
import { isAppointmentWithinCheckInWindow } from '../../domain/services/appointment-check-in-window.predicate';

export interface ReminderEvaluationResult {
  processedCount: number;
  dispatchedCount: number;
  skippedCount: number;
}

@Injectable()
export class AppointmentCheckInReminderService {
  private readonly logger = new Logger(AppointmentCheckInReminderService.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly clinicConfig: ClinicConfigService,
    private readonly clinicTimeService: ClinicTimeService,
    private readonly notificationGateway: NotificationGatewayService,
    @Optional()
    private readonly redisService?: RedisService,
  ) {}

  /**
   * Evaluates all candidate booked appointments for today whose check-in window is open
   * and dispatches RBAC-segregated, event-driven reminder notifications.
   */
  async evaluateAndDispatchReminders(options?: {
    date?: string;
    currentTime?: string;
  }): Promise<ReminderEvaluationResult> {
    const todayDateStr = options?.date || this.clinicTimeService.today();
    const currentTimeStr =
      options?.currentTime || this.clinicTimeService.getCurrentTimeString();

    const thresholds = await this.clinicConfig.getQueueThresholds();

    if (!thresholds.checkInReminderEnabled) {
      this.logger.log(
        '[ReminderService] Automatic appointment check-in reminders disabled in Clinic Settings. Skipping evaluation.',
      );
      return { processedCount: 0, dispatchedCount: 0, skippedCount: 0 };
    }

    const candidateAppointments = await this.db.query.appointments.findMany({
      where: and(
        eq(appointments.scheduledDate, todayDateStr),
        eq(appointments.status, 'booked'),
        isNotNull(appointments.practitionerId),
        isNotNull(appointments.roomId),
      ),
      with: {
        patientProfile: true,
        practitioner: {
          with: {
            staffProfile: true,
          },
        },
        clinicRoom: {
          with: {
            clinicUnit: true,
          },
        },
        clinicService: true,
      },
    });

    let dispatchedCount = 0;
    let skippedCount = 0;

    for (const apt of candidateAppointments) {
      const checkInEval = isAppointmentWithinCheckInWindow({
        scheduledDate: apt.scheduledDate,
        scheduledStartTime: apt.scheduledStartTime,
        scheduledEndTime: apt.scheduledEndTime,
        todayDateStr,
        currentTimeStr,
        arriveEarlyMinutes: thresholds.arriveEarlyMinutes,
        overflowToleranceMinutes: thresholds.overflowToleranceMinutes,
      });

      if (!checkInEval.isOpen) {
        continue;
      }

      const idempotencyBase = `apt-checkin-window:${apt.id}:${apt.scheduledDate}`;
      const redisKey = `apt:reminder:${apt.id}:${apt.scheduledDate}`;

      // 1. Check Redis fast-cache deduplication
      if (this.redisService) {
        try {
          const isSent = await this.redisService.getString(redisKey);
          if (isSent) {
            skippedCount++;
            continue;
          }
        } catch (_) {}
      }

      // 2. Check persistent DB deduplication
      const existingNotif = await this.db.query.notifications.findFirst({
        where: like(notifications.idempotencyKey, `${idempotencyBase}:patient%`),
      });

      if (existingNotif) {
        skippedCount++;
        if (this.redisService) {
          await this.redisService
            .setString(redisKey, 'dispatched', 86400)
            .catch(() => {});
        }
        continue;
      }

      const doctorName =
        apt.practitioner?.staffProfile?.fullName || 'Dokter Penanggung Jawab';
      const serviceName = apt.clinicService?.name || 'Poliklinik';
      const roomName = apt.clinicRoom?.name || 'Ruang Periksa';
      const startTimeStr = apt.scheduledStartTime
        ? apt.scheduledStartTime.slice(0, 5)
        : '';
      const patientUserId = apt.patientProfile?.userId || apt.createdBy;
      const doctorUserId = apt.practitioner?.staffProfile?.userId;

      // 3. Dispatch Patient-Specific Notification (Audience: 'patient')
      if (patientUserId) {
        await this.notificationGateway.dispatch({
          commandId: `${idempotencyBase}:patient`,
          sourceDomain: 'appointments',
          target: {
            type: 'user',
            recipientUserIds: [patientUserId],
          },
          category: 'appointment',
          content: {
            title: 'Waktu Check-In Dibuka',
            body: `Waktu check-in untuk janji temu Anda di ${serviceName} dengan ${doctorName} pukul ${startTimeStr} WIB telah dibuka. Silakan lakukan check-in di klinik.`,
            actionUrl: `/klinik/antrean?appointmentId=${apt.id}`,
            data: {
              appointmentId: apt.id,
              scheduledDate: apt.scheduledDate,
              scheduledStartTime: apt.scheduledStartTime,
              doctorName,
              roomName,
              serviceName,
              audience: 'patient',
            },
          },
          channels: ['push', 'in_app'],
          priority: 'high',
        });
      }

      // 4. Dispatch Clinical Notification to Assigned Doctor/Midwife (Audience: 'clinic')
      if (doctorUserId) {
        const patientName = apt.patientProfile?.fullName || 'Pasien';
        const mrn = apt.patientProfile?.medicalRecordNumber || '-';

        await this.notificationGateway.dispatch({
          commandId: `${idempotencyBase}:doctor`,
          sourceDomain: 'appointments',
          target: {
            type: 'user',
            recipientUserIds: [doctorUserId],
          },
          category: 'clinical',
          content: {
            title: 'Pasien Memasuki Waktu Check-In',
            body: `Pasien ${patientName} (${mrn}) untuk jadwal pukul ${startTimeStr} WIB di ${roomName} telah dapat melakukan check-in.`,
            actionUrl: '/jadwal-dokter',
            data: {
              appointmentId: apt.id,
              patientName,
              medicalRecordNumber: mrn,
              scheduledStartTime: apt.scheduledStartTime,
              roomId: apt.roomId,
              audience: 'clinic',
            },
          },
          channels: ['in_app', 'push'],
          priority: 'normal',
        });
      }

      // 5. Dispatch Operational Announcement to Universal Staff (Zero PHI / PII Leakage)
      if (thresholds.operationalBroadcastEnabled) {
        const unitName = apt.clinicRoom?.clinicUnit?.name || serviceName;

        await this.notificationGateway.dispatch({
          commandId: `${idempotencyBase}:staff`,
          sourceDomain: 'appointments',
          target: {
            type: 'role',
            roles: ['admin', 'staff_worker'],
          },
          category: 'queue',
          content: {
            title: 'Jendela Check-In Pelayanan Terbuka',
            body: `Jendela check-in telah dibuka untuk sesi pelayanan di ${unitName} (${roomName}) pukul ${startTimeStr} WIB.`,
            actionUrl: '/klinik/antrean',
            data: {
              appointmentId: apt.id,
              serviceName: unitName,
              roomName,
              scheduledStartTime: apt.scheduledStartTime,
              audience: 'clinic',
            },
          },
          channels: ['in_app'],
          priority: 'normal',
        });
      }

      if (this.redisService) {
        await this.redisService
          .setString(redisKey, 'dispatched', 86400)
          .catch(() => {});
      }

      dispatchedCount++;
    }

    this.logger.log(
      `[ReminderService] Completed check-in reminder evaluation for ${todayDateStr} at ${currentTimeStr}: evaluated ${candidateAppointments.length} candidates, dispatched ${dispatchedCount} reminders.`,
    );

    return {
      processedCount: candidateAppointments.length,
      dispatchedCount,
      skippedCount,
    };
  }
}
