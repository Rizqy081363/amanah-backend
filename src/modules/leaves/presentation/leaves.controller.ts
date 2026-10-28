import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
import type { AuthenticatedUser } from '../../../common/auth';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Idempotent } from '../../../common/decorators/idempotent.decorator';
import { zodPipe } from '../../../common/validation';
import {
  CancelLeaveUseCase,
  GetAllLeavesUseCase,
  GetEligibleSessionsUseCase,
  GetMyLeavesUseCase,
  GetPendingLeavesUseCase,
  RequestLeaveUseCase,
  ReviewLeaveUseCase,
} from '../application/use-cases';
import {
  EligibleSessionsQueryInput,
  EligibleSessionsQuerySchema,
  LeaveParamInput,
  LeaveParamSchema,
  QueryLeavesInput,
  QueryLeavesSchema,
  RequestLeaveInput,
  RequestLeaveSchema,
  ReviewLeaveInput,
  ReviewLeaveSchema,
} from './schemas';

@ApiTags('Staff Leaves (Perizinan Cuti Staf)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description: 'Akses ditolak: Hanya staf atau admin yang berwenang',
})
@Controller({ path: 'leaves', version: '1' })
export class LeavesController {
  constructor(
    private readonly requestLeaveUseCase: RequestLeaveUseCase,
    private readonly reviewLeaveUseCase: ReviewLeaveUseCase,
    private readonly cancelLeaveUseCase: CancelLeaveUseCase,
    private readonly getMyLeavesUseCase: GetMyLeavesUseCase,
    private readonly getEligibleSessionsUseCase: GetEligibleSessionsUseCase,
    private readonly getAllLeavesUseCase: GetAllLeavesUseCase,
    private readonly getPendingLeavesUseCase: GetPendingLeavesUseCase,
  ) {}

  @Get('eligible-sessions')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Melihat sesi jadwal yang eligible untuk diajukan cuti (Mobile App & Web)',
    description:
      'Mengambil sesi dinas aktif staf atau dokter pada tanggal tertentu berdasarkan roster resmi.',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Tanggal yang ingin diperiksa sesi dinasnya (YYYY-MM-DD)',
    example: '2026-10-20',
  })
  @ApiOkResponse({ description: 'Daftar sesi eligible berhasil diambil' })
  async getEligibleSessions(
    @Query(zodPipe(EligibleSessionsQuerySchema))
    query: EligibleSessionsQueryInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.getEligibleSessionsUseCase.execute(query?.date, user);
  }

  @Post()
  @Roles(SYSTEM_ROLES.STAF)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Staf mengajukan permohonan cuti / izin (Mobile App)',
    description:
      'Mengajukan permohonan izin kerja (per sesi atau satu hari penuh) sesuai jadwal roster resmi.',
  })
  @ApiCreatedResponse({ description: 'Permohonan cuti berhasil diajukan' })
  @ApiForbiddenResponse({ description: 'User bukan staf terdaftar' })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi rentang tanggal atau alasan cuti gagal',
  })
  @Idempotent()
  async requestLeave(
    @Body(zodPipe(RequestLeaveSchema)) body: RequestLeaveInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requestLeaveUseCase.execute(body, user);
  }

  @Get('my-leaves')
  @Roles(SYSTEM_ROLES.STAF)
  @ApiOperation({
    summary: 'Melihat riwayat pengajuan cuti staf login (Mobile App)',
    description:
      'Menampilkan seluruh status pengajuan permohonan cuti staf (pending, approved, rejected, cancelled).',
  })
  @ApiOkResponse({
    description: 'Daftar permohonan cuti staf berhasil diambil',
  })
  @ApiForbiddenResponse({ description: 'User bukan staf terdaftar' })
  async getMyLeaves(@CurrentUser() user: AuthenticatedUser) {
    return this.getMyLeavesUseCase.execute(user);
  }

  @Get('pending')
  @Roles(SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Admin melihat daftar pengajuan cuti yang butuh persetujuan (Web Dashboard)',
    description:
      'Menampilkan seluruh pengajuan izin staf dengan status pending untuk ditinjau oleh Admin/SDM.',
  })
  @ApiOkResponse({
    description: 'Daftar permohonan cuti pending berhasil diambil',
  })
  @ApiForbiddenResponse({ description: 'Hanya Admin yang diizinkan' })
  async getPendingLeaves() {
    return this.getPendingLeavesUseCase.execute();
  }

  @Get('all')
  @Roles(SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary: 'Admin melihat seluruh data permohonan cuti (Web Dashboard)',
    description:
      'Menampilkan riwayat cuti staf dengan filter status dan tipe staf opsional.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter status (pending, approved, rejected, cancelled)',
  })
  @ApiQuery({
    name: 'staffType',
    required: false,
    description: 'Filter jenis staf (doctor, midwife, worker)',
  })
  @ApiOkResponse({ description: 'Daftar seluruh cuti staf berhasil diambil' })
  async getAllLeaves(
    @Query(zodPipe(QueryLeavesSchema)) query: QueryLeavesInput,
  ) {
    return this.getAllLeavesUseCase.execute(query);
  }

  @Patch(':id/status')
  @Roles(SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary: 'Admin menyetujui atau menolak cuti staf (Web Dashboard)',
    description:
      'Memperbarui status permohonan cuti staf menjadi approved atau rejected serta membuka jadwal pengganti jika disetujui.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik permohonan cuti',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Status cuti berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Permohonan cuti tidak ditemukan' })
  @ApiForbiddenResponse({ description: 'Hanya Admin yang diizinkan' })
  async reviewLeave(
    @Param(zodPipe(LeaveParamSchema)) param: LeaveParamInput,
    @Body(zodPipe(ReviewLeaveSchema)) body: ReviewLeaveInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewLeaveUseCase.execute(param.id, body, user);
  }

  @Patch(':id/cancel')
  @Roles(SYSTEM_ROLES.STAF)
  @ApiOperation({
    summary:
      'Staf membatalkan pengajuan cuti sendiri yang masih pending (Mobile App)',
    description:
      'Membatalkan permohonan cuti yang telah diajukan sebelum disetujui atau ditolak oleh Admin.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik permohonan cuti',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Pengajuan cuti berhasil dibatalkan' })
  @ApiNotFoundResponse({ description: 'Pengajuan cuti tidak ditemukan' })
  @ApiForbiddenResponse({
    description: 'Akses ditolak atau bukan milik staf login',
  })
  @ApiBadRequestResponse({
    description: 'Hanya pengajuan cuti berstatus pending yang dapat dibatalkan',
  })
  async cancelLeave(
    @Param(zodPipe(LeaveParamSchema)) param: LeaveParamInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cancelLeaveUseCase.execute(param.id, user);
  }
}
