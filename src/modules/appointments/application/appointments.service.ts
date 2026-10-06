import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DEFAULT_PAGE_SIZE } from '../../../common/constants';
import { AppointmentCreatedEvent, AppointmentStatusChangedEvent } from '../../../common/events';
import { OutboxEventRecord, OutboxService, OutboxWorker } from '../../../common/outbox';
import { RedisService } from '../../../common/redis/redis.service';
import { APPOINTMENT_LIFECYCLE_EVENTS } from '../domain/constants/appointment-lifecycle.constants';
import { AppointmentEntity } from '../domain/entities/appointment.entity';
import { toDomainStatus } from '../domain/types/appointment.types';
import {
  APPOINTMENT_REPOSITORY,
  AppointmentFindAllResult,
  AppointmentRepository,
} from '../domain/repositories/appointment.repository';
import { BusinessDate, ClinicTimeService } from '../../../common/time/clinic-time.service';
import { QueueResponseEnvelope } from '../domain/types/queue-response.type';
import { AdminUpdateAppointmentStatusDto } from '../presentation/dto/admin-update-appointment-status.dto';
import { CancelAppointmentDto } from '../presentation/dto/cancel-appointment.dto';
import { CreateAppointmentDto } from '../presentation/dto/create-appointment.dto';
import { QueryAppointmentDto } from '../presentation/dto/query-appointment.dto';
import { RescheduleAppointmentDto } from '../presentation/dto/reschedule-appointment.dto';
import { UpdateAppointmentStatusDto } from '../presentation/dto/update-appointment-status.dto';
import { AppointmentNotificationPublisher } from './appointment-notification.publisher';

