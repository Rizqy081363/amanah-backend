import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { NOTIFICATION_AUDIENCE } from '../../../common/constants/notification-audience.constants';
import { isExternalUser, type AuthenticatedUser } from '../../../common/auth';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';
import { zodPipe } from '../../../common/validation';
import { HttpCache } from '../../../common/decorators/http-cache.decorator';
import { Idempotent } from '../../../common/decorators/idempotent.decorator';
import { formatETag } from '../../../common/occ';
import {
  ClinicTimeService,
  parseBusinessDate,
} from '../../../common/time/clinic-time.service';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  patientAffiliations,
  patientProfiles,
} from '../../../database/schema/amanah.schema';
import { eq } from 'drizzle-orm';
import { AppointmentsService } from '../application/appointments.service';
import { GenerateCheckInQrUseCase } from '../application/use-cases/generate-check-in-qr.use-case';
import { PerformCheckInUseCase } from '../application/use-cases/perform-check-in.use-case';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { CreateAppointmentSchema } from './dto/create-appointment.schema';
import { PerformCheckInDto } from './dto/perform-check-in.dto';
import { QueryAppointmentDto } from './dto/query-appointment.dto';
import { QueryQueueNavigationDto } from './dto/query-queue-navigation.dto';
import { QueueNavigationResponseDto } from './dto/queue-navigation-response.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { RescheduleAppointmentSchema } from './dto/reschedule-appointment.schema';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { AppointmentDomainExceptionFilter } from './filters/appointment-domain-exception.filter';

