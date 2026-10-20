import {
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
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Melihat daftar peluang jadwal pengganti (Mobile App & Admin)',
    description:
      'Menampilkan sesi dinas rekan yang cuti (terbuka maupun yang telah diklaim).',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Filter tanggal awal peluang pengganti (YYYY-MM-DD)',
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
    @Query('status') status?: ReplacementOpportunityFilter['status'],
  ) {
    return this.replacementRepo.findOpportunities({ date, status });
  }

  @Post(':id/claim')
  @Roles('STAF')
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
      user.doctor?.id,
    );
  }
}
