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
  ApiOperation,
  ApiResponse,
  ApiTags,
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
  })
  async getClinics() {
    return this.clinicRepo.findAllPoliklinik();
  }

  @Public()
  @Get('poliklinik')
  @ApiOperation({
    summary: 'Mendapatkan seluruh daftar poliklinik aktif (Alias)',
  })
  async getPoliklinik() {
    return this.clinicRepo.findAllPoliklinik();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Mendapatkan detail poliklinik berdasarkan ID' })
  async getClinicById(@Param('id') id: string) {
    const clinic = await this.clinicRepo.findPoliklinikById(id);
    if (!clinic) {
      throw new NotFoundException(`Poliklinik dengan ID ${id} tidak ditemukan`);
    }
    return clinic;
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Menambahkan poliklinik baru (Admin)' })
  @ApiResponse({ status: 201, description: 'Poliklinik berhasil dibuat' })
  async createClinic(@Body() body: CreateClinicDto) {
    return this.clinicRepo.createPoliklinik({
      namaPoli: body.namaPoli,
      kodePoli: body.kodePoli,
      deskripsi: body.deskripsi,
      isActive: body.isActive,
    });
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Patch('layanan/:layananId')
  @ApiOperation({ summary: 'Memperbarui data layanan klinik (Admin)' })
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

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Delete('layanan/:layananId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Menonaktifkan layanan klinik (Admin)' })
  async deleteLayanan(@Param('layananId') layananId: string) {
    await this.clinicRepo.deleteLayanan(layananId);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  @ApiOperation({ summary: 'Memperbarui data poliklinik (Admin)' })
  async updateClinic(@Param('id') id: string, @Body() body: UpdateClinicDto) {
    const updated = await this.clinicRepo.updatePoliklinik(id, body);
    if (!updated) {
      throw new NotFoundException(`Poliklinik dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Menonaktifkan poliklinik (Admin)' })
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
  })
  async getLayananByPoli(@Param('id') id: string) {
    return this.clinicRepo.findLayananByPoliId(id);
  }

  @Public()
  @Get('poliklinik/:id/services')
  @ApiOperation({
    summary: 'Mendapatkan daftar layanan berdasarkan ID poliklinik (Alias)',
  })
  async getServicesByPoli(@Param('id') id: string) {
    return this.clinicRepo.findLayananByPoliId(id);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Post(':id/layanan')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan layanan baru ke poliklinik tertentu (Admin)',
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
