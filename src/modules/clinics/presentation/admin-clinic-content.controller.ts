import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';
import { ClinicFacilitiesService } from '../application/clinic-facilities.service';
import { SupportFaqsService } from '../application/support-faqs.service';
import {
  ClinicFacilityResponseDto,
  CreateClinicFacilityDto,
  UpdateClinicFacilityDto,
} from './dto/clinic-facility.dto';
import {
  CreateSupportFaqDto,
  SupportFaqResponseDto,
  UpdateSupportFaqDto,
} from './dto/support-faq.dto';

@ApiTags('Admin Clinic Content (Facilities & FAQs)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, PermissionsGuard)
@RequirePermissions('clinics:manage')
@Controller({ path: 'admin/facilities', version: '1' })
export class AdminClinicContentController {
  constructor(
    private readonly clinicFacilitiesService: ClinicFacilitiesService,
    private readonly supportFaqsService: SupportFaqsService,
  ) {}

  // ==========================================
  // 1. CLINIC FACILITIES (Carousel Unggulan)
  // ==========================================

  @Get(['items', 'facilities-items'])
  @ApiOperation({
    summary: 'Mendapatkan seluruh daftar fasilitas klinik untuk admin',
    description:
      'Mengambil seluruh fasilitas klinik termasuk yang belum terbit, terurut display order.',
  })
  @ApiOkResponse({
    description: 'Daftar fasilitas berhasil diambil',
    type: [ClinicFacilityResponseDto],
  })
  async getAllFacilities(): Promise<ClinicFacilityResponseDto[]> {
    return this.clinicFacilitiesService.getAllFacilitiesForAdmin();
  }

  @Post(['items', 'facilities-items'])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan fasilitas klinik baru (Admin)',
    description:
      'Membuat fasilitas carousel baru dengan opsi relasi ke layanan medis.',
  })
  @ApiCreatedResponse({
    description: 'Fasilitas klinik berhasil dibuat',
    type: ClinicFacilityResponseDto,
  })
  async createFacility(
    @Body() body: CreateClinicFacilityDto,
  ): Promise<ClinicFacilityResponseDto> {
    return this.clinicFacilitiesService.createFacility(body);
  }

  @Patch(['items/:id', 'facilities-items/:id'])
  @ApiOperation({
    summary: 'Memperbarui data fasilitas klinik (Admin)',
    description:
      'Mengubah judul, slug, gambar, relasi service, status terbit, atau urutan fasilitas.',
  })
  @ApiParam({ name: 'id', description: 'ID unik fasilitas' })
  @ApiOkResponse({
    description: 'Fasilitas klinik berhasil diperbarui',
    type: ClinicFacilityResponseDto,
  })
  async updateFacility(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateClinicFacilityDto,
  ): Promise<ClinicFacilityResponseDto> {
    return this.clinicFacilitiesService.updateFacility(id, body);
  }

  @Delete(['items/:id', 'facilities-items/:id'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus fasilitas klinik (Admin)',
    description: 'Menghapus data fasilitas dari basis data dan mengosongkan cache.',
  })
  @ApiParam({ name: 'id', description: 'ID unik fasilitas' })
  @ApiNoContentResponse({ description: 'Fasilitas berhasil dihapus' })
  async deleteFacility(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.clinicFacilitiesService.deleteFacility(id);
  }

  // ==========================================
  // 2. SUPPORT FAQS (Akordeon FAQ Landing Page)
  // ==========================================

  @Get('faqs')
  @ApiOperation({
    summary: 'Mendapatkan seluruh daftar FAQ klinik untuk admin',
    description:
      'Mengambil seluruh item FAQ beserta penempatan paths dan relasi layanan/kategori.',
  })
  @ApiOkResponse({
    description: 'Daftar FAQ berhasil diambil',
    type: [SupportFaqResponseDto],
  })
  async getAllFaqs(): Promise<SupportFaqResponseDto[]> {
    return this.supportFaqsService.getAllFaqsForAdmin();
  }

  @Post('faqs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan item FAQ baru (Admin)',
    description:
      'Membuat pertanyaan dan jawaban FAQ baru dengan paths penempatan dinamis.',
  })
  @ApiCreatedResponse({
    description: 'FAQ berhasil dibuat',
    type: SupportFaqResponseDto,
  })
  async createFaq(
    @Body() body: CreateSupportFaqDto,
  ): Promise<SupportFaqResponseDto> {
    return this.supportFaqsService.createFaq(body);
  }

  @Patch('faqs/:id')
  @ApiOperation({
    summary: 'Memperbarui item FAQ (Admin)',
    description:
      'Mengubah pertanyaan, jawaban, path halaman, status terbit, atau urutan FAQ.',
  })
  @ApiParam({ name: 'id', description: 'ID unik FAQ' })
  @ApiOkResponse({
    description: 'FAQ berhasil diperbarui',
    type: SupportFaqResponseDto,
  })
  async updateFaq(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateSupportFaqDto,
  ): Promise<SupportFaqResponseDto> {
    return this.supportFaqsService.updateFaq(id, body);
  }

  @Delete('faqs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus item FAQ (Admin)',
    description: 'Menghapus FAQ dari basis data dan mengosongkan cache.',
  })
  @ApiParam({ name: 'id', description: 'ID unik FAQ' })
  @ApiNoContentResponse({ description: 'FAQ berhasil dihapus' })
  async deleteFaq(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.supportFaqsService.deleteFaq(id);
  }
}
