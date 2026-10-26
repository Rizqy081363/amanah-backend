import { CurrentUser } from '@common/auth/current-user.decorator';
import { HybridAuthGuard } from '@common/auth/hybrid-auth.guard';
import { Public } from '@common/auth/public.decorator';
import { Roles } from '@common/auth/roles.decorator';
import { RolesGuard } from '@common/auth/roles.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { SYSTEM_ROLES } from '../../../auth/constants/auth.constants';
import {
  DoctorRosterOverviewResponse,
  UpdateDoctorRosterDto,
} from '../doctor-roster/domain/doctor-roster.entity';
import {
  DOCTOR_ROSTER_REPOSITORY,
  DoctorRosterRepository,
} from '../doctor-roster/domain/doctor-roster.repository';
import { resolveCanonicalShift } from '../domain/constants/schedule-shift.constants';
import {
  AdminSessionPatientsResponse,
  RescheduleEligibilityResponse,
  ScheduleCapacityOverviewResponse,
} from '../domain/entities/schedule.entity';
import {
  SCHEDULE_REPOSITORY,
  ScheduleRepository,
} from '../domain/repositories/schedule.repository';
import { BookedPatientsQueryDto } from './dto/booked-patients-query.dto';
import { CalendarSummaryQueryDto } from './dto/calendar-summary-query.dto';
import { CheckRescheduleEligibilityQueryDto } from './dto/check-reschedule-eligibility-query.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { GetSessionPatientsQueryDto } from './dto/get-session-patients-query.dto';
import { QueryScheduleDto } from './dto/query-schedule.dto';
import { RescheduleAdminDoctorSessionDto } from './dto/reschedule-admin-doctor-session.dto';
import { RoomReferenceQueryDto } from './dto/room-reference-query.dto';
import { ScheduleCapacityQueryDto } from './dto/schedule-capacity-query.dto';
import { ScheduleContextQueryDto } from './dto/schedule-context-query.dto';
import { ScheduleProjectionQueryDto } from './dto/schedule-projection-query.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

