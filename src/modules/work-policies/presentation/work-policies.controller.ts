import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import {
  WORK_POLICY_REPOSITORY,
  WorkPolicyRepository,
} from '../domain/repositories/work-policy.repository';
import { UpdateCompensationRatesDto } from './dto/update-compensation-rates.dto';
import { UpdateLeavePolicyDto } from './dto/update-leave-policy.dto';

@ApiTags('Work Policies & Rates (Kebijakan Cuti & Tarif)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description: 'Akses ditolak: Hanya Admin yang berwenang',
})
@Controller({ path: 'work-policies', version: '1' })
export class WorkPoliciesController {
  constructor(
    @Inject(WORK_POLICY_REPOSITORY)
    private readonly policyRepo: WorkPolicyRepository,
  ) {}

  @Get('current')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Mendapatkan kebijakan cuti dan tarif kompensasi aktif saat ini',
    description:
      'Menampilkan leave_policy aktif dan daftar tarif per jam dokter, bidan, dan staf operasional.',
  })
  @ApiOkResponse({
    description: 'Kebijakan dan tarif aktif berhasil diambil',
  })
  async getCurrent() {
    const [policy, rates] = await Promise.all([
      this.policyRepo.getActiveLeavePolicy(),
      this.policyRepo.getActiveCompensationRates(),
    ]);

    return {
      policy,
      rates,
    };
  }

  @Patch('leave-policy')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin memperbarui konfigurasi kebijakan cuti (Web Dashboard)',
    description:
      'Mengubah toggle persetujuan admin, mode kuota bulanan, dan batas maksimum izin per bulan.',
  })
  @ApiOkResponse({ description: 'Kebijakan cuti berhasil diperbarui' })
  async updateLeavePolicy(
    @Body() body: UpdateLeavePolicyDto,
    @CurrentUser() user: any,
  ) {
    return this.policyRepo.updateLeavePolicy(body, user.id);
  }

  @Put('compensation-rates')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin memperbarui tarif kerja per jam staf (Web Dashboard)',
    description:
      'Memperbarui tarif dasar dan tarif lembur/pengganti untuk dokter, bidan, dan staf operasional.',
  })
  @ApiOkResponse({ description: 'Tarif kompensasi berhasil diperbarui' })
  async updateCompensationRates(
    @Body() body: UpdateCompensationRatesDto,
    @CurrentUser() user: any,
  ) {
    return this.policyRepo.updateCompensationRates(body.rates, user.id);
  }
}