@ApiTags('Appointments (Kunjungan & Antrean Pasien)')
@UseFilters(AppointmentDomainExceptionFilter)
@Controller({ path: 'appointments', version: '1' })
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly clinicTimeService: ClinicTimeService,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    @Optional()
    private readonly generateCheckInQrUseCase?: GenerateCheckInQrUseCase,
    @Optional()
    private readonly performCheckInUseCase?: PerformCheckInUseCase,
  ) {}

  private async getAllowedPatientIds(
    user: AuthenticatedUser,
  ): Promise<string[]> {
    const ownPatientId =
      user.patient?.id ||
      (
        await this.db.query.patientProfiles.findFirst({
          where: eq(patientProfiles.userId, user.id),
          columns: { id: true },
        })
      )?.id;

    const affiliations = await this.db.query.patientAffiliations.findMany({
      where: eq(patientAffiliations.userId, user.id),
      columns: { patientId: true },
    });

    const ids = new Set<string>();
    if (ownPatientId) {
      ids.add(ownPatientId);
    }
    for (const aff of affiliations) {
      if (aff.patientId) {
        ids.add(aff.patientId);
      }
    }
    return Array.from(ids);
  }

  private async assertPatientAccess(
    patientId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (!isExternalUser(user)) {
      return;
    }
    const allowed = await this.getAllowedPatientIds(user);
    if (!allowed.includes(patientId)) {
      throw new ForbiddenException(
        'Akses ditolak: Anda tidak memiliki wewenang untuk mengakses data janji temu pasien lain.',
      );
    }
  }

  private async assertAppointmentAccess(
    appointment: any,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (!isExternalUser(user)) {
      return;
    }
    const isOwner =
      appointment.createdBy === user.id ||
      appointment.patientUserId === user.id ||
      appointment.parentUserId === user.id ||
      (user.patient?.id && appointment.patientId === user.patient.id);

    if (isOwner) {
      return;
    }

    if (appointment.patientId) {
      const allowed = await this.getAllowedPatientIds(user);
      if (allowed.includes(appointment.patientId)) {
        return;
      }
    }

    throw new ForbiddenException(
      'Akses ditolak: Anda tidak memiliki wewenang untuk mengakses janji temu ini.',
    );
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:book')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Pasien mendaftar kunjungan antrean (Web / Mobile App)',
    description:
      'Membuat janji temu kunjungan poliklinik dan otomatis menerbitkan tiket nomor antrean sesuai sesi waktu.',
  })
  @ApiCreatedResponse({
    description: 'Janji temu berhasil dibuat beserta nomor tiket antrean',
  })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({
    description:
      'Patient ID wajib disertakan atau akun harus terhubung ke data pasien',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi jadwal poli atau tanggal kunjungan gagal',
  })
  @Idempotent()
  async createAppointment(
    @Body(zodPipe(CreateAppointmentSchema)) body: CreateAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (body.patientId && isExternalUser(user)) {
      await this.assertPatientAccess(body.patientId, user);
    }
    return this.appointmentsService.createAppointment(body, user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:read')
  @Get()
  @ApiOperation({
    summary: 'Mendapatkan daftar seluruh janji temu dengan filter dan paginasi',
    description:
      'Menampilkan seluruh antrean janji temu per poli, sesi, atau status kunjungan.',
  })
  @ApiOkResponse({ description: 'Daftar janji temu berhasil diambil' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({
    description: 'Akses ditolak: Diperlukan izin appointments:read',
  })
  async getAppointments(
    @Query() query: QueryAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (isExternalUser(user)) {
      if (query.patientId) {
        await this.assertPatientAccess(query.patientId, user);
      } else {
        (query as any).allowedPatientIds = await this.getAllowedPatientIds(user);
        (query as any).createdById = user.id;
      }
    }
    return this.appointmentsService.findAll(query);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:read')
  @Get('queue-navigation')
  @ApiOperation({
    summary:
      'Mendapatkan navigasi kategori/unit klinik dan antrean dokter dinamis (SSOT)',
    description:
      'Menyediakan daftar unit klinik aktif beserta daftar dokter yang bertugas dan metrik antreannya untuk tampilan tabs hierarkis.',
  })
  @ApiOkResponse({
    description: 'Data navigasi antrean berhasil diambil',
    type: QueueNavigationResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({
    description: 'Akses ditolak: Diperlukan izin appointments:read',
  })
  async getQueueNavigation(@Query() query: QueryQueueNavigationDto) {
    return this.appointmentsService.getQueueNavigation(query);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:read')
  @Get('me')
  @ApiOperation({
    summary: 'Melihat riwayat janji temu dan antrean pasien saat ini',
    description:
      'Menampilkan riwayat kunjungan dan antrean aktif milik pasien yang sedang login serta anggota keluarga yang terafiliasi.',
  })
  @ApiOkResponse({ description: 'Riwayat janji temu pasien berhasil diambil' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  async getMyAppointments(@CurrentUser() user: AuthenticatedUser) {
    return this.appointmentsService.findByUserId(user.id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('queue:read', 'appointments:read')
  @Get('queue/daily')
  @ApiOperation({
    summary: 'Mendapatkan daftar antrean harian per poli dan sesi (Web/App)',
    description:
      'Digunakan oleh dokter dan perawat untuk memantau antrean harian di polikliniknya.',
  })
  @ApiOkResponse({ description: 'Daftar antrean harian berhasil diambil' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya Admin atau Staf yang diizinkan' })
  @HttpCache({ ttlSeconds: 15, tags: ['queue', 'daily'], isPrivate: false })
  async getDailyQueue(
    @Query('poliklinikId') poliklinikId?: string,
    @Query('date') date?: string,
    @Query('session') session?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (user && isExternalUser(user)) {
      throw new ForbiddenException(
        'Akses ditolak: Pasien eksternal tidak diizinkan mengakses antrean harian klinik.',
      );
    }
    const targetDate = date || this.clinicTimeService.today();
    const businessDate = parseBusinessDate(targetDate);
    return this.appointmentsService.findDailyQueue(
      poliklinikId || '',
      businessDate,
      session,
    );
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:read', 'queue:read')
  @Get('queue/my')
  @ApiOperation({
    summary: 'Mendapatkan antrean aktif hari ini untuk pasien',
    description:
      'Endpoint khusus pasien untuk memantau antrean hari ini berdasarkan jam operasional server SSOT.',
  })
  @ApiOkResponse({ description: 'Antrean pasien hari ini berhasil diambil' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya Pasien yang diizinkan' })
  async getMyQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Query('poliklinikId') poliklinikId?: string,
  ) {
    const allowedPatientIds = await this.getAllowedPatientIds(user);
    return this.appointmentsService.findMyQueue(
      allowedPatientIds,
      user.id,
      this.clinicTimeService.today(),
      poliklinikId,
    );
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:read')
  @Get('active-ticket')
  @ApiOperation({
    summary:
      'Mengecek apakah pasien memiliki tiket aktif pada tanggal dan kategori tertentu',
    description:
      'Digunakan oleh antarmuka pendaftaran untuk verifikasi dini tiket aktif pasien.',
  })
  async getActiveTicket(
    @Query('patientId') patientId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('date') date?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const resolvedPatientId = patientId || user?.patient?.id;
    if (!resolvedPatientId || !date) {
      return { hasActiveTicket: false, activeTicket: null };
    }
    if (user && isExternalUser(user)) {
      await this.assertPatientAccess(resolvedPatientId, user);
    }
    const ticket = await this.appointmentsService.findActiveTicket({
      patientId: resolvedPatientId,
      categoryId,
      queueDate: date,
    });
    return {
      hasActiveTicket: Boolean(ticket),
      activeTicket: ticket,
    };
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('queue:read')
  @Get('queue/display')
  @ApiOperation({
    summary: 'Mendapatkan data display antrean TV ruang tunggu klinik',
    description:
      'Endpoint terproteksi real-time untuk memantau display antrean poliklinik.',
  })
  @ApiOkResponse({ description: 'Data antrean TV monitor berhasil diambil' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Akses ditolak' })
  @HttpCache({ ttlSeconds: 10, tags: ['queue', 'display'] })
  async getDisplayQueue(@Query('poliklinikId') poliklinikId?: string) {
    return this.appointmentsService.findDisplayQueue(
      this.clinicTimeService.today(),
      poliklinikId,
    );
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:read')
  @Get('doctor/processed')
  @ApiOperation({
    summary: 'Mendapatkan daftar antrean yang sedang dan telah diproses dokter',
    description:
      'Mengambil daftar antrean berstatus IN_SERVICE dan COMPLETED untuk dokter terkait.',
  })
  @ApiOkResponse({
    description: 'Daftar riwayat antrean dokter berhasil diambil',
  })
  async getDoctorProcessedAppointments(
    @Query('date') date?: string,
    @Query('doctorId') queryDoctorId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (user && isExternalUser(user)) {
      throw new ForbiddenException(
        'Akses ditolak: Pasien eksternal tidak diizinkan mengakses antrean dokter.',
      );
    }
    const practitionerId =
      queryDoctorId || user?.staff?.practitionerId || user?.staff?.id;
    if (!practitionerId) {
      return [];
    }
    return this.appointmentsService.findDoctorProcessedAppointments(
      practitionerId,
      date,
    );
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:read')
  @Get(':id')
  @ApiOperation({
    summary: 'Mendapatkan detail janji temu dan tiket antrean',
    description:
      'Mengambil informasi lengkap jadwal janji temu, data poli, dokter penanggung jawab, dan status antrean.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan / appointment',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({ description: 'Detail janji temu berhasil ditemukan' })
  @ApiNotFoundResponse({ description: 'Kunjungan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  async getAppointmentById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const appointment = await this.appointmentsService.findById(id);
    if (!appointment) {
      throw new NotFoundException(`Kunjungan tidak ditemukan`);
    }

    await this.assertAppointmentAccess(appointment, user);

    if (res && appointment.version) {
      res.setHeader('ETag', formatETag(appointment.version));
    }
    return appointment;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:book', 'appointments:manage')
  @Patch(':id/check-in')
  @ApiOperation({
    summary: 'Pasien melakukan konfirmasi kedatangan di klinik (Check-in)',
    description:
      'Mengubah status antrean dari SUDAH_BUAT_JANJI menjadi MENUNGGU panggilan dokter.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({ description: 'Pasien berhasil check-in' })
  @ApiNotFoundResponse({ description: 'Kunjungan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @Idempotent()
  async checkInAppointment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('if-match') ifMatch?: string,
    @Body('version') bodyVersion?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const appointment = await this.appointmentsService.findById(id);
    if (!appointment) {
      throw new NotFoundException(`Kunjungan tidak ditemukan`);
    }
    await this.assertAppointmentAccess(appointment, user);
    const result = await this.appointmentsService.checkIn(
      id,
      user,
      ifMatch || bodyVersion,
    );
    if (res && result.version) {
      res.setHeader('ETag', formatETag(result.version));
    }
    return result;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:manage')
  @Post(':id/check-in-qr')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Admin menghasilkan kredensial QR Code dan kode manual untuk check-in pasien',
    description:
      'Menghasilkan token QR Code dan 6 digit kode acak verifikasi check-in.',
  })
  async generateCheckInQr(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user && isExternalUser(user)) {
      throw new ForbiddenException(
        'Akses ditolak: Pasien eksternal tidak diizinkan membuat QR check-in.',
      );
    }
    if (!this.generateCheckInQrUseCase) {
      throw new NotFoundException('Fitur QR check-in belum diaktifkan');
    }
    return this.generateCheckInQrUseCase.execute(
      id,
      user?.id || (user as any)?.sub,
    );
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:book')
  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pasien/Kiosk melakukan check-in via QR scan atau kode manual',
    description:
      'Memvalidasi kredensial dan mentransisikan status janji temu dari BOOKED menjadi WAITING.',
  })
  async performCheckIn(
    @Body() body: PerformCheckInDto,
    @CurrentUser() user?: any,
  ) {
    if (!this.performCheckInUseCase) {
      throw new NotFoundException('Fitur check-in belum diaktifkan');
    }
    return this.performCheckInUseCase.execute(body, user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('queue:call')
  @Patch(':id/call')
  @ApiOperation({
    summary: 'Staf/Dokter memanggil pasien ke ruang periksa (Mobile App)',
    description:
      'Mengubah status antrean menjadi SEDANG_DIPERIKSA dan memperbarui display antrean TV.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({
    description: 'Status berhasil diubah menjadi sedang diperiksa',
  })
  @ApiNotFoundResponse({ description: 'Kunjungan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({
    description: 'Akses ditolak: Diperlukan izin queue:call',
  })
  async callPatient(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Headers('if-match') ifMatch?: string,
    @Body('version') bodyVersion?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (user && isExternalUser(user)) {
      throw new ForbiddenException(
        'Akses ditolak: Pasien eksternal tidak diizinkan memanggil antrean.',
      );
    }
    const result = await this.appointmentsService.callPatient(
      id,
      user.staff?.practitionerId || user.staff?.id,
      user,
      ifMatch || bodyVersion,
    );
    if (res && result.version) {
      res.setHeader('ETag', formatETag(result.version));
    }
    return result;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('queue:complete')
  @Patch(':id/complete')
  @ApiOperation({
    summary: 'Menyelesaikan pemeriksaan pasien (Mobile App)',
    description:
      'Mengubah status antrean menjadi SELESAI setelah dokter selesai mencatat rekam medis.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({ description: 'Pemeriksaan selesai' })
  @ApiNotFoundResponse({ description: 'Kunjungan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya Staf/Dokter yang diizinkan' })
  async completeAppointment(
    @Param('id') id: string,
    @CurrentUser() user?: any,
    @Headers('if-match') ifMatch?: string,
    @Body('version') bodyVersion?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (user && isExternalUser(user)) {
      throw new ForbiddenException(
        'Akses ditolak: Pasien eksternal tidak diizinkan menyelesaikan pemeriksaan.',
      );
    }
    const result = await this.appointmentsService.complete(
      id,
      user,
      ifMatch || bodyVersion,
    );
    if (res && result.version) {
      res.setHeader('ETag', formatETag(result.version));
    }
    return result;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:manage', 'appointments:book')
  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Membatalkan janji temu antrean',
    description:
      'Membatalkan nomor antrean kunjungan dengan menyertakan alasan pembatalan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          example: 'Pasien berhalangan hadir karena keperluan mendesak',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Kunjungan berhasil dibatalkan' })
  @ApiNotFoundResponse({ description: 'Kunjungan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @Idempotent()
  async cancelAppointment(
    @Param('id') id: string,
    @Body('reason') reason?: string,
    @CurrentUser() user?: AuthenticatedUser,
    @Headers('if-match') ifMatch?: string,
    @Body('version') bodyVersion?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (user && isExternalUser(user)) {
      const appointment = await this.appointmentsService.findById(id);
      if (!appointment) {
        throw new NotFoundException(`Kunjungan tidak ditemukan`);
      }
      await this.assertAppointmentAccess(appointment, user);
    }
    const result = await this.appointmentsService.cancel(
      id,
      reason,
      user,
      ifMatch || bodyVersion,
    );
    if (res && result.version) {
      res.setHeader('ETag', formatETag(result.version));
    }
    return result;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:read', 'appointments:book')
  @Get(':id/reschedule-options')
  @ApiOperation({
    summary:
      'Mendapatkan opsi tanggal dan sesi untuk penjadwalan ulang janji temu',
    description:
      'Menampilkan informasi janji temu dan jadwal dokter yang tersedia untuk dipilih pasien saat reschedule.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan / appointment',
  })
  @ApiOkResponse({ description: 'Opsi reschedule berhasil diambil' })
  @ApiNotFoundResponse({ description: 'Janji temu tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  async getRescheduleOptions(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (isExternalUser(user)) {
      const appointment = await this.appointmentsService.findById(id);
      if (!appointment) {
        throw new NotFoundException(`Janji temu tidak ditemukan`);
      }
      await this.assertAppointmentAccess(appointment, user);
    }
    return this.appointmentsService.getRescheduleOptions(id, user.id, user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:book', 'appointments:manage')
  @Post(':id/reschedule')
  @ApiOperation({
    summary: 'Melakukan penjadwalan ulang (reschedule) janji temu pasien',
    description:
      'Memindahkan jadwal janji temu ke sesi dan tanggal baru secara atomik melalui penerbitan tiket antrean baru.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan / appointment',
  })
  @ApiOkResponse({ description: 'Janji temu berhasil dijadwalkan ulang' })
  @ApiNotFoundResponse({
    description: 'Janji temu atau sesi baru tidak ditemukan',
  })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @Idempotent()
  async rescheduleAppointment(
    @Param('id') id: string,
    @Body(zodPipe(RescheduleAppointmentSchema)) dto: RescheduleAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (isExternalUser(user)) {
      const appointment = await this.appointmentsService.findById(id);
      if (!appointment) {
        throw new NotFoundException(`Janji temu tidak ditemukan`);
      }
      await this.assertAppointmentAccess(appointment, user);
    }
    return this.appointmentsService.reschedule(id, dto, user.id, user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:manage')
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Memperbarui status janji temu secara spesifik',
    description:
      'Mengubah status antrean ke status tertentu (MENUNGGU, SEDANG_DIPERIKSA, SELESAI, BATAL).',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({ description: 'Status kunjungan berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Kunjungan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({
    description: 'Akses ditolak: Diperlukan izin appointments:manage',
  })
  @ApiUnprocessableEntityResponse({ description: 'Status baru tidak valid' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateAppointmentStatusDto,
    @CurrentUser() user?: AuthenticatedUser,
    @Headers('if-match') ifMatch?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (user && isExternalUser(user)) {
      throw new ForbiddenException(
        'Akses ditolak: Pasien eksternal tidak diizinkan mengubah status antrean secara langsung.',
      );
    }
    const expectedVersion = ifMatch || (body as any)?.version;
    const result = await this.appointmentsService.updateStatus(
      id,
      body,
      user,
      expectedVersion,
    );
    if (res && result.version) {
      res.setHeader('ETag', formatETag(result.version));
    }
    return result;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('appointments:manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus/Membatalkan data janji temu (Admin/Staf)',
    description:
      'Soft delete data janji temu dari sistem manajemen antrean klinik.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiNoContentResponse({ description: 'Janji temu berhasil dihapus' })
  @ApiNotFoundResponse({ description: 'Kunjungan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({
    description: 'Akses ditolak: Diperlukan izin appointments:manage',
  })
  async deleteAppointment(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (user && isExternalUser(user)) {
      throw new ForbiddenException(
        'Akses ditolak: Pasien eksternal tidak diizinkan menghapus data janji temu.',
      );
    }
    await this.appointmentsService.delete(id, user);
  }
}
