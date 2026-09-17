import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { AppointmentEntity } from '../domain/entities/appointment.entity';
import {
  APPOINTMENT_REPOSITORY,
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

    // Proactive cache invalidation by writer (ARC-088, API-155)
    await this.invalidateQueueCaches();

    return created;
  }

  async findAll(query: QueryAppointmentDto): Promise<AppointmentEntity[]> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    return this.appointmentRepo.findAll(limit, offset, {
      poliklinikId: query.poliklinikId,
      date: query.date,
      session: query.session,
      status: query.status,
      patientId: query.patientId,
    });
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

  async checkIn(id: string): Promise<AppointmentEntity> {
    const updated = await this.appointmentRepo.updateStatus(id, 'MENUNGGU');
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
    await this.invalidateQueueCaches();
    return updated;
  }

  async callPatient(
    id: string,
    practitionerId?: string,
  ): Promise<AppointmentEntity> {
    const updated = await this.appointmentRepo.updateStatus(
      id,
      'SEDANG_DIPERIKSA',
      practitionerId,
    );
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
    await this.invalidateQueueCaches();
    return updated;
  }

  async complete(id: string): Promise<AppointmentEntity> {
    const updated = await this.appointmentRepo.updateStatus(id, 'SELESAI');
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
    await this.invalidateQueueCaches();
    return updated;
  }

  async cancel(id: string, reason?: string): Promise<AppointmentEntity> {
    const updated = await this.appointmentRepo.updateStatus(
      id,
      'BATAL',
      undefined,
      reason || 'Dibatalkan oleh pasien',
    );
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
    await this.invalidateQueueCaches();
    return updated;
  }

  async updateStatus(
    id: string,
    dto: UpdateAppointmentStatusDto,
  ): Promise<AppointmentEntity> {
    const updated = await this.appointmentRepo.updateStatus(
      id,
      dto.status,
      undefined,
      dto.cancellationReason,
    );
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
    await this.invalidateQueueCaches();
    return updated;
  }

  async delete(id: string): Promise<void> {
    const success = await this.appointmentRepo.delete(id);
    if (!success) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
    await this.invalidateQueueCaches();
  }

  private async invalidateQueueCaches(): Promise<void> {
    try {
      await Promise.all([
        this.redisService.deleteByPrefix(QUEUE_DISPLAY_CACHE_PREFIX),
        this.redisService.deleteByPrefix(QUEUE_DAILY_CACHE_PREFIX),
      ]);
    } catch (err) {
      this.logger.warn(`Failed to invalidate queue caches: ${String(err)}`);
    }
  }
}
