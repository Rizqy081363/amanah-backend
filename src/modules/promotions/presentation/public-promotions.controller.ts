import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../../common/auth/public.decorator';
import { PromotionsService } from '../application/promotions.service';

@ApiTags('Public Promotions & Announcements')
@Controller({ path: 'public/promotions', version: '1' })
export class PublicPromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Mendapatkan seluruh promosi & pengumuman aktif untuk website publik',
    description:
      'Endpoint publik tanpa otentikasi. Mengembalikan promo dengan status live yang diprioritaskan untuk penempatan banner, modal, dan section.',
  })
  @ApiOkResponse({
    description: 'Daftar promosi aktif berhasil diambil',
  })
  async getPublicPromotions(@Res({ passthrough: true }) res: Response) {
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300',
    );
    return this.promotionsService.getLivePublicPromotions();
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Mendapatkan detail promosi aktif berdasarkan ID untuk website publik',
    description:
      'Endpoint publik tanpa otentikasi. Mengembalikan rincian promo berstatus live untuk ditampilkan pada halaman detail.',
  })
  @ApiOkResponse({
    description: 'Detail promosi aktif berhasil diambil',
  })
  async getPublicPromotionById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300',
    );
    return this.promotionsService.getPublicPromotionById(id);
  }
}
