import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { asc, eq, sql } from 'drizzle-orm';
import {
  HybridAuthGuard,
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/auth';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  bloodTypes,
  educationLevels,
  occupations,
  patientRelationshipTypes,
  religions,
} from '../../../database/schema';
import {
  BACKEND_GENDER_OPTIONS,
  BACKEND_STATUS_OPTIONS,
  ReferenceOption,
} from '../domain/data/patient-reference.data';
import { IndonesianRegionService } from '../infrastructure/services/indonesian-region.service';

@ApiTags('Patient Demographic & Region References')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, PermissionsGuard)
@RequirePermissions('app:access')
@Controller({ path: 'patients/reference', version: '1' })
export class PatientReferencesController {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly regionService: IndonesianRegionService,
  ) {}

  private async fetchLiveGenderOptions(): Promise<ReferenceOption[]> {
    try {
      const result = await this.db.execute(sql`
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'gender'
        ORDER BY e.enumsortorder ASC
      `);
      const rows = ((result as any)?.rows ?? (result as any) ?? []) as Array<{
        enumlabel: string;
      }>;
      if (rows.length > 0) {
        return rows.map((r) => ({
          label: r.enumlabel,
          value: r.enumlabel,
        }));
      }
    } catch {
      // Fallback
    }
    return BACKEND_GENDER_OPTIONS;
  }

  @Get('blood-types')
  @ApiOperation({
    summary: 'Mendapatkan referensi golongan darah standar medis',
  })
  @ApiResponse({ status: 200, description: 'Daftar golongan darah' })
  async getBloodTypes() {
    const list = await this.db.query.bloodTypes.findMany({
      where: eq(bloodTypes.isActive, true),
      orderBy: [asc(bloodTypes.displayOrder), asc(bloodTypes.name)],
    });
    return {
      success: true,
      data: list.map((b) => ({
        id: b.id,
        code: b.code,
        value: b.code,
        label: b.name,
        name: b.name,
        description: b.description,
        displayOrder: b.displayOrder,
      })),
    };
  }

  @Get('education-levels')
  @ApiOperation({ summary: 'Mendapatkan referensi jenjang pendidikan' })
  @ApiResponse({ status: 200, description: 'Daftar jenjang pendidikan' })
  async getEducationLevels() {
    const list = await this.db.query.educationLevels.findMany({
      where: eq(educationLevels.isActive, true),
      orderBy: [asc(educationLevels.displayOrder), asc(educationLevels.name)],
    });
    return {
      success: true,
      data: list.map((e) => ({
        id: e.id,
        value: e.name,
        label: e.name,
        description: e.description,
        displayOrder: e.displayOrder,
      })),
    };
  }

  @Get('religions')
  @ApiOperation({ summary: 'Mendapatkan referensi agama' })
  @ApiResponse({ status: 200, description: 'Daftar agama' })
  async getReligions() {
    const list = await this.db.query.religions.findMany({
      where: eq(religions.isActive, true),
      orderBy: [asc(religions.displayOrder), asc(religions.name)],
    });
    return {
      success: true,
      data: list.map((r) => ({
        id: r.id,
        value: r.name,
        label: r.name,
        description: r.description,
        displayOrder: r.displayOrder,
      })),
    };
  }

  @Get('genders')
  @ApiOperation({ summary: 'Mendapatkan referensi jenis kelamin' })
  @ApiResponse({ status: 200, description: 'Daftar jenis kelamin' })
  async getGenders() {
    const data = await this.fetchLiveGenderOptions();
    return {
      success: true,
      data,
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
  async getRelationships() {
    const list = await this.db.query.patientRelationshipTypes.findMany({
      where: eq(patientRelationshipTypes.isActive, true),
      orderBy: [
        asc(patientRelationshipTypes.displayOrder),
        asc(patientRelationshipTypes.name),
      ],
    });

    return {
      success: true,
      data: list.map((r) => ({
        id: r.id,
        value: r.code,
        label: r.name,
        description: r.description,
        icon: r.iconName,
        iconName: r.iconName,
        isSystem: r.isSystem,
      })),
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
    const [
      occupationsList,
      relationshipsList,
      provinces,
      bloodTypesList,
      educationLevelsList,
      religionsList,
      liveGenders,
    ] = await Promise.all([
      this.db.query.occupations.findMany({
        where: eq(occupations.isActive, true),
        orderBy: [asc(occupations.displayOrder), asc(occupations.name)],
      }),
      this.db.query.patientRelationshipTypes.findMany({
        where: eq(patientRelationshipTypes.isActive, true),
        orderBy: [
          asc(patientRelationshipTypes.displayOrder),
          asc(patientRelationshipTypes.name),
        ],
      }),
      this.regionService.getProvinces(),
      this.db.query.bloodTypes.findMany({
        where: eq(bloodTypes.isActive, true),
        orderBy: [asc(bloodTypes.displayOrder), asc(bloodTypes.name)],
      }),
      this.db.query.educationLevels.findMany({
        where: eq(educationLevels.isActive, true),
        orderBy: [asc(educationLevels.displayOrder), asc(educationLevels.name)],
      }),
      this.db.query.religions.findMany({
        where: eq(religions.isActive, true),
        orderBy: [asc(religions.displayOrder), asc(religions.name)],
      }),
      this.fetchLiveGenderOptions(),
    ]);

    return {
      success: true,
      data: {
        bloodTypes: bloodTypesList.map((b) => ({
          id: b.id,
          code: b.code,
          value: b.code,
          label: b.name,
          name: b.name,
          description: b.description,
          displayOrder: b.displayOrder,
        })),
        educationLevels: educationLevelsList.map((e) => ({
          id: e.id,
          value: e.name,
          label: e.name,
          description: e.description,
          displayOrder: e.displayOrder,
        })),
        religions: religionsList.map((r) => ({
          id: r.id,
          value: r.name,
          label: r.name,
          description: r.description,
          displayOrder: r.displayOrder,
        })),
        genders: liveGenders,
        statuses: BACKEND_STATUS_OPTIONS,
        relationships: relationshipsList.map((r) => ({
          id: r.id,
          value: r.code,
          label: r.name,
          description: r.description,
          icon: r.iconName,
          iconName: r.iconName,
          isSystem: r.isSystem,
        })),
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
