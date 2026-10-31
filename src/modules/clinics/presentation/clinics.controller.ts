import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../../common/auth/public.decorator';
import { HttpCache } from '../../../common/decorators/http-cache.decorator';
import { ClinicsService } from '../application/clinics.service';
import { ServiceCatalogResponseDto } from './dto/service-catalog.dto';

@ApiTags('Clinics (Poliklinik & Layanan)')
@Controller({ path: 'clinics', version: '1' })
export class ClinicsController {
  constructor(private readonly clinicsService: ClinicsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary:
      'Mendapatkan seluruh daftar unit poliklinik aktif',
    description:
      'Endpoint publik untuk melihat poliklinik yang tersedia di klinik beserta status operasionalnya.',
  })
  @ApiOkResponse({
    description: 'Daftar poliklinik aktif berhasil diambil',
  })
  @HttpCache({ ttlSeconds: 300, tags: ['clinics'] })
  async getClinics() {
    return this.clinicsService.findAllPoliklinik();
  }

  @Public()
  @Get('poliklinik')
  @ApiOperation({
    summary: 'Mendapatkan seluruh daftar poliklinik aktif (Alias)',
    description: 'Alias rute publik untuk mendapatkan daftar poliklinik.',
  })
  @ApiOkResponse({
    description: 'Daftar poliklinik berhasil diambil',
  })
  @HttpCache({ ttlSeconds: 300, tags: ['clinics'] })
  async getPoliklinik() {
    return this.clinicsService.findAllPoliklinik();
  }

  @Public()
  @Get('services/catalog')
  @ApiOperation({
    summary: 'Mendapatkan seluruh katalog kategori dan layanan klinik (SSOT)',
    description:
      'Mengambil hierarki kategori layanan beserta daftar tindakan medis, poliklinik tujuan, dan pilihan keluhan bawaan.',
  })
  @ApiOkResponse({
    description: 'Katalog layanan berhasil diambil',
    type: ServiceCatalogResponseDto,
  })
  @HttpCache({ ttlSeconds: 300, tags: ['clinics', 'catalog'] })
  async getServiceCatalog(): Promise<ServiceCatalogResponseDto> {
    return this.clinicsService.getCatalog();
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Mendapatkan detail poliklinik berdasarkan ID',
    description:
      'Mengambil data spesifik poliklinik termasuk nama dan kode poli.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik poliklinik',
    example: 'cd44dd7d-07a9-4e31-9441-3e0e02ddebb1',
  })
  @ApiOkResponse({
    description: 'Detail poliklinik berhasil ditemukan',
  })
  @ApiNotFoundResponse({
    description: 'Poliklinik dengan ID yang diminta tidak ditemukan',
  })
  async getClinicById(@Param('id') id: string) {
    return this.clinicsService.findPoliklinikById(id);
  }

  @Public()
  @Get(':id/layanan')
  @ApiOperation({
    summary: 'Mendapatkan daftar layanan/tindakan berdasarkan ID poliklinik',
    description:
      'Mengambil seluruh layanan yang disediakan oleh poliklinik spesifik.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik poliklinik',
    example: 'cd44dd7d-07a9-4e31-9441-3e0e02ddebb1',
  })
  @ApiOkResponse({ description: 'Daftar layanan berhasil diambil' })
  @HttpCache({ ttlSeconds: 300, tags: ['clinics'] })
  async getLayananByPoli(@Param('id') id: string) {
    return this.clinicsService.findLayananByPoliId(id);
  }

  @Public()
  @Get('poliklinik/:id/services')
  @ApiOperation({
    summary: 'Mendapatkan daftar layanan berdasarkan ID poliklinik (Alias)',
    description:
      'Alias rute publik untuk mendapatkan daftar tindakan medis poliklinik.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik poliklinik',
    example: 'cd44dd7d-07a9-4e31-9441-3e0e02ddebb1',
  })
  @ApiOkResponse({ description: 'Daftar layanan berhasil diambil' })
  @HttpCache({ ttlSeconds: 300, tags: ['clinics'] })
  async getServicesByPoli(@Param('id') id: string) {
    return this.clinicsService.findLayananByPoliId(id);
  }
}
