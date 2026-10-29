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
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { Idempotent } from '../../../common/decorators/idempotent.decorator';
import { REPLACEMENT_OPPORTUNITY_STATUSES } from '../../../database/schema';
import { zodPipe } from '../../../common/validation';
import {
  QueryReplacementsInput,
  QueryReplacementsSchema,
} from './schemas/query-replacements.schema';
import {
  ReplacementParamInput,
  ReplacementParamSchema,
} from './schemas/replacement-param.schema';
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

  @Get('facets')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Mendapatkan metadata facet peluang pengganti (Mobile KAI Carousel & Filter)',
    description:
      'Mengembalikan daftar staf yang sedang cuti dan tanggal yang memiliki peluang pengganti terbuka.',
  })
  @ApiOkResponse({
    description: 'Metadata facet peluang pengganti berhasil diambil',
  })
  async getFacets() {
    return this.replacementRepo.getReplacementFacets();
  }

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
    name: 'exactDate',
    required: false,
    description: 'Filter tanggal spesifik peluang pengganti (YYYY-MM-DD)',
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
  @ApiQuery({
    name: 'staffProfileId',
    required: false,
    description: 'Filter profil staf yang cuti / digantikan (UUID)',
  })
  @ApiOkResponse({
    description: 'Daftar peluang pengganti berhasil diambil',
  })
  async getOpportunities(
    @Query(zodPipe(QueryReplacementsSchema)) query: QueryReplacementsInput,
  ) {
    return this.replacementRepo.findOpportunities({
      date: query.date,
      exactDate: query.exactDate,
      startDate: query.startDate,
      endDate: query.endDate,
      status: query.status,
      staffProfileId: query.staffProfileId,
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
  async claimOpportunity(
    @Param(zodPipe(ReplacementParamSchema)) param: ReplacementParamInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }

    return this.replacementRepo.claimOpportunity(
      param.id,
      user.staff.id,
      user.staff.practitionerId ?? undefined,
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
    @Param(zodPipe(ReplacementParamSchema)) param: ReplacementParamInput,
    @Body() dto: AssignReplacementDto,
  ) {
    return this.replacementRepo.assignOpportunity(
      param.id,
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
    @Param(zodPipe(ReplacementParamSchema)) param: ReplacementParamInput,
    @Body() dto?: CancelReplacementDto,
  ) {
    return this.replacementRepo.cancelOpportunity(param.id, dto?.reason);
  }
}
