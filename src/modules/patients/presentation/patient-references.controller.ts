import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { asc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import { occupations } from '../../../database/schema';
import {
  BACKEND_BLOOD_TYPE_OPTIONS,
  BACKEND_GENDER_OPTIONS,
  BACKEND_RELATIONSHIP_OPTIONS,
  BACKEND_STATUS_OPTIONS,
} from '../domain/data/patient-reference.data';
import { IndonesianRegionService } from '../infrastructure/services/indonesian-region.service';

@ApiTags('Patient Demographic & Region References')
@Controller({ path: 'patients/reference', version: '1' })
export class PatientReferencesController {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly regionService: IndonesianRegionService,
  ) {}

  @Get('blood-types')
  @ApiOperation({
    summary: 'Mendapatkan referensi golongan darah standar medis',
  })
  @ApiResponse({ status: 200, description: 'Daftar golongan darah' })
  getBloodTypes() {
    return {
      success: true,
      data: BACKEND_BLOOD_TYPE_OPTIONS,
    };
  }

  @Get('genders')
  @ApiOperation({ summary: 'Mendapatkan referensi jenis kelamin' })
  @ApiResponse({ status: 200, description: 'Daftar jenis kelamin' })
  getGenders() {
    return {
      success: true,
      data: BACKEND_GENDER_OPTIONS,
    };
  }

  @Get('statuses')
  @ApiOperation({ summary: 'Mendapatkan referensi status akun pasien' })
  @ApiResponse({ status: 200, description: 'Daftar status akun pasien' })
  getStatuses() {
    return {
      success: true,
      data: BACKEND_STATUS_OPTIONS,
    };
  }

  @Get('relationships')
  @ApiOperation({ summary: 'Mendapatkan referensi hubungan pasien keluarga' })
  @ApiResponse({ status: 200, description: 'Daftar hubungan afiliasi pasien' })
  getRelationships() {
    return {
      success: true,
      data: BACKEND_RELATIONSHIP_OPTIONS,
    };
  }

  @Get('provinces')
  @ApiOperation({
    summary:
      'Mendapatkan daftar seluruh 38 provinsi di Indonesia dari Kemendagri',
  })
  @ApiResponse({ status: 200, description: 'Daftar provinsi resmi Indonesia' })
  async getProvinces() {
    const data = await this.regionService.getProvinces();
    return {
      success: true,
      data,
    };
  }

  @Get('regencies')
  @ApiOperation({
    summary:
      'Mendapatkan daftar kabupaten/kota resmi berdasarkan kode provinsi',
  })
  @ApiQuery({
    name: 'provinceId',
    required: true,
    description: 'Kode provinsi (contoh: 14 untuk Riau)',
  })
  @ApiResponse({ status: 200, description: 'Daftar kabupaten/kota' })
  async getRegencies(@Query('provinceId') provinceId: string) {
    if (!provinceId) {
      return { success: true, data: [] };
    }
    const data = await this.regionService.getRegencies(provinceId);
    return {
      success: true,
      data,
    };
  }

  @Get('districts')
  @ApiOperation({
    summary:
      'Mendapatkan daftar kecamatan resmi berdasarkan kode kabupaten/kota',
  })
  @ApiQuery({
    name: 'regencyId',
    required: true,
    description: 'Kode kabupaten/kota',
  })
  @ApiResponse({ status: 200, description: 'Daftar kecamatan' })
  async getDistricts(@Query('regencyId') regencyId: string) {
    if (!regencyId) {
      return { success: true, data: [] };
    }
    const data = await this.regionService.getDistricts(regencyId);
    return {
      success: true,
      data,
    };
  }

  @Get('villages')
  @ApiOperation({
    summary:
      'Mendapatkan daftar kelurahan/desa resmi berdasarkan kode kecamatan',
  })
  @ApiQuery({
    name: 'districtId',
    required: true,
    description: 'Kode kecamatan',
  })
  @ApiResponse({ status: 200, description: 'Daftar kelurahan/desa' })
  async getVillages(@Query('districtId') districtId: string) {
    if (!districtId) {
      return { success: true, data: [] };
    }
    const data = await this.regionService.getVillages(districtId);
    return {
      success: true,
      data,
    };
  }

  @Get('options')
  @ApiOperation({
    summary: 'Mendapatkan seluruh referensi formulir pendaftaran pasien',
  })
  @ApiResponse({
    status: 200,
    description: 'Kumpulan referensi formulir pendaftaran',
  })
  async getAllFormOptions() {
    const [occupationsList, provinces] = await Promise.all([
      this.db.query.occupations.findMany({
        where: eq(occupations.isActive, true),
        orderBy: [asc(occupations.displayOrder), asc(occupations.name)],
      }),
      this.regionService.getProvinces(),
    ]);

    return {
      success: true,
      data: {
        bloodTypes: BACKEND_BLOOD_TYPE_OPTIONS,
        genders: BACKEND_GENDER_OPTIONS,
        statuses: BACKEND_STATUS_OPTIONS,
        relationships: BACKEND_RELATIONSHIP_OPTIONS,
        provinces,
        occupations: occupationsList.map((occ) => ({
          id: occ.id,
          code: occ.code,
          name: occ.name,
          description: occ.description,
          displayOrder: occ.displayOrder,
        })),
      },
    };
  }
}
