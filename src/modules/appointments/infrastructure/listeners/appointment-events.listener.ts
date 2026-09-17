import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AppointmentCreatedEvent,
  AppointmentStatusChangedEvent,
} from '../../../../common/events';
import { RedisService } from '../../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { appointmentStatusEvents } from '../../../../database/schema';

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
  ) {}

  @OnEvent(AppointmentCreatedEvent.EVENT_NAME, { async: true })
  async handleAppointmentCreated(event: AppointmentCreatedEvent): Promise<void> {
    try {
      // 1. Record initial status history in appointment_status_events (database-design.md:212)
      await this.db.insert(appointmentStatusEvents).values({
        appointmentId: event.appointmentId,
        previousStatus: null,
        newStatus: 'booked',
        changedBy: event.actor?.userId || null,
        reason: 'Pendaftaran Janji Temu Awal',
      });

      // 2. Decoupled cache invalidation by writer (ARC-041, ARC-088, API-155)
      await this.invalidateQueueCaches();
    } catch (error) {
      this.logger.error(
        `Failed to handle appointment.created for ${event.appointmentId}: ${String(error)}`,
      );
    }
  }

  @OnEvent(AppointmentStatusChangedEvent.EVENT_NAME, { async: true })
  async handleAppointmentStatusChanged(
    event: AppointmentStatusChangedEvent,
  ): Promise<void> {
    try {
      const prevDbStatus = this.mapToDbStatus(event.previousStatus);
      const newDbStatus = this.mapToDbStatus(event.newStatus);

      // 1. Record status transition history in appointment_status_events
      await this.db.insert(appointmentStatusEvents).values({
        appointmentId: event.appointmentId,
        previousStatus: prevDbStatus,
        newStatus: newDbStatus,
        changedBy: event.actor?.userId || null,
        reason: event.reason || null,
      });

      // 2. Decoupled cache invalidation
      await this.invalidateQueueCaches();
    } catch (error) {
      this.logger.error(
        `Failed to handle appointment.status_changed for ${event.appointmentId}: ${String(error)}`,
      );
    }
  }

  private mapToDbStatus(
    status: string | null | undefined,
  ): 'booked' | 'waiting' | 'in_service' | 'completed' | 'cancelled' {
    if (!status) return 'booked';
    switch (status.toUpperCase()) {
      case 'SEDANG_DIPERIKSA':
      case 'IN_SERVICE':
        return 'in_service';
      case 'SELESAI':
      case 'COMPLETED':
        return 'completed';
      case 'BATAL':
      case 'CANCELLED':
        return 'cancelled';
      case 'MENUNGGU':
      case 'WAITING':
      case 'CHECKED_IN':
        return 'waiting';
      case 'SUDAH_BUAT_JANJI':
      case 'BOOKED':
      default:
        return 'booked';
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
        ),
      ]);
    } catch (err) {
      this.logger.warn(`Failed to invalidate queue caches: ${String(err)}`);
    }
  }
}
