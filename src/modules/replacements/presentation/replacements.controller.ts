import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SYSTEM_ROLES } from '../../../auth/constants/auth.constants';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Idempotent } from '../../../common/decorators/idempotent.decorator';
import { REPLACEMENT_OPPORTUNITY_STATUSES } from '../../../database/schema';
import {
  REPLACEMENT_REPOSITORY,
  type ReplacementOpportunityFilter,
  type ReplacementRepository,
} from '../domain/repositories/replacement.repository';
import { AssignReplacementDto } from './dto/assign-replacement.dto';
import { CancelReplacementDto } from './dto/cancel-replacement.dto';

@ApiTags('Replacement Opportunities (Jadwal Pengganti & Cuti Terbuka)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description: 'Akses ditolak: Hanya staf terdaftar yang diizinkan',
})
@Controller({ path: 'replacements', version: '1' })
export class ReplacementsController {
  constructor(
    @Inject(REPLACEMENT_REPOSITORY)
    private readonly replacementRepo: ReplacementRepository,
  ) {}

  @Get(['', 'opportunities'])
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary: 'Melihat daftar peluang jadwal pengganti (Mobile App & Admin)',
    description:
      'Menampilkan sesi dinas rekan yang cuti (terbuka maupun yang telah diklaim).',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Filter tanggal awal peluang pengganti (YYYY-MM-DD atau all)',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter rentang awal tanggal dinas (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter rentang akhir tanggal dinas (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['all', ...REPLACEMENT_OPPORTUNITY_STATUSES],
    description:
      'Filter status peluang pengganti (all | open | claimed | completed | cancelled). Default: all',
  })
  @ApiOkResponse({
    description: 'Daftar peluang pengganti berhasil diambil',
  })
  async getOpportunities(
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: ReplacementOpportunityFilter['status'],
  ) {
    return this.replacementRepo.findOpportunities({
      date,
      startDate,
      endDate,
      status,
    });
  }

  @Post(':id/claim')
  @Roles(SYSTEM_ROLES.STAF)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Staf mengklaim peluang sesi dinas pengganti (Mobile App)',
    description:
      'Secara atomik mengunci dan mengklaim sesi dinas pengganti agar tidak diambil orang lain.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik peluang pengganti (replacement_opportunities)',
  })
  @ApiOkResponse({ description: 'Peluang pengganti berhasil diklaim' })
  @ApiConflictResponse({
    description: 'Sesi sudah diklaim oleh rekan lain',
  })
  @ApiNotFoundResponse({ description: 'Peluang pengganti tidak ditemukan' })
  @Idempotent()
  async claimOpportunity(@Param('id') id: string, @CurrentUser() user: any) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }

    return this.replacementRepo.claimOpportunity(
      id,
      user.staff.id,
      user.staff.practitionerId ?? null,
    );
  }

  @Post(':id/assign')
  @Roles(SYSTEM_ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin menugaskan staf pengganti secara langsung (Web Admin)',
    description:
      'Menetapkan staf pengganti untuk peluang sesi dinas terbuka atau pergantian penugasan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik peluang pengganti (replacement_opportunities)',
  })
  @ApiOkResponse({ description: 'Staf pengganti berhasil ditugaskan' })
  @ApiNotFoundResponse({ description: 'Peluang pengganti tidak ditemukan' })
  @Idempotent()
  async assignOpportunity(
    @Param('id') id: string,
    @Body() dto: AssignReplacementDto,
  ) {
    return this.replacementRepo.assignOpportunity(
      id,
      dto.staffProfileId,
      dto.practitionerId,
      dto.notes,
    );
  }

  @Post(':id/cancel')
  @Roles(SYSTEM_ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin membatalkan peluang dinas pengganti (Web Admin)',
    description: 'Mengubah status peluang dinas pengganti menjadi cancelled.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik peluang pengganti (replacement_opportunities)',
  })
  @ApiOkResponse({ description: 'Peluang pengganti berhasil dibatalkan' })
  @ApiNotFoundResponse({ description: 'Peluang pengganti tidak ditemukan' })
  @Idempotent()
  async cancelOpportunity(
    @Param('id') id: string,
    @Body() dto?: CancelReplacementDto,
  ) {
    return this.replacementRepo.cancelOpportunity(id, dto?.reason);
  }
}
