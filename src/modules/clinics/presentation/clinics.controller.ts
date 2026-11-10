import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../../common/auth/public.decorator';
import { HttpCache } from '../../../common/decorators/http-cache.decorator';
import { ClinicFacilitiesService } from '../application/clinic-facilities.service';
import { ClinicsService } from '../application/clinics.service';
import { SupportFaqsService } from '../application/support-faqs.service';
import { ClinicFacilityResponseDto } from './dto/clinic-facility.dto';
import { ServiceCatalogResponseDto } from './dto/service-catalog.dto';
import { SupportFaqResponseDto } from './dto/support-faq.dto';

@ApiTags('Clinics (Poliklinik & Layanan)')
@Controller({ path: 'clinics', version: '1' })
export class ClinicsController {
  constructor(
    private readonly clinicsService: ClinicsService,
    private readonly clinicFacilitiesService: ClinicFacilitiesService,
    private readonly supportFaqsService: SupportFaqsService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Mendapatkan seluruh daftar unit poliklinik aktif',
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
    summary: 'Mendapatkan seluruh katalog kategori dan services klinik (SSOT)',
    description:
      'Mengambil hierarki kategori beserta daftar services, poliklinik tujuan, dan pilihan keluhan bawaan.',
  })
  @ApiOkResponse({
    description: 'Katalog services berhasil diambil',
    type: ServiceCatalogResponseDto,
  })
  @HttpCache({ ttlSeconds: 300, tags: ['clinics', 'catalog'] })
  async getServiceCatalog(): Promise<ServiceCatalogResponseDto> {
    return this.clinicsService.getCatalog();
  }

  @Public()
  @Get('facilities')
  @ApiOperation({
    summary: 'Mendapatkan daftar fasilitas unggulan aktif klinik',
    description:
      'Endpoint publik untuk carousel fasilitas di landing page, menampilkan apotek, ruang bersalin, ruang tunggu, dll.',
  })
  @ApiOkResponse({
    description: 'Daftar fasilitas unggulan berhasil diambil',
    type: [ClinicFacilityResponseDto],
  })
  @HttpCache({ ttlSeconds: 300, tags: ['clinics', 'facilities'] })
  async getFacilities(): Promise<ClinicFacilityResponseDto[]> {
    return this.clinicFacilitiesService.getPublishedFacilities();
  }

  @Public()
  @Get('faqs')
  @ApiOperation({
    summary: 'Mendapatkan daftar FAQ publik klinik',
    description:
      'Endpoint publik untuk akordeon FAQ landing page, dapat difilter berdasarkan path halaman.',
  })
  @ApiQuery({
    name: 'path',
    required: false,
    description: 'Rute halaman penempatan FAQ (misal: /fasilitas, /)',
    example: '/fasilitas',
  })
  @ApiOkResponse({
    description: 'Daftar FAQ berhasil diambil',
    type: [SupportFaqResponseDto],
  })
  @HttpCache({ ttlSeconds: 300, tags: ['clinics', 'faqs'] })
  async getFaqs(
    @Query('path') path?: string,
  ): Promise<SupportFaqResponseDto[]> {
    return this.supportFaqsService.getPublishedFaqs(path);
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
    summary: 'Mendapatkan daftar services berdasarkan ID poliklinik',
    description:
      'Mengambil seluruh services yang disediakan oleh poliklinik spesifik.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik poliklinik',
    example: 'cd44dd7d-07a9-4e31-9441-3e0e02ddebb1',
  })
  @ApiOkResponse({ description: 'Daftar services berhasil diambil' })
  @HttpCache({ ttlSeconds: 300, tags: ['clinics'] })
  async getLayananByPoli(@Param('id') id: string) {
    return this.clinicsService.findLayananByPoliId(id);
  }

  @Public()
  @Get('poliklinik/:id/services')
  @ApiOperation({
    summary: 'Mendapatkan daftar services berdasarkan ID poliklinik (Alias)',
    description:
      'Alias rute publik untuk mendapatkan daftar services poliklinik.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik poliklinik',
    example: 'cd44dd7d-07a9-4e31-9441-3e0e02ddebb1',
  })
  @ApiOkResponse({ description: 'Daftar services berhasil diambil' })
  @HttpCache({ ttlSeconds: 300, tags: ['clinics'] })
  async getServicesByPoli(@Param('id') id: string) {
    return this.clinicsService.findLayananByPoliId(id);
  }
}
