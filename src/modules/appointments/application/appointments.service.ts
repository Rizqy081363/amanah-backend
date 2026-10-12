import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DEFAULT_PAGE_SIZE } from '../../../common/constants';
import {
  AppointmentCreatedEvent,
  AppointmentStatusChangedEvent,
} from '../../../common/events';
import {
  OutboxEventRecord,
  OutboxService,
  OutboxWorker,
} from '../../../common/outbox';
import { RedisService } from '../../../common/redis/redis.service';
import {
  BusinessDate,
  ClinicTimeService,
} from '../../../common/time/clinic-time.service';
import { QueueEventPublisher } from '../../queue-engine/application/services/queue-event-publisher.service';
import {
  APPOINTMENT_LIFECYCLE_EVENTS,
  DB_APPOINTMENT_STATUS,
} from '../domain/constants/appointment-lifecycle.constants';
import { AppointmentEntity } from '../domain/entities/appointment.entity';
import {
  APPOINTMENT_REPOSITORY,
  AppointmentFindAllResult,
  AppointmentRepository,
} from '../domain/repositories/appointment.repository';
import { ActiveTicketPolicyService } from '../domain/services/active-ticket-policy.service';
import { toDomainStatus } from '../domain/types/appointment.types';
import { QueueResponseEnvelope } from '../domain/types/queue-response.type';
import { AdminUpdateAppointmentStatusDto } from '../presentation/dto/admin-update-appointment-status.dto';
import { CancelAppointmentDto } from '../presentation/dto/cancel-appointment.dto';
import { CreateAppointmentDto } from '../presentation/dto/create-appointment.dto';
import { QueryAppointmentDto } from '../presentation/dto/query-appointment.dto';
import { RescheduleAppointmentDto } from '../presentation/dto/reschedule-appointment.dto';
import { UpdateAppointmentStatusDto } from '../presentation/dto/update-appointment-status.dto';
import { AppointmentNotificationPublisher } from './appointment-notification.publisher';
import {
  PUSH_NOTIFICATION_PORT,
  type PushNotificationPort,
} from './ports/push-notification.port';

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
    @Inject(PUSH_NOTIFICATION_PORT)
    private readonly pushNotification?: PushNotificationPort,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
    @Optional()
    private readonly activeTicketPolicy?: ActiveTicketPolicyService,
    @Optional()
    private readonly queueEventPublisher?: QueueEventPublisher,
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
        created.id,
        created.patientId,
        created.poliklinikId,
        created.appointmentDate,
        created.session,
        created.queueNumber,
        created.status,
        undefined,
        actor,
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
      poliklinikName: query.poliklinikName,
      serviceName: query.serviceName,
      date: query.date,
      session: query.session,
      status: query.status,
      patientId: query.patientId,
      search: query.search,
      cursor: query.cursor,
      doctorId: query.doctorId,
      doctorName: query.doctorName,
      roomId: query.roomId,
      roomName: query.roomName,
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
    user?: any,
  ): Promise<any> {
    return this.appointmentRepo.getRescheduleOptions(appointmentId, userId, user);
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
      user,
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
    return {
      businessDate: today,
      clinicTimezone: this.getClinicTimezone(),
      generatedAt: this.getNowIso(),
      items: daily,
    };
  }

  async findActiveTicket(params: {
    patientId: string;
    categoryId?: string;
    queueDate: string;
  }): Promise<any | null> {
    if (!this.activeTicketPolicy) return null;
    const tickets = await this.activeTicketPolicy.findActiveTickets(params);
    return tickets[0] || null;
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

  async checkIn(
    id: string,
    user?: any,
    expectedVersion?: string,
  ): Promise<AppointmentEntity> {
    return this.transitionAppointmentStatus(
      id,
      'WAITING',
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
      'IN_SERVICE',
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
      'COMPLETED',
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
    const updated = await this.transitionAppointmentStatus(
      id,
      'CANCELLED',
      finalReason,
      undefined,
      user,
      expectedVersion,
      finalReason,
    );
    if (this.notificationPublisher) {
      await this.notificationPublisher.publishCancelled(
        updated,
        finalReason,
        user,
      );
    }
    return updated;
  }

  async updateStatus(
    id: string,
    dto: UpdateAppointmentStatusDto,
    user?: any,
    expectedVersion?: string,
  ): Promise<AppointmentEntity> {
    return this.transitionAppointmentStatus(
      id,
      toDomainStatus(dto.status),
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
    this.sendPushNotificationForAppointment(updated, status, reason);
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

    const apt = await this.appointmentRepo.findById(appointmentId);
    if (apt) {
      this.sendPushNotificationForAppointment(apt, 'CANCELLED', dto.reason);
      if (this.notificationPublisher) {
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

    const apt = await this.appointmentRepo.findById(appointmentId);
    if (apt) {
      this.sendPushNotificationForAppointment(
        apt,
        result.data.newStatus,
        dto.reason,
      );

      if (
        this.queueEventPublisher &&
        (result.data.newStatus === DB_APPOINTMENT_STATUS.COMPLETED ||
          result.data.newStatus === DB_APPOINTMENT_STATUS.IN_SERVICE ||
          result.data.newStatus === DB_APPOINTMENT_STATUS.CANCELLED ||
          result.data.newStatus === DB_APPOINTMENT_STATUS.NO_SHOW)
      ) {
        const evType =
          result.data.newStatus === DB_APPOINTMENT_STATUS.NO_SHOW
            ? 'cancelled'
            : (result.data.newStatus as any);
        this.queueEventPublisher
          .publishProgression({
            eventType: evType,
            serviceDate: apt.appointmentDate,
            appointmentId: apt.id,
          })
          .catch(() => {});
      }
    }
    return result;
  }

  private sendPushNotificationForAppointment(
    apt: AppointmentEntity,
    newStatus: string,
    reason?: string,
  ): void {
    if (!this.pushNotification) return;
    const targetUserId = apt.parentUserId || apt.patientUserId || apt.createdBy;
    if (!targetUserId) return;

    let title = 'Pembaruan Status Antrean';
    let body = `Status antrean pasien ${apt.patientName || 'Pasien'} diperbarui menjadi ${newStatus}.`;

    const upperStatus = newStatus.toUpperCase();
    if (upperStatus === 'IN_SERVICE') {
      title = 'Pemeriksaan Sedang Berlangsung';
      body = `Pasien ${apt.patientName || 'Pasien'} (Nomor antrean ${apt.queueNumber}) sedang dalam pemeriksaan di ${apt.poliklinikName || 'Poliklinik'}.`;
    } else if (upperStatus === 'COMPLETED') {
      title = 'Pemeriksaan Selesai';
      body = `Pemeriksaan untuk pasien ${apt.patientName || 'Pasien'} (Nomor antrean ${apt.queueNumber}) telah selesai. Terima kasih telah berkunjung.`;
    } else if (upperStatus === 'CANCELLED') {
      title = 'Janji Temu Dibatalkan';
      body = `Janji temu untuk pasien ${apt.patientName || 'Pasien'} (Nomor antrean ${apt.queueNumber}) telah dibatalkan.${reason ? ` Alasan: ${reason}` : ''}`;
    } else if (upperStatus === 'LATE' || upperStatus === 'NO_SHOW') {
      title = 'Status Antrean Terlambat';
      body = `Pasien ${apt.patientName || 'Pasien'} (Nomor antrean ${apt.queueNumber}) ditandai terlambat/tidak hadir.${reason ? ` Alasan: ${reason}` : ''}`;
    } else if (upperStatus === 'WAITING' || upperStatus === 'CHECKED_IN') {
      title = 'Antrean Menunggu Pemeriksaan';
      body = `Pasien ${apt.patientName || 'Pasien'} (Nomor antrean ${apt.queueNumber}) siap menunggu giliran pemeriksaan di ${apt.poliklinikName || 'Poliklinik'}.`;
    }

    this.pushNotification
      .sendPush({
        userId: targetUserId,
        title,
        body,
        data: {
          appointmentId: apt.id,
          queueNumber: String(apt.queueNumber),
          status: upperStatus,
          isAffiliated: apt.isAffiliated ? 'true' : 'false',
        },
      })
      .catch((error) => {
        this.logger.warn(
          `Push notification failed on status ${upperStatus} for target ${targetUserId}: ${error.message}`,
        );
      });
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
