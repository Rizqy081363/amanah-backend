import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
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
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { SYSTEM_ROLES } from '../../../auth/constants/auth.constants';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { STAFF_TYPES } from '../../../common/constants/staff-types.constant';
import { Idempotent } from '../../../common/decorators/idempotent.decorator';
import { DailyLeavePayrollService } from '../application/services/daily-leave-payroll.service';
import {
  PAYROLL_REPOSITORY,
  PayrollRepository,
} from '../domain/repositories/payroll.repository';
import { CalculatePayrollDto } from './dto/calculate-payroll.dto';

@ApiTags('Payroll Engine (Kalkulasi Penggajian Staf & Dokter)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description: 'Akses ditolak: Hanya staf atau admin yang diizinkan',
})
@Controller({ path: 'payroll', version: '1' })
export class PayrollController {
  constructor(
    @Inject(PAYROLL_REPOSITORY)
    private readonly payrollRepo: PayrollRepository,
    @Optional()
    private readonly dailyLeaveService?: DailyLeavePayrollService,
  ) {}

  @Post('reconcile-leave')
  @Roles(SYSTEM_ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin memicu konsolidasi pemotongan cuti harian on-demand',
    description:
      'Menghitung dan memotong cuti yang disetujui untuk tanggal tertentu atau rentang tanggal serta mengirimkan notifikasi.',
  })
  async reconcileDailyLeave(
    @Query('targetDate') targetDate?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('force') force?: string,
  ) {
    if (!this.dailyLeaveService) {
      throw new Error('DailyLeavePayrollService is not available');
    }
    const forceAllShifts = force === 'false' ? false : true;
    return this.dailyLeaveService.processDailyLeave({
      targetDate,
      startDate,
      endDate,
      forceAllShifts,
    });
  }

  @Get('filter-options')
  @Roles(SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Admin mendapatkan opsi filter penggajian dinamis (Web Dashboard & Mobile)',
    description:
      'Menampilkan opsi kategori staf, daftar periode aktif, dan status buku besar penggajian.',
  })
  @ApiOkResponse({ description: 'Opsi filter penggajian berhasil diambil' })
  async getFilterOptions() {
    return this.payrollRepo.getPayrollFilterOptions();
  }

  @Get('periods')
  @Roles(SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.STAF)
  @ApiOperation({
    summary: 'Admin melihat daftar seluruh periode penggajian (Web Dashboard)',
    description:
      'Menampilkan riwayat periode kalkulasi gaji bulanan beserta total payout.',
  })
  @ApiOkResponse({ description: 'Daftar periode penggajian berhasil diambil' })
  async getPeriods() {
    return this.payrollRepo.findPeriods();
  }

  @Get('periods/:id')
  @Roles(SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary: 'Admin melihat detail periode penggajian dan rekapitulasi staf',
    description:
      'Menampilkan detail periode beserta rincian slip gaji untuk seluruh dokter, bidan, dan staf operasional.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID periode payroll (UUID)',
  })
  @ApiOkResponse({
    description: 'Detail periode dan rekap gaji staf berhasil diambil',
  })
  @ApiNotFoundResponse({ description: 'Periode tidak ditemukan' })
  async getPeriodDetail(@Param('id') id: string) {
    const result = await this.payrollRepo.findPeriodWithSummaries(id);
    if (!result) {
      throw new NotFoundException(
        `Periode payroll dengan ID ${id} tidak ditemukan`,
      );
    }
    return result;
  }

  @Post('calculate')
  @Roles(SYSTEM_ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin memicu kalkulasi payroll periode tertentu (Web Dashboard)',
    description:
      'Mengkalkulasikan jam dinas jadwal, potongan cuti yang disetujui, dan penambahan dinas pengganti.',
  })
  @ApiCreatedResponse({ description: 'Kalkulasi payroll berhasil diproses' })
  @Idempotent()
  async calculatePeriod(
    @Body() body: CalculatePayrollDto,
    @CurrentUser() user: any,
  ) {
    return this.payrollRepo.calculatePeriod(
      body.periodStart,
      body.periodEnd,
      body.periodName,
      user.id,
    );
  }

  @Patch('periods/:id/finalize')
  @Roles(SYSTEM_ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin menutup buku periode penggajian (Finalize / Lock Period)',
    description:
      'Mengunci periode dan seluruh slip gaji secara permanen sehingga kebal terhadap perubahan tarif masa depan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID periode payroll (UUID)',
  })
  @ApiOkResponse({
    description: 'Periode payroll berhasil ditutup buku (FINALIZED)',
  })
  @ApiNotFoundResponse({ description: 'Periode tidak ditemukan' })
  async finalizePeriod(@Param('id') id: string, @CurrentUser() user: any) {
    return this.payrollRepo.finalizePeriod(id, user.id);
  }

  @Get('staff/:staffId')
  @Roles(SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Admin melihat rincian kalkulasi gaji seorang staf (Web Dashboard)',
    description:
      'Menampilkan rincian earnings pokok, pemotongan izin, dan penambahan pengganti staf.',
  })
  @ApiParam({
    name: 'staffId',
    description: 'ID staf (staff_profiles)',
  })
  @ApiQuery({
    name: 'periodId',
    required: false,
    description: 'ID periode penggajian spesifik opsional',
  })
  @ApiOkResponse({ description: 'Rincian gaji staf berhasil diambil' })
  @ApiNotFoundResponse({ description: 'Staf tidak ditemukan' })
  async getStaffPayroll(
    @Param('staffId') staffId: string,
    @Query('periodId') periodId?: string,
  ) {
    const summary = await this.payrollRepo.getStaffPayroll(staffId, periodId);
    if (!summary) {
      throw new NotFoundException(`Data gaji staf ${staffId} tidak ditemukan`);
    }
    return summary;
  }

  @Get('my-summary')
  @Roles(SYSTEM_ROLES.STAF)
  @ApiOperation({
    summary: 'Staf / Dokter melihat rincian gaji pribadinya (Mobile App)',
    description:
      'Menampilkan rekapitulasi gaji berjalan staf yang login (jam dinas, potongan cuti, insentif pengganti).',
  })
  @ApiQuery({
    name: 'periodId',
    required: false,
    description: 'ID periode penggajian tertentu',
  })
  @ApiOkResponse({ description: 'Ringkasan gaji staf berhasil diambil' })
  async getMyPayroll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('periodId') periodId?: string,
  ) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }
    const summary = await this.payrollRepo.getStaffPayroll(
      user.staff.id,
      periodId,
    );
    return (
      summary || {
        staffId: user.staff.id,
        staffCode: user.staff.staffCode || undefined,
        fullName: user.name,
        staffType: user.staff.staffType || STAFF_TYPES.WORKER,
        positionTitle: user.staff.profession || undefined,
        departmentName: undefined,
        periodId,
        baseHours: 0,
        deductionHours: 0,
        additionHours: 0,
        baseEarnings: 0,
        grossEarnings: 0,
        leaveDeductions: 0,
        replacementAdditions: 0,
        netPayroll: 0,
        entries: [],
      }
    );
  }

  @Get('my-history')
  @Roles(SYSTEM_ROLES.STAF)
  @ApiOperation({
    summary:
      'Staf / Dokter melihat riwayat penggajian buku besar per bulan (Mobile App Screen 2)',
    description:
      'Menampilkan riwayat buku besar penggajian dikelompokkan per bulan beserta rincian transaksi harian.',
  })
  @ApiOkResponse({
    description: 'Riwayat buku besar penggajian staf berhasil diambil',
  })
  async getMyPayrollHistory(@CurrentUser() user: AuthenticatedUser) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }
    return this.payrollRepo.getStaffPayrollHistory(user.staff.id);
  }
}
