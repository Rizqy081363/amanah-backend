import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AppointmentCreatedEvent,
  AppointmentStatusChangedEvent,
} from '../../../../common/events';
import { RedisService } from '../../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { appointmentStatusEvents } from '../../../../database/schema';
import {
  DB_APPOINTMENT_STATUS,
  type DbAppointmentStatusValue,
} from '../../domain/constants/appointment-lifecycle.constants';
import { SocketIoRealtimeGateway } from '../../../notifications/infrastructure/realtime/socket-io-realtime.gateway';
import { REALTIME_GATEWAY_PORT } from '../../../notifications/notifications.constants';

const QUEUE_DISPLAY_CACHE_PREFIX = 'queue:display';
const QUEUE_DAILY_CACHE_PREFIX = 'queue:daily';
const CLINICS_ANALYTICS_CACHE_PREFIX = 'clinics:analytics';

@Injectable()
export class AppointmentEventsListener {
  private readonly logger = new Logger(AppointmentEventsListener.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redisService: RedisService,
    @Optional()
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
  ) {}

  @OnEvent(AppointmentCreatedEvent.EVENT_NAME, { async: true })
  async handleAppointmentCreated(
    event: AppointmentCreatedEvent,
  ): Promise<void> {
    try {
      const aptId =
        event?.appointmentId || (event as any)?.payload?.appointmentId;
      if (!aptId) {
        return;
      }

      // 1. Record initial status history in appointment_status_events (database-design.md:212)
      await this.db.insert(appointmentStatusEvents).values({
        appointmentId: aptId,
        previousStatus: null,
        newStatus: DB_APPOINTMENT_STATUS.BOOKED,
        changedBy:
          event.actor?.userId || (event as any)?.payload?.actor?.userId || null,
        reason: 'Pendaftaran Janji Temu Awal',
      });

      // 2. Decoupled cache invalidation by writer (ARC-041, ARC-088, API-155)
      await this.invalidateQueueCaches();
    } catch (error) {
      this.logger.error(
        `Failed to handle appointment.created for ${event?.appointmentId}: ${String(error)}`,
      );
    }
  }

  @OnEvent(AppointmentStatusChangedEvent.EVENT_NAME, { async: true })
  async handleAppointmentStatusChanged(
    event: AppointmentStatusChangedEvent,
  ): Promise<void> {
    try {
      const aptId =
        event?.appointmentId || (event as any)?.payload?.appointmentId;
      if (!aptId) {
        return;
      }

      const prevDbStatus = this.mapToDbStatus(event.previousStatus);
      const newDbStatus = this.mapToDbStatus(event.newStatus);

      // 1. Record status transition history in appointment_status_events
      await this.db.insert(appointmentStatusEvents).values({
        appointmentId: aptId,
        previousStatus: prevDbStatus,
        newStatus: newDbStatus,
        changedBy:
          event.actor?.userId || (event as any)?.payload?.actor?.userId || null,
        reason: event.reason || null,
      });

      // 2. Decoupled cache invalidation
      await this.invalidateQueueCaches();

      if (this.realtimeGateway?.server) {
        const payload = {
          appointmentId: aptId,
          status: newDbStatus.toUpperCase(),
          previousStatus: prevDbStatus?.toUpperCase() ?? null,
        };
        this.realtimeGateway.server.emit('appointment.status_changed', payload);
        this.realtimeGateway.server.emit('appointment:status_changed', payload);
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle appointment.status_changed for ${event.appointmentId}: ${String(error)}`,
      );
    }
  }

  private mapToDbStatus(
    status: string | null | undefined,
  ): DbAppointmentStatusValue {
    if (!status) return DB_APPOINTMENT_STATUS.BOOKED;
    switch (status.toUpperCase()) {
      case 'SEDANG_DIPERIKSA':
      case 'IN_SERVICE':
        return DB_APPOINTMENT_STATUS.IN_SERVICE;
      case 'SELESAI':
      case 'COMPLETED':
        return DB_APPOINTMENT_STATUS.COMPLETED;
      case 'BATAL':
      case 'CANCELLED':
        return DB_APPOINTMENT_STATUS.CANCELLED;
      case 'MENUNGGU':
      case 'WAITING':
      case 'CHECKED_IN':
        return DB_APPOINTMENT_STATUS.WAITING;
      case 'TIDAK_HADIR':
      case 'NO_SHOW':
        return DB_APPOINTMENT_STATUS.NO_SHOW;
      case 'SUDAH_BUAT_JANJI':
      case 'BOOKED':
      default:
        return DB_APPOINTMENT_STATUS.BOOKED;
    }
  }

  private async invalidateQueueCaches(): Promise<void> {
    try {
      await Promise.all([
        this.redisService.deleteByPrefix(QUEUE_DISPLAY_CACHE_PREFIX),
        this.redisService.deleteByPrefix(QUEUE_DAILY_CACHE_PREFIX),
        this.redisService.deleteByPrefix(CLINICS_ANALYTICS_CACHE_PREFIX),
        this.redisService.invalidateTags(
          'queue',
          'display',
          'daily',
          'analytics',
          'schedule',
          'schedule:list',
          'schedule:detail',
          'schedule:patients',
          'appointments',
          'appointments:me',
          'booking',
        ),
      ]);
    } catch (err) {
      this.logger.warn(`Failed to invalidate queue caches: ${String(err)}`);
    }
  }
}
