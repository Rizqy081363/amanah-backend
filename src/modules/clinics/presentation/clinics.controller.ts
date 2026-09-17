import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/auth/public.decorator';
import {
  CLINIC_REPOSITORY,
  ClinicRepository,
} from '../domain/repositories/clinic.repository';

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
    summary:
      'Mendapatkan seluruh daftar poliklinik aktif (Poli Umum, Poli KIA)',
  })
  async getPoliklinik() {
    return this.clinicRepo.findAllPoliklinik();
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
    summary: 'Mendapatkan daftar layanan/tindakan berdasarkan ID poliklinik',
  })
  async getServicesByPoli(@Param('id') id: string) {
    return this.clinicRepo.findLayananByPoliId(id);
  }
}
