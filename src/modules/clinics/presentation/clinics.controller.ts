import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Public } from '../../../common/auth/public.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import {
  CLINIC_REPOSITORY,
  ClinicRepository,
} from '../domain/repositories/clinic.repository';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { CreateLayananDto } from './dto/create-layanan.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';
import { UpdateLayananDto } from './dto/update-layanan.dto';

@ApiTags('Clinics (Poliklinik & Layanan)')
@Controller({ path: 'clinics', version: '1' })
export class ClinicsController {
  constructor(
    @Inject(CLINIC_REPOSITORY)
    private readonly clinicRepo: ClinicRepository,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary:
      'Mendapatkan seluruh daftar poliklinik aktif (Poli Umum, Poli KIA)',
    description:
      'Endpoint publik untuk melihat poliklinik yang tersedia di klinik beserta status operasionalnya.',
  })
  @ApiOkResponse({
    description: 'Daftar poliklinik aktif berhasil diambil',
  })
  async getClinics() {
    return this.clinicRepo.findAllPoliklinik();
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
  async getPoliklinik() {
    return this.clinicRepo.findAllPoliklinik();
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
    const clinic = await this.clinicRepo.findPoliklinikById(id);
    if (!clinic) {
      throw new NotFoundException(`Poliklinik dengan ID ${id} tidak ditemukan`);
    }
    return clinic;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan poliklinik baru (Admin)',
    description: 'Menambahkan unit poliklinik pelayanan baru ke dalam sistem.',
  })
  @ApiCreatedResponse({
    description: 'Poliklinik berhasil dibuat',
  })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya peran Admin yang diizinkan' })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi form poliklinik gagal',
  })
  async createClinic(@Body() body: CreateClinicDto) {
    return this.clinicRepo.createPoliklinik({
      namaPoli: body.namaPoli,
      kodePoli: body.kodePoli,
      deskripsi: body.deskripsi,
      isActive: body.isActive,
    });
  }

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Patch('layanan/:layananId')
  @ApiOperation({
    summary: 'Memperbarui data layanan klinik (Admin)',
    description:
      'Mengubah nama, tarif, atau alur tindakan klinis dari layanan tertentu.',
  })
  @ApiParam({
    name: 'layananId',
    description: 'ID unik layanan tindakan medis',
    example: 'd97d6499-4773-4ce7-a4df-ae6a28664277',
  })
  @ApiOkResponse({ description: 'Layanan berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Layanan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya peran Admin yang diizinkan' })
  @ApiUnprocessableEntityResponse({ description: 'Validasi data gagal' })
  async updateLayanan(
    @Param('layananId') layananId: string,
    @Body() body: UpdateLayananDto,
  ) {
    const updated = await this.clinicRepo.updateLayanan(layananId, body);
    if (!updated) {
      throw new NotFoundException(
        `Layanan dengan ID ${layananId} tidak ditemukan`,
      );
    }
    return updated;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Delete('layanan/:layananId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menonaktifkan layanan klinik (Admin)',
    description: 'Menonaktifkan layanan medis dari poliklinik terkait.',
  })
  @ApiParam({
    name: 'layananId',
    description: 'ID unik layanan tindakan medis',
    example: 'd97d6499-4773-4ce7-a4df-ae6a28664277',
  })
  @ApiNoContentResponse({ description: 'Layanan berhasil dinonaktifkan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya peran Admin yang diizinkan' })
  async deleteLayanan(@Param('layananId') layananId: string) {
    await this.clinicRepo.deleteLayanan(layananId);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  @ApiOperation({
    summary: 'Memperbarui data poliklinik (Admin)',
    description: 'Mengubah nama, deskripsi, atau status aktif poliklinik.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik poliklinik',
    example: 'cd44dd7d-07a9-4e31-9441-3e0e02ddebb1',
  })
  @ApiOkResponse({ description: 'Poliklinik berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Poliklinik tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya peran Admin yang diizinkan' })
  @ApiUnprocessableEntityResponse({ description: 'Validasi data gagal' })
  async updateClinic(@Param('id') id: string, @Body() body: UpdateClinicDto) {
    const updated = await this.clinicRepo.updatePoliklinik(id, body);
    if (!updated) {
      throw new NotFoundException(`Poliklinik dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menonaktifkan poliklinik (Admin)',
    description: 'Menonaktifkan unit poliklinik dari operasional klinik.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik poliklinik',
    example: 'cd44dd7d-07a9-4e31-9441-3e0e02ddebb1',
  })
  @ApiNoContentResponse({ description: 'Poliklinik berhasil dinonaktifkan' })
  @ApiNotFoundResponse({ description: 'Poliklinik tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya peran Admin yang diizinkan' })
  async deleteClinic(@Param('id') id: string) {
    const success = await this.clinicRepo.deletePoliklinik(id);
    if (!success) {
      throw new NotFoundException(`Poliklinik dengan ID ${id} tidak ditemukan`);
    }
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
  async getLayananByPoli(@Param('id') id: string) {
    return this.clinicRepo.findLayananByPoliId(id);
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
  async getServicesByPoli(@Param('id') id: string) {
    return this.clinicRepo.findLayananByPoliId(id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Post(':id/layanan')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan layanan baru ke poliklinik tertentu (Admin)',
    description:
      'Menambahkan item tindakan/layanan medis baru ke dalam unit poliklinik.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik poliklinik tujuan',
    example: 'cd44dd7d-07a9-4e31-9441-3e0e02ddebb1',
  })
  @ApiCreatedResponse({ description: 'Layanan berhasil dibuat' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya peran Admin yang diizinkan' })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi data layanan gagal',
  })
  async createLayanan(
    @Param('id') poliklinikId: string,
    @Body() body: CreateLayananDto,
  ) {
    return this.clinicRepo.createLayanan(poliklinikId, {
      namaLayanan: body.namaLayanan,
      deskripsi: body.deskripsi,
      medicalFlow: body.medicalFlow,
    });
  }
}
