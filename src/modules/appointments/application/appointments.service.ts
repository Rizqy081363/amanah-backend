import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DEFAULT_PAGE_SIZE } from '../../../common/constants';
import { AppointmentCreatedEvent, AppointmentStatusChangedEvent } from '../../../common/events';
import { randomUUID } from 'crypto';
import { OutboxEventRecord, OutboxService, OutboxWorker } from '../../../common/outbox';
import { RedisService } from '../../../common/redis/redis.service';
import { type DomainEvent, type NotificationPublisher } from '../../notifications/contracts/domain-event.interface';
import { NOTIFICATION_PUBLISHER } from '../../notifications/notifications.constants';
import { APPOINTMENT_EVENTS, APPOINTMENT_LIFECYCLE_EVENTS } from '../domain/constants/appointment-lifecycle.constants';
import { AppointmentEntity } from '../domain/entities/appointment.entity';
import { APPOINTMENT_REPOSITORY, AppointmentFindAllResult, AppointmentRepository } from '../domain/repositories/appointment.repository';
import { AdminUpdateAppointmentStatusDto } from '../presentation/dto/admin-update-appointment-status.dto';
import { CancelAppointmentDto } from '../presentation/dto/cancel-appointment.dto';
import { CreateAppointmentDto } from '../presentation/dto/create-appointment.dto';
import { QueryAppointmentDto } from '../presentation/dto/query-appointment.dto';
import { RescheduleAppointmentDto } from '../presentation/dto/reschedule-appointment.dto';
import { UpdateAppointmentStatusDto } from '../presentation/dto/update-appointment-status.dto';

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
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notificationPublisher?: NotificationPublisher,
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
    const prefix = body.session.charAt(0);
    const queueNumber = `${prefix}-${String(nextIndex).padStart(3, '0')}`;

    const created = await this.appointmentRepo.create({
      patientId,
      poliklinikId: body.poliklinikId,
      layananId: body.layananId,
      staffId: body.staffId,
      appointmentDate: body.appointmentDate,
      session: body.session,
      queueNumber,
      status: 'SUDAH_BUAT_JANJI',
      visitType: body.visitType || 'Pemeriksaan Baru',
      complaint: body.complaint || null,
    });

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
          actor: {
            userId: user?.id || user?.sub,
            roleCode: user?.role,
          },
        },
      },
      new AppointmentCreatedEvent(
        created.id,
        created.patientId,
        created.poliklinikId,
        created.appointmentDate,
        created.session,
        created.queueNumber,
        created.status,
        undefined,
        {
          userId: user?.id || user?.sub,
          roleCode: user?.role,
        },
      ),
    );

    if (this.notificationPublisher) {
      try {
        const domainEvent: DomainEvent = {
          eventId: randomUUID(),
          eventType: APPOINTMENT_EVENTS.CREATED,
          version: 1,
          occurredAt: new Date().toISOString(),
          module: 'appointments',
          payload: {
            appointmentId: created.id,
            patientId: created.patientId,
            patientUserId: created.patientUserId || user?.id || user?.sub,
            patientName: created.patientName || user?.name || 'Pasien',
            patientAvatarUrl: created.patientAvatarUrl || null,
            poliklinikId: created.poliklinikId,
            poliklinikName: created.poliklinikName || null,
            layananId: created.layananId,
            layananName: created.layananName || null,
            doctorName: created.doctorName || null,
            doctorAvatarUrl: created.doctorAvatarUrl || null,
            appointmentDate: created.appointmentDate,
            session: created.session,
            queueNumber: created.queueNumber,
            status: created.status,
            visitType: created.visitType,
            complaint: created.complaint || null,
          },
          actor: {
            userId: user?.id || user?.sub,
            roleCode:
              typeof user?.role === 'object' && user?.role
                ? user.role.name
                : user?.role || user?.systemRole || 'PATIENT',
          },
        };
        await this.notificationPublisher.publish(domainEvent);
      } catch (pubError) {
        this.logger.warn(
          `Failed to publish notification event on appointment creation: ${pubError}`,
        );
      }
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
    date: string,
    session?: string,
  ): Promise<AppointmentEntity[]> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const cacheKey = `${QUEUE_DAILY_CACHE_PREFIX}:${poliklinikId}:${targetDate}:${session || 'all'}`;

    return this.redisService.getOrSet(
      cacheKey,
      () =>
        this.appointmentRepo.findDailyQueue(poliklinikId, targetDate, session),
      QUEUE_CACHE_TTL_SECONDS,
    );
  }

  async findDisplayQueue(date?: string, poliklinikId?: string): Promise<any> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const cacheKey = `${QUEUE_DISPLAY_CACHE_PREFIX}:${targetDate}:${poliklinikId || 'all'}`;

    return this.redisService.getOrSet(
      cacheKey,
      () => this.appointmentRepo.findDisplayQueue(targetDate, poliklinikId),
      QUEUE_CACHE_TTL_SECONDS,
    );
  }

  async checkIn(
    id: string,
    user?: any,
    expectedVersion?: string,
  ): Promise<AppointmentEntity> {
    return this.transitionAppointmentStatus(
      id,
      'MENUNGGU',
      'Check-in kedatangan pasien',
      undefined,
      user,
      expectedVersion,
    );
  }

  async callPatient(
    id: string,
    practitionerId?: string,
    user?: any,
    expectedVersion?: string,
  ): Promise<AppointmentEntity> {
    return this.transitionAppointmentStatus(
      id,
      'SEDANG_DIPERIKSA',
      'Panggilan pasien masuk ruang periksa',
      practitionerId,
      user,
      expectedVersion,
    );
  }

  async complete(
    id: string,
    user?: any,
    expectedVersion?: string,
  ): Promise<AppointmentEntity> {
    return this.transitionAppointmentStatus(
      id,
      'SELESAI',
      'Pemeriksaan medis selesai',
      undefined,
      user,
      expectedVersion,
    );
  }

  async cancel(
    id: string,
    reason?: string,
    user?: any,
    expectedVersion?: string,
  ): Promise<AppointmentEntity> {
    const finalReason = reason || 'Dibatalkan oleh pasien';
    return this.transitionAppointmentStatus(
      id,
      'BATAL',
      finalReason,
      undefined,
      user,
      expectedVersion,
      finalReason,
    );
  }

  async updateStatus(
    id: string,
    dto: UpdateAppointmentStatusDto,
    user?: any,
    expectedVersion?: string,
  ): Promise<AppointmentEntity> {
    return this.transitionAppointmentStatus(
      id,
      dto.status,
      dto.cancellationReason || '',
      undefined,
      user,
      expectedVersion,
      dto.cancellationReason,
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
      'BATAL',
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
