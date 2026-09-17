import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DEFAULT_PAGE_SIZE } from '../../../common/constants';
import {
  AppointmentCreatedEvent,
  AppointmentStatusChangedEvent,
} from '../../../common/events';
import { RedisService } from '../../../common/redis/redis.service';
import { AppointmentEntity } from '../domain/entities/appointment.entity';
import {
  APPOINTMENT_REPOSITORY,
  AppointmentFindAllResult,
  AppointmentRepository,
} from '../domain/repositories/appointment.repository';
import { CreateAppointmentDto } from '../presentation/dto/create-appointment.dto';
import { QueryAppointmentDto } from '../presentation/dto/query-appointment.dto';
import { UpdateAppointmentStatusDto } from '../presentation/dto/update-appointment-status.dto';

const QUEUE_CACHE_TTL_SECONDS = 30; // High-frequency views cached with 30s TTL
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

    // Emit domain event for asynchronous auditing and status history (ARC-119..122, ARC-136)
    this.eventEmitter.emit(
      AppointmentCreatedEvent.EVENT_NAME,
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

    // Proactive cache invalidation by writer (ARC-088, API-155)
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

  async checkIn(id: string, user?: any): Promise<AppointmentEntity> {
    const current = await this.appointmentRepo.findById(id);
    const updated = await this.appointmentRepo.updateStatus(id, 'MENUNGGU');
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }

    this.eventEmitter.emit(
      AppointmentStatusChangedEvent.EVENT_NAME,
      new AppointmentStatusChangedEvent(
        id,
        current?.status || null,
        'MENUNGGU',
        'Check-in kedatangan pasien',
        undefined,
        {
          userId: user?.id || user?.sub,
          roleCode: user?.role,
        },
      ),
    );

    await this.invalidateQueueCaches();
    return updated;
  }

  async callPatient(
    id: string,
    practitionerId?: string,
    user?: any,
  ): Promise<AppointmentEntity> {
    const current = await this.appointmentRepo.findById(id);
    const updated = await this.appointmentRepo.updateStatus(
      id,
      'SEDANG_DIPERIKSA',
      practitionerId,
    );
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }

    this.eventEmitter.emit(
      AppointmentStatusChangedEvent.EVENT_NAME,
      new AppointmentStatusChangedEvent(
        id,
        current?.status || null,
        'SEDANG_DIPERIKSA',
        'Panggilan pasien masuk ruang periksa',
        undefined,
        {
          userId: user?.id || user?.sub,
          roleCode: user?.role,
        },
      ),
    );

    await this.invalidateQueueCaches();
    return updated;
  }

  async complete(id: string, user?: any): Promise<AppointmentEntity> {
    const current = await this.appointmentRepo.findById(id);
    const updated = await this.appointmentRepo.updateStatus(id, 'SELESAI');
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }

    this.eventEmitter.emit(
      AppointmentStatusChangedEvent.EVENT_NAME,
      new AppointmentStatusChangedEvent(
        id,
        current?.status || null,
        'SELESAI',
        'Pemeriksaan medis selesai',
        undefined,
        {
          userId: user?.id || user?.sub,
          roleCode: user?.role,
        },
      ),
    );

    await this.invalidateQueueCaches();
    return updated;
  }

  async cancel(
    id: string,
    reason?: string,
    user?: any,
  ): Promise<AppointmentEntity> {
    const current = await this.appointmentRepo.findById(id);
    const updated = await this.appointmentRepo.updateStatus(
      id,
      'BATAL',
      undefined,
      reason || 'Dibatalkan oleh pasien',
    );
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }

    this.eventEmitter.emit(
      AppointmentStatusChangedEvent.EVENT_NAME,
      new AppointmentStatusChangedEvent(
        id,
        current?.status || null,
        'BATAL',
        reason || 'Dibatalkan oleh pasien',
        undefined,
        {
          userId: user?.id || user?.sub,
          roleCode: user?.role,
        },
      ),
    );

    await this.invalidateQueueCaches();
    return updated;
  }

  async updateStatus(
    id: string,
    dto: UpdateAppointmentStatusDto,
    user?: any,
  ): Promise<AppointmentEntity> {
    const current = await this.appointmentRepo.findById(id);
    const updated = await this.appointmentRepo.updateStatus(
      id,
      dto.status,
      undefined,
      dto.cancellationReason,
    );
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }

    this.eventEmitter.emit(
      AppointmentStatusChangedEvent.EVENT_NAME,
      new AppointmentStatusChangedEvent(
        id,
        current?.status || null,
        dto.status,
        dto.cancellationReason,
        undefined,
        {
          userId: user?.id || user?.sub,
          roleCode: user?.role,
        },
      ),
    );

    await this.invalidateQueueCaches();
    return updated;
  }

  async delete(id: string, user?: any): Promise<void> {
    const current = await this.appointmentRepo.findById(id);
    const success = await this.appointmentRepo.delete(id);
    if (!success) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }

    this.eventEmitter.emit(
      AppointmentStatusChangedEvent.EVENT_NAME,
      new AppointmentStatusChangedEvent(
        id,
        current?.status || null,
        'BATAL',
        'Dihapus oleh admin',
        undefined,
        {
          userId: user?.id || user?.sub,
          roleCode: user?.role,
        },
      ),
    );

    await this.invalidateQueueCaches();
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