@ApiTags('Schedules (Jadwal Dokter & Bidan)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description:
    'Akses ditolak: Peran akun tidak memiliki wewenang untuk aksi ini',
})
@Controller({ path: 'schedules', version: '1' })
export class SchedulesController {
  constructor(
    @Inject(SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: ScheduleRepository,
    @Inject(DOCTOR_ROSTER_REPOSITORY)
    private readonly rosterRepo: DoctorRosterRepository,
  ) {}

  private assertScheduleOwnership(schedule: any, user: any) {
    if (user.systemRole === SYSTEM_ROLES.ADMIN) return;
    const doctorPractitionerId = user.staff?.practitionerId;
    if (!doctorPractitionerId || schedule.staffId !== doctorPractitionerId) {
      throw new ForbiddenException(
        'Akses ditolak: Anda hanya berwenang mengelola jadwal praktek Anda sendiri',
      );
    }
  }

  private resolveTargetStaffId(user: any, requestedStaffId?: string): string {
    if (user.systemRole === SYSTEM_ROLES.ADMIN) {
      if (!requestedStaffId) {
        throw new BadRequestException(
          'Parameter staffId wajib disertakan ketika diakses oleh akun Administrator non-praktisi',
        );
      }
      return requestedStaffId;
    }
    const doctorPractitionerId = user.staff?.practitionerId;
    if (!doctorPractitionerId) {
      throw new ForbiddenException(
        'User bukan praktisi medis dokter terdaftar',
      );
    }
    if (requestedStaffId && requestedStaffId !== doctorPractitionerId) {
      throw new ForbiddenException(
        'Akses ditolak: Staf hanya dapat mengakses jadwal untuk akun sendiri',
      );
    }
    return doctorPractitionerId;
  }

  @Post()
  @Roles(SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.STAF)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan jadwal jaga/praktek staf (Admin/Staf)',
    description:
      'Membuat jadwal praktek dokter/bidan pada tanggal dan shift tertentu.',
  })
  @ApiCreatedResponse({
    description: 'Jadwal praktek berhasil dibuat',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi waktu atau jadwal gagal',
  })
  async createSchedule(
    @Body() body: CreateScheduleDto,
    @CurrentUser() user: any,
  ) {
    let staffId: string;
    if (user.systemRole === SYSTEM_ROLES.ADMIN) {
      if (!body.staffId) {
        throw new BadRequestException(
          'Parameter staffId wajib disertakan oleh Administrator saat membuat jadwal',
        );
      }
      staffId = body.staffId;
    } else {
      const doctorPractitionerId = user.staff?.practitionerId;
      if (!doctorPractitionerId) {
        throw new ForbiddenException(
          'Akun Anda belum terhubung dengan profil praktisi medis klinik',
        );
      }
      if (body.staffId && body.staffId !== doctorPractitionerId) {
        throw new ForbiddenException(
          'Akses ditolak: Staf hanya dapat membuat jadwal praktek untuk akun sendiri',
        );
      }
      staffId = doctorPractitionerId;
    }

    const resolvedShift = resolveCanonicalShift({
      session: body.session,
      sessionShift: body.sessionType,
    });
    const sessionValue = resolvedShift.session;
    const sessionLabel =
      body.sessionType || body.session || resolvedShift.label;

    return this.scheduleRepo.create({
      staffId,
      poliklinikId: body.poliklinikId,
      roomId: body.roomId,
      serviceId: body.serviceId,
      dayOfWeek: null,
      specificDate: body.date || body.specificDate,
      scheduleDate: body.date || body.specificDate,
      session: sessionValue,
      sessionLabel,
      startTime: body.startTime,
      endTime: body.endTime,
      isAvailable: body.isAvailable ?? true,
      notes: body.notes,
    });
  }

  @Get()
  @Roles(SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.STAF, SYSTEM_ROLES.PATIENT)
  @ApiOperation({
    summary: 'Mendapatkan daftar seluruh jadwal praktek dengan filter',
    description:
      'Mengambil jadwal praktek berdasarkan poliklinik, staf dokter, atau tanggal tertentu dengan pagination.',
  })
  @ApiOkResponse({
    description: 'Daftar jadwal praktek berhasil diambil',
  })
  async getSchedules(@Query() query: QueryScheduleDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    return this.scheduleRepo.findAll(limit, offset, {
      poliklinikId: query.poliklinikId,
      staffId: query.staffId,
      date: query.date,
    });
  }

  @Get('my-schedules')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary: 'Melihat jadwal staf yang sedang login (Mobile App / Web)',
    description:
      'Menampilkan seluruh jadwal dinas dokter atau bidan yang sedang terautentikasi.',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Filter tanggal spesifik (YYYY-MM-DD)',
    example: '2026-08-26',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter tanggal awal rentang (YYYY-MM-DD)',
    example: '2026-08-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter tanggal akhir rentang (YYYY-MM-DD)',
    example: '2026-08-31',
  })
  @ApiOkResponse({
    description: 'Daftar jadwal dinas staf login berhasil diambil',
  })
  async getMySchedules(
    @CurrentUser() user: any,
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const staffId = user.staff?.practitionerId;
    if (!staffId) {
      throw new ForbiddenException(
        'User bukan praktisi medis dokter terdaftar',
      );
    }
    return this.scheduleRepo.findMySchedules(staffId, {
      date,
      startDate,
      endDate,
    });
  }

  @Get('my-roster')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Melihat matriks roster mingguan dokter yang sedang login (Mobile App / Web)',
    description:
      'Menampilkan 7 hari kerja beserta 4 sesi shift (Dini Hari, Pagi, Siang, Malam) dengan status aktif template dan override.',
  })
  @ApiOkResponse({
    type: DoctorRosterOverviewResponse,
    description: 'Matriks roster mingguan dokter berhasil diambil',
  })
  async getMyRoster(
    @CurrentUser() user: any,
    @Query('staffId') staffIdQuery?: string,
  ): Promise<DoctorRosterOverviewResponse> {
    const staffId = this.resolveTargetStaffId(user, staffIdQuery);
    return this.rosterRepo.getDoctorRoster(staffId);
  }

  @Put('my-roster')
  @Roles(SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Memperbarui matriks roster mingguan dokter yang sedang login (Mobile App / Web)',
    description:
      'Menyimpan override sesi aktif/non-aktif dokter per hari dan shift untuk template mingguan.',
  })
  @ApiOkResponse({
    type: DoctorRosterOverviewResponse,
    description: 'Roster mingguan dokter berhasil diperbarui',
  })
  async updateMyRoster(
    @Body() dto: UpdateDoctorRosterDto,
    @CurrentUser() user: any,
    @Query('staffId') staffIdQuery?: string,
  ): Promise<DoctorRosterOverviewResponse> {
    const staffId = this.resolveTargetStaffId(user, staffIdQuery);
    const userId = user.id;
    return this.rosterRepo.updateDoctorRoster(staffId, dto, userId);
  }

  @Delete('my-roster')
  @Roles(SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Mereset roster mingguan dokter kembali ke template klinik (Mobile App / Web)',
    description:
      'Menghapus seluruh override khusus dokter dan mengembalikan jadwal ke default template mingguan klinik.',
  })
  @ApiOkResponse({
    type: DoctorRosterOverviewResponse,
    description:
      'Roster dokter berhasil dikembalikan ke template mingguan klinik',
  })
  async resetMyRoster(
    @CurrentUser() user: any,
    @Query('staffId') staffIdQuery?: string,
  ): Promise<DoctorRosterOverviewResponse> {
    const staffId = this.resolveTargetStaffId(user, staffIdQuery);
    const userId = user.id;
    return this.rosterRepo.resetDoctorRoster(staffId, userId);
  }

  @Get('calendar-summary')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary: 'Melihat ringkasan kalender bulanan jadwal dokter (Mobile App)',
    description:
      'Mengambil status jadwal, status cuti, dan akumulasi pasien untuk setiap hari dalam satu bulan.',
  })
  @ApiOkResponse({
    description: 'Ringkasan kalender bulanan berhasil diambil',
  })
  async getCalendarSummary(
    @Query() query: CalendarSummaryQueryDto,
    @CurrentUser() user: any,
  ) {
    const staffId = user.staff?.practitionerId;
    if (!staffId) {
      throw new ForbiddenException(
        'User bukan praktisi medis dokter terdaftar',
      );
    }
    return this.scheduleRepo.getCalendarSummary(staffId, query.month);
  }

  @Patch('days/:date')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Menutup atau membuka seluruh jadwal pada hari/tanggal tertentu (Mobile & Web Staf)',
    description:
      'Dokter atau staf dapat menonaktifkan (CLOSED) atau mengaktifkan kembali (OPEN) seluruh sesi pada tanggal kalender tertentu secara cascading.',
  })
  @ApiParam({
    name: 'date',
    description: 'Tanggal kalender target (YYYY-MM-DD)',
    example: '2026-10-24',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['OPEN', 'CLOSED'],
          example: 'CLOSED',
          description: 'Canonical operating status for the day',
        },
        notes: {
          type: 'string',
          nullable: true,
          example: 'Dokter berhalangan hadir',
          description: 'Catatan alasan penutupan hari',
        },
      },
      required: ['status'],
    },
  })
  @ApiOkResponse({
    description: 'Status hari berhasil diperbarui dan sesi di-cascade',
  })
  async updateDayStatus(
    @Param('date') date: string,
    @Body('status') status: string,
    @Body('notes') notes: string,
    @CurrentUser() user: any,
  ) {
    const staffId = this.resolveTargetStaffId(user);
    return this.scheduleRepo.updateAdminDayStatus(staffId, date, status, notes);
  }

  @Get('reference/rooms')
  @Roles(SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.STAF, SYSTEM_ROLES.PATIENT)
  @ApiOperation({
    summary: 'Mendapatkan daftar ruang praktek klinik dan status okupansi',
    description:
      'Mengambil seluruh ruangan periksa klinik aktif beserta informasi ketersediaan atau dokter yang sedang menempati.',
  })
  @ApiOkResponse({
    description: 'Daftar ruangan klinik berhasil diambil',
  })
  async getRooms(@Query() query: RoomReferenceQueryDto) {
    return this.scheduleRepo.getRooms(
      query.date,
      query.startTime,
      query.endTime,
      query.excludePractitionerId,
    );
  }

  @Public()
  @Get('reference/polikliniks')
  @ApiOperation({
    summary: 'Mendapatkan daftar unit poliklinik aktif untuk referensi jadwal',
    description:
      'Mengambil seluruh unit poliklinik aktif sebagai opsi pilihan poliklinik pada form jadwal dokter.',
  })
  @ApiOkResponse({
    description: 'Daftar poliklinik aktif berhasil diambil',
  })
  async getPolikliniks() {
    return this.scheduleRepo.getPolikliniks();
  }

  @Public()
  @Get('reference/sessions')
  @ApiOperation({
    summary: 'Mendapatkan master sesi praktik dokter dari database policy',
  })
  @ApiOkResponse({
    description: 'Daftar master sesi konsultasi berhasil diambil',
  })
  async getReferenceSessions() {
    const options = await this.scheduleRepo.getScheduleOptions();
    return options.shifts.map((s) => ({
      id: s.shift,
      session: s.id,
      label: s.label,
      startTime: s.startTime,
      endTime: s.endTime,
      timeRange: `${s.startTime} - ${s.endTime}`,
    }));
  }

  @Public()
  @Get(['reference/options', 'options'])
  @ApiOperation({
    summary:
      'Mendapatkan opsi konfigurasi referensi jadwal dokter (shifts, status, time intervals)',
    description:
      'Mengambil master shift praktek, status sesi, dan interval durasi waktu yang berlaku di klinik untuk dropdown dinamis di mobile dan web.',
  })
  @ApiOkResponse({
    description: 'Opsi referensi jadwal berhasil diambil',
  })
  async getScheduleOptions() {
    return this.scheduleRepo.getScheduleOptions();
  }

  @Get('contexts')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary: 'Mendapatkan konteks jadwal dan durasi efektif dokter',
    description:
      'Mengembalikan konteks praktik backend-owned beserta batas waktu, presisi start, dan durasi konsultasi efektif.',
  })
  @ApiOkResponse({
    description: 'Konteks jadwal berhasil diambil',
  })
  async getScheduleContexts(
    @Query() query: ScheduleContextQueryDto,
    @CurrentUser() user: any,
  ) {
    const staffId = this.resolveTargetStaffId(user, query.staffId);
    return this.scheduleRepo.getScheduleContexts(
      staffId,
      query.date,
      user.systemRole === SYSTEM_ROLES.ADMIN,
    );
  }

  @Get('projection')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary: 'Preview proyeksi kapasitas dan durasi konsultasi shift',
    description:
      'Memproyeksikan kapasitas nominal dan durasi konsultasi shift tanpa pemotongan petak interval kaku.',
  })
  @ApiOkResponse({
    description: 'Proyeksi kapasitas shift berhasil dihitung',
  })
  async previewScheduleProjection(
    @Query() query: ScheduleProjectionQueryDto,
    @CurrentUser() user: any,
  ) {
    const staffId = this.resolveTargetStaffId(user, query.staffId);
    return this.scheduleRepo.projectAvailability(
      staffId,
      query,
      user.systemRole === SYSTEM_ROLES.ADMIN,
    );
  }

  @Get('capacity-overview')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary: 'Ringkasan Kapasitas Lane dan Beban Antrean Layanan per Shift',
    description:
      'Menampilkan kapasitas lane (min dokter bertugas dan ruangan aktif), kapasitas nominal, serta rasio beban antrean aktif untuk seluruh shift.',
  })
  @ApiOkResponse({
    description: 'Ringkasan kapasitas lane dan beban antrean berhasil diambil',
    type: ScheduleCapacityOverviewResponse,
  })
  async getCapacityOverview(
    @Query() query: ScheduleCapacityQueryDto,
    @CurrentUser() user: any,
  ) {
    const staffId = this.resolveTargetStaffId(user, query.staffId);
    const data = await this.scheduleRepo.getCapacityOverview(staffId, query);
    return {
      success: true,
      data,
    };
  }

  @Get('booked-patients')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary: 'Melihat daftar pasien terdaftar dokter berdasarkan tanggal',
    description:
      'Mengambil seluruh pasien yang telah mendaftar pada sesi praktek dokter yang login untuk tanggal tertentu.',
  })
  @ApiOkResponse({
    description: 'Daftar pasien terdaftar berhasil diambil',
  })
  async getBookedPatientsByDate(
    @Query() query: BookedPatientsQueryDto,
    @CurrentUser() user: any,
  ) {
    const staffId = user.staff?.practitionerId;
    if (!staffId) {
      throw new ForbiddenException(
        'User bukan praktisi medis dokter terdaftar',
      );
    }
    return this.scheduleRepo.getBookedPatients(undefined, query.date, staffId);
  }

  @Get('poli/:poliklinikId')
  @Roles(SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.STAF, SYSTEM_ROLES.PATIENT)
  @ApiOperation({
    summary: 'Melihat jadwal dokter/bidan aktif di poliklinik tertentu',
    description:
      'Mengambil daftar jadwal dokter yang membuka praktek pada unit poliklinik dan tanggal yang diminta.',
  })
  @ApiParam({
    name: 'poliklinikId',
    description: 'ID unik poliklinik',
    example: 'cd44dd7d-07a9-4e31-9441-3e0e02ddebb1',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Tanggal praktek (YYYY-MM-DD)',
    example: '2026-09-17',
  })
  @ApiOkResponse({
    description: 'Daftar jadwal poliklinik berhasil diambil',
  })
  async getByPoli(
    @Param('poliklinikId') poliklinikId: string,
    @Query('date') date: string,
  ) {
    const targetDate = date
      ? date.trim()
      : new Date().toISOString().split('T')[0];
    return this.scheduleRepo.findByPoliAndDate(poliklinikId, targetDate);
  }

  @Get('sessions/:sessionId/reschedule-eligibility')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Pengecekan pra-syarat (eligibility pre-check) sebelum reschedule sesi dokter (Mobile & Admin)',
    description:
      'Memeriksa apakah sesi asal eligible untuk di-reschedule. Dokter hanya dapat memeriksa sesinya sendiri, sedangkan Admin dapat memeriksa seluruh sesi.',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'ID unik sesi shift jadwal dokter yang akan diperiksa',
    example: '8489be4c-7c05-4c07-b352-7bf579b29cb1',
  })
  @ApiOkResponse({
    type: RescheduleEligibilityResponse,
    description: 'Hasil evaluasi kelayakan reschedule sesi berhasil didapatkan',
  })
  @ApiNotFoundResponse({
    description: 'Sesi jadwal tidak ditemukan',
  })
  async checkRescheduleEligibility(
    @Param('sessionId') sessionId: string,
    @Query() query: CheckRescheduleEligibilityQueryDto,
    @CurrentUser() user?: any,
  ) {
    const session = await this.scheduleRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan`,
      );
    }
    if (user) {
      this.assertScheduleOwnership(session, user);
    }
    const result = await this.scheduleRepo.checkRescheduleEligibility(
      session.staffId,
      sessionId,
      query,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Post('sessions/:sessionId/reschedule')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Menjadwalkan ulang (reschedule) sesi shift praktik dokter ke tanggal/jam baru (Mobile & Admin)',
    description:
      'Memindahkan seluruh sesi jadwal praktik dokter ke tanggal dan jam baru dengan kalkulasi projection otomatis, validasi batas shift & durasi konsultasi, pencegahan konflik jadwal/ruangan, serta sinkronisasi otomatis janji temu pasien aktif.',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'ID unik sesi shift jadwal dokter yang akan di-reschedule',
  })
  @ApiOkResponse({
    description: 'Sesi jadwal praktik dokter berhasil di-reschedule',
  })
  @ApiNotFoundResponse({
    description: 'Sesi jadwal tidak ditemukan',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi form gagal atau jam mulai di luar batas shift',
  })
  async rescheduleSession(
    @Param('sessionId') sessionId: string,
    @Body() body: RescheduleAdminDoctorSessionDto,
    @CurrentUser() user?: any,
  ) {
    const session = await this.scheduleRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan`,
      );
    }
    if (user) {
      this.assertScheduleOwnership(session, user);
    }
    return this.scheduleRepo.rescheduleAdminDoctorSession(
      session.staffId,
      sessionId,
      body,
    );
  }

  @Get('sessions/:sessionId/patients')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Mendapatkan daftar pasien terdaftar pada sesi shift tertentu dokter (Mobile & Admin)',
    description:
      'Menampilkan data pasien terdaftar (nama, keluhan, ruangan, jam/nomor antrean, status, data demografis NIK/RM/alamat/wali lengkap, dan booking metadata).',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'ID unik sesi shift jadwal dokter',
    example: '8489be4c-7c05-4c07-b352-7bf579b29cb1',
  })
  @ApiOkResponse({
    type: AdminSessionPatientsResponse,
    description: 'Daftar pasien terdaftar pada sesi berhasil diambil',
  })
  @ApiNotFoundResponse({
    description: 'Sesi jadwal tidak ditemukan',
  })
  async getSessionPatients(
    @Param('sessionId') sessionId: string,
    @Query() query: GetSessionPatientsQueryDto,
    @CurrentUser() user?: any,
  ) {
    const doctorPractitionerId = user?.staff?.practitionerId;
    if (doctorPractitionerId && user.systemRole !== SYSTEM_ROLES.ADMIN) {
      return this.scheduleRepo.getAdminSessionPatients(
        doctorPractitionerId,
        sessionId,
        query,
      );
    }

    const session = await this.scheduleRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan`,
      );
    }
    if (user) {
      this.assertScheduleOwnership(session, user);
    }
    return this.scheduleRepo.getAdminSessionPatients(
      session.staffId,
      sessionId,
      query,
    );
  }

  @Get(':id/booked-patients')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary: 'Melihat daftar pasien yang terdaftar pada satu sesi jadwal',
    description:
      'Mengambil seluruh pasien yang telah memesan janji temu untuk sesi praktek spesifik ini.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik sesi jadwal praktek',
    example: '67212c38-ca4a-45f8-b9bc-ebe2fd82b0a1',
  })
  @ApiOkResponse({
    description: 'Daftar pasien terdaftar pada sesi ini berhasil diambil',
  })
  async getBookedPatientsForSession(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    const schedule = await this.scheduleRepo.findById(id);
    if (!schedule) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    this.assertScheduleOwnership(schedule, user);
    return this.scheduleRepo.getBookedPatients(id);
  }

  @Public()
  @Get('booking-options')
  @ApiOperation({
    summary:
      'Mendapatkan opsi sesi booking jadwal per shift dengan ketersediaan dokter',
    description:
      'Menghasilkan 4 sesi (DINI_HARI, PAGI, SIANG, MALAM) lengkap dengan jam operasional, ketersediaan roster dokter, dan flag isDisabled. Front-end tidak perlu menghitung kalkulasi slot.',
  })
  @ApiQuery({ name: 'date', required: true, example: '2026-10-11' })
  @ApiQuery({ name: 'poliklinikId', required: false })
  @ApiQuery({ name: 'staffId', required: false })
  @ApiOkResponse({ description: 'Opsi sesi booking berhasil dimuat' })
  async getBookingOptions(
    @Query('date') date: string,
    @Query('poliklinikId') poliklinikId?: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.scheduleRepo.getBookingOptions(date, poliklinikId, staffId);
  }

  @Get(':id')
  @Roles(SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.STAF, SYSTEM_ROLES.PATIENT)
  @ApiOperation({
    summary: 'Mendapatkan detail jadwal berdasarkan ID',
    description: 'Mengambil informasi lengkap satu jadwal dinas staf.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik jadwal praktek',
    example: '67212c38-ca4a-45f8-b9bc-ebe2fd82b0a1',
  })
  @ApiOkResponse({ description: 'Detail jadwal ditemukan' })
  @ApiNotFoundResponse({ description: 'Jadwal tidak ditemukan' })
  async getScheduleById(@Param('id') id: string) {
    const schedule = await this.scheduleRepo.findById(id);
    if (!schedule) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    return schedule;
  }

  @Patch(':id/availability')
  @Roles(SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.STAF)
  @ApiOperation({
    summary: 'Mengaktifkan / menonaktifkan ketersediaan jadwal staf',
    description:
      'Mengaktifkan atau menonaktifkan status buka/tutup pada jadwal terkait.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik jadwal praktek',
    example: '67212c38-ca4a-45f8-b9bc-ebe2fd82b0a1',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        isAvailable: {
          type: 'boolean',
          example: true,
          description: 'Status ketersediaan jadwal',
        },
      },
      required: ['isAvailable'],
    },
  })
  @ApiOkResponse({
    description: 'Status ketersediaan jadwal berhasil diperbarui',
  })
  @ApiNotFoundResponse({ description: 'Jadwal tidak ditemukan' })
  async toggleAvailability(
    @Param('id') id: string,
    @Body('isAvailable') isAvailable: boolean,
    @CurrentUser() user: any,
  ) {
    const existing = await this.scheduleRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    this.assertScheduleOwnership(existing, user);

    const updated = await this.scheduleRepo.toggleAvailability(id, isAvailable);
    if (!updated) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @Patch(':id')
  @Roles(SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.STAF)
  @ApiOperation({
    summary: 'Memperbarui informasi jadwal praktek',
    description:
      'Mengubah jam mulai, jam selesai, ruangan, status buka/tutup, atau catatan jadwal praktek.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik jadwal praktek',
    example: '67212c38-ca4a-45f8-b9bc-ebe2fd82b0a1',
  })
  @ApiOkResponse({ description: 'Jadwal berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Jadwal tidak ditemukan' })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi perubahan jadwal gagal',
  })
  async updateSchedule(
    @Param('id') id: string,
    @Body() body: UpdateScheduleDto,
    @CurrentUser() user: any,
  ) {
    const existing = await this.scheduleRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    this.assertScheduleOwnership(existing, user);

    const updated = await this.scheduleRepo.update(id, {
      session: body.session,
      sessionLabel: body.sessionType || body.session,
      startTime: body.startTime,
      endTime: body.endTime,
      roomId: body.roomId,
      poliklinikId: body.poliklinikId,
      serviceId: body.serviceId,
      status: body.status,
      isAvailable: body.isAvailable,
      notes: body.notes,
    });
    if (!updated) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @Delete(':id')
  @Roles(SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.STAF)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus jadwal staf (Admin / Staf Dokter)',
    description:
      'Menghapus jadwal praktek dokter dari sistem dengan perlindungan booking aktif.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik jadwal praktek',
    example: '67212c38-ca4a-45f8-b9bc-ebe2fd82b0a1',
  })
  @ApiNoContentResponse({ description: 'Jadwal berhasil dihapus' })
  @ApiNotFoundResponse({ description: 'Jadwal tidak ditemukan' })
  async deleteSchedule(@Param('id') id: string, @CurrentUser() user: any) {
    const existing = await this.scheduleRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    this.assertScheduleOwnership(existing, user);

    const success = await this.scheduleRepo.delete(id);
    if (!success) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
  }
}
