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
import {
  REPLACEMENT_REPOSITORY,
  ReplacementRepository,
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
    summary: 'Melihat daftar peluang jadwal pengganti yang terbuka (Mobile App & Admin)',
    description:
      'Menampilkan sesi dinas rekan yang cuti dan terbuka untuk diambil sebagai lembur/pengganti.',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Filter tanggal awal peluang pengganti (YYYY-MM-DD)',
  })
  @ApiOkResponse({
    description: 'Daftar peluang pengganti berhasil diambil',
  })
  async getOpenOpportunities(@Query('date') date?: string) {
    return this.replacementRepo.findOpenOpportunities(date);
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