const QUEUE_CACHE_TTL_SECONDS = 30;
const QUEUE_DISPLAY_CACHE_PREFIX = 'queue:display';
const QUEUE_DAILY_CACHE_PREFIX = 'queue:daily';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: AppointmentRepository,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
    @Optional()
    private readonly outboxService?: OutboxService,
    @Optional()
    private readonly outboxWorker?: OutboxWorker,
    @Optional()
    private readonly notificationPublisher?: AppointmentNotificationPublisher,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
  ) {}

  async createAppointment(
    body: CreateAppointmentDto,
    user: any,
  ): Promise<AppointmentEntity> {
    const patientId = body.patientId || user.patient?.id;
    if (!patientId) {
      throw new ForbiddenException(
        'Patient ID wajib disertakan atau akun harus terhubung ke data pasien',
      );
    }

    const nextIndex = await this.appointmentRepo.getNextQueueIndex(
      body.poliklinikId,
      body.appointmentDate,
      body.session,
    );
    const queueNumber = String(nextIndex);

    const created = await this.appointmentRepo.create({
      patientId,
      poliklinikId: body.poliklinikId,
      layananId: body.layananId,
      staffId: body.staffId,
      appointmentDate: body.appointmentDate,
      session: body.session,
      queueNumber,
      status: 'WAITING',
      visitType: body.visitType || 'Pemeriksaan Baru',
      complaint: body.complaint || null,
      sourceIntakeId: body.sourceIntakeId || null,
    });

    const actor = { userId: user?.id || user?.sub, roleCode: user?.role };
    await this.dispatchDomainEvent(
      {
        aggregateType: 'appointment',
        aggregateId: created.id,
        eventType: AppointmentCreatedEvent.EVENT_NAME,
        payload: {
          appointmentId: created.id,
          patientId: created.patientId,
          poliklinikId: created.poliklinikId,
          appointmentDate: created.appointmentDate,
          session: created.session,
          queueNumber: created.queueNumber,
          status: created.status,
          actor,
        },
      },
      new AppointmentCreatedEvent(
        created.id, created.patientId, created.poliklinikId,
        created.appointmentDate, created.session, created.queueNumber,
        created.status, undefined, actor,
      ),
    );

    if (this.notificationPublisher) {
      await this.notificationPublisher.publishCreated(created, user);
    }

    await this.invalidateQueueCaches();
    return created;
  }

  async findAll(query: QueryAppointmentDto): Promise<AppointmentFindAllResult> {
    const page = query.page || 1;
    const limit = query.limit || DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * limit;

    const result = await this.appointmentRepo.findAll(limit, offset, {
      poliklinikId: query.poliklinikId,
      date: query.date,
      session: query.session,
      status: query.status,
      patientId: query.patientId,
      cursor: query.cursor,
    });

    return {
      data: result.data,
      meta: {
        ...result.meta,
        page,
      },
    };
  }

  async findByPatientId(patientId: string): Promise<AppointmentEntity[]> {
    return this.appointmentRepo.findByPatientId(patientId);
  }

  async findByUserId(userId: string): Promise<AppointmentEntity[]> {
    return this.appointmentRepo.findByUserId(userId);
  }

  async getRescheduleOptions(
    appointmentId: string,
    userId: string,
  ): Promise<any> {
    return this.appointmentRepo.getRescheduleOptions(appointmentId, userId);
  }

  async reschedule(
    appointmentId: string,
    dto: RescheduleAppointmentDto,
    userId: string,
    user?: any,
  ): Promise<AppointmentEntity> {
    const updated = await this.appointmentRepo.reschedule(
      appointmentId,
      dto,
      userId,
    );
    await this.eventEmitter.emitAsync(
      APPOINTMENT_LIFECYCLE_EVENTS.RESCHEDULED,
      {
        appointmentId,
        newDate: dto.target_date || dto.newDate || '',
        userId,
        reason: dto.reason,
      },
    );
    if (this.notificationPublisher) {
      await this.notificationPublisher.publishRescheduled(
        updated,
        {
          targetDate: dto.target_date || dto.newDate || updated.appointmentDate,
          targetStartTime: updated.scheduledStartTime,
          targetEndTime: updated.scheduledEndTime,
          reason: dto.reason,
        },
        user,
      );
    }
    await this.invalidateQueueCaches();
    return updated;
  }

  async findById(id: string): Promise<AppointmentEntity> {
    const appointment = await this.appointmentRepo.findById(id);
    if (!appointment) {
      throw new NotFoundException(
        `Kunjungan/Janji temu dengan ID ${id} tidak ditemukan`,
      );
    }
    return appointment;
  }

  async findDailyQueue(
    poliklinikId: string,
    date: BusinessDate,
    session?: string,
  ): Promise<QueueResponseEnvelope<AppointmentEntity[]>> {
    const cacheKey = `${QUEUE_DAILY_CACHE_PREFIX}:${poliklinikId}:${date}:${session || 'all'}`;
    const items = await this.redisService.getOrSet(
      cacheKey,
      () => this.appointmentRepo.findDailyQueue(poliklinikId, date, session),
      QUEUE_CACHE_TTL_SECONDS,
    );
    return {
      businessDate: date,
      clinicTimezone: this.getClinicTimezone(),
      generatedAt: this.getNowIso(),
      items,
    };
  }

  async findMyQueue(
    patientIdOrUserId: string,
    today: BusinessDate,
    poliklinikId?: string,
  ): Promise<QueueResponseEnvelope<AppointmentEntity[]>> {
    const daily = await this.appointmentRepo.findDailyQueue(
      poliklinikId || '',
      today,
    );
    const matched = daily.filter(
      (a) =>
        a.patientId === patientIdOrUserId ||
        (a as any).patientProfileId === patientIdOrUserId ||
        (a as any).userId === patientIdOrUserId,
    );
    return {
      businessDate: today,
      clinicTimezone: this.getClinicTimezone(),
      generatedAt: this.getNowIso(),
      items: matched.length > 0 ? matched : daily,
    };
  }

  async findDisplayQueue(
    today: BusinessDate,
    poliklinikId?: string,
  ): Promise<any> {
    const cacheKey = `${QUEUE_DISPLAY_CACHE_PREFIX}:${today}:${poliklinikId || 'all'}`;
    const displayData = await this.redisService.getOrSet(
      cacheKey,
      () => this.appointmentRepo.findDisplayQueue(today, poliklinikId),
      QUEUE_CACHE_TTL_SECONDS,
    );
    return {
      businessDate: today,
      clinicTimezone: this.getClinicTimezone(),
      generatedAt: this.getNowIso(),
      ...displayData,
    };
  }

  private getClinicTimezone(): string {
    return (
      this.clinicTimeService?.getTimezone() ||
      process.env.CLINIC_TIMEZONE ||
      'UTC'
    );
  }

  private getNowIso(): string {
    return this.clinicTimeService
      ? this.clinicTimeService.nowInstant().toString()
      : new Date().toISOString();
  }

  async checkIn(id: string, user?: any, expectedVersion?: string): Promise<AppointmentEntity> {
    return this.transitionAppointmentStatus(id, 'WAITING', 'Check-in kedatangan pasien', undefined, user, expectedVersion);
  }

  async callPatient(id: string, practitionerId?: string, user?: any, expectedVersion?: string): Promise<AppointmentEntity> {
    return this.transitionAppointmentStatus(id, 'IN_SERVICE', 'Panggilan pasien masuk ruang periksa', practitionerId, user, expectedVersion);
  }

  async complete(id: string, user?: any, expectedVersion?: string): Promise<AppointmentEntity> {
    return this.transitionAppointmentStatus(id, 'COMPLETED', 'Pemeriksaan medis selesai', undefined, user, expectedVersion);
  }

  async cancel(id: string, reason?: string, user?: any, expectedVersion?: string): Promise<AppointmentEntity> {
    const finalReason = reason || 'Dibatalkan oleh pasien';
    const updated = await this.transitionAppointmentStatus(
      id, 'CANCELLED', finalReason, undefined, user, expectedVersion, finalReason,
    );
    if (this.notificationPublisher) {
      await this.notificationPublisher.publishCancelled(updated, finalReason, user);
    }
    return updated;
  }

  async updateStatus(
    id: string, dto: UpdateAppointmentStatusDto, user?: any, expectedVersion?: string,
  ): Promise<AppointmentEntity> {
    return this.transitionAppointmentStatus(
      id, toDomainStatus(dto.status), dto.cancellationReason || '', undefined, user, expectedVersion, dto.cancellationReason,
    );
  }

  private async transitionAppointmentStatus(
    id: string,
    status: AppointmentEntity['status'],
    reason: string,
    practitionerId?: string,
    user?: any,
    expectedVersion?: string,
    cancellationReason?: string,
  ): Promise<AppointmentEntity> {
    const current = await this.appointmentRepo.findById(id);
    const updated = await this.appointmentRepo.updateStatus(
      id,
      status,
      practitionerId,
      cancellationReason,
      expectedVersion,
    );
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }

    await this.emitStatusChangeEvent(
      id,
      current?.status || null,
      status,
      reason,
      { userId: user?.id || user?.sub, roleCode: user?.role },
    );
    return updated;
  }

  async cancelAdminAppointment(
    appointmentId: string,
    dto: CancelAppointmentDto,
    user?: any,
  ): Promise<any> {
    const actorUserId = user?.id || user?.sub;
    const result = await this.appointmentRepo.cancelAdminAppointment(
      appointmentId,
      dto,
      actorUserId,
    );

    await this.emitStatusChangeEvent(
      appointmentId,
      result.data.previousStatus,
      result.data.newStatus,
      dto.reason,
      { userId: actorUserId, roleCode: user?.role },
    );

    if (this.notificationPublisher) {
      const apt = await this.appointmentRepo.findById(appointmentId);
      if (apt) {
        await this.notificationPublisher.publishCancelled(
          apt,
          dto.reason,
          user,
        );
      }
    }
    return result;
  }

  async updateAdminAppointmentStatus(
    appointmentId: string,
    dto: AdminUpdateAppointmentStatusDto,
    user?: any,
  ): Promise<any> {
    const actorUserId = user?.id || user?.sub;
    const result = await this.appointmentRepo.updateAdminAppointmentStatus(
      appointmentId,
      dto,
      actorUserId,
    );

    await this.emitStatusChangeEvent(
      appointmentId,
      result.data.previousStatus,
      result.data.newStatus,
      dto.reason || '',
      { userId: actorUserId, roleCode: user?.role },
    );
    return result;
  }

  async delete(id: string, user?: any): Promise<void> {
    const current = await this.appointmentRepo.findById(id);
    const success = await this.appointmentRepo.delete(id);
    if (!success) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }

    await this.emitStatusChangeEvent(
      id,
      current?.status || null,
      'CANCELLED',
      'Dihapus oleh admin',
      { userId: user?.id || user?.sub, roleCode: user?.role },
    );
  }

  private async emitStatusChangeEvent(
    appointmentId: string,
    previousStatus: string | null,
    newStatus: string,
    reason: string,
    actor?: { userId?: string; roleCode?: string },
  ): Promise<void> {
    await this.dispatchDomainEvent(
      {
        aggregateType: 'appointment',
        aggregateId: appointmentId,
        eventType: AppointmentStatusChangedEvent.EVENT_NAME,
        payload: {
          appointmentId,
          previousStatus,
          newStatus,
          reason,
          actor,
        },
      },
      new AppointmentStatusChangedEvent(
        appointmentId,
        previousStatus,
        newStatus,
        reason,
        undefined,
        actor,
      ),
    );
    await this.invalidateQueueCaches();
  }

  private async dispatchDomainEvent(
    record: OutboxEventRecord,
    fallbackEvent: any,
  ): Promise<void> {
    if (this.outboxService) {
      await this.outboxService.recordEvent(record);
      if (this.outboxWorker) {
        void this.outboxWorker.triggerImmediate();
      }
    } else {
      this.eventEmitter.emit(record.eventType, fallbackEvent);
    }
  }

  private async invalidateQueueCaches(): Promise<void> {
    try {
      await Promise.all([
        this.redisService.deleteByPrefix(QUEUE_DISPLAY_CACHE_PREFIX),
        this.redisService.deleteByPrefix(QUEUE_DAILY_CACHE_PREFIX),
        this.redisService.deleteByPrefix('clinics:analytics'),
        this.redisService.invalidateTags(
          'queue', 'display', 'daily', 'analytics', 'schedule',
          'schedule:list', 'schedule:detail', 'schedule:patients',
          'appointments', 'appointments:me', 'booking',
        ),
      ]);
    } catch (err) {
      this.logger.warn(`Failed to invalidate queue caches: ${String(err)}`);
    }
  }
}
