import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { desc, ilike } from 'drizzle-orm';
import {
  CurrentUser,
  HybridAuthGuard,
  Roles,
  RolesGuard,
} from '../../../common/auth';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import { patientAddresses, patientProfiles } from '../../../database/schema';
import {
  PATIENT_REPOSITORY,
  type PatientRepository,
} from '../domain/repositories/patient.repository';
import {
  PATIENT_AFFILIATION_REPOSITORY,
  type PatientAffiliationRepository,
} from '../domain/repositories/patient-affiliation.repository';
import { CreatePatientAffiliationDto } from './dto/create-patient-affiliation.dto';

@ApiTags('Patient Affiliations (Keluarga & Relasi Pasien)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@Controller({ path: 'patients/affiliations', version: '1' })
export class PatientAffiliationsController {
  constructor(
    @Inject(PATIENT_AFFILIATION_REPOSITORY)
    private readonly affiliationRepo: PatientAffiliationRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: PatientRepository,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  @Get('me')
  @Roles('PATIENT', 'ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Mendapatkan seluruh daftar pasien berafiliasi untuk akun login',
    description:
      'Mengambil semua profil pasien yang terhubung ke akun ini (Diri Sendiri, Ibu, Anak, Pasangan, Teman, Kerabat).',
  })
  @ApiOkResponse({ description: 'Daftar afiliasi berhasil diambil' })
  async getMyAffiliations(@CurrentUser() user: any) {
    const list = await this.affiliationRepo.findByUserId(user.id);
    return {
      success: true,
      data: list,
    };
  }

  @Post()
  @Roles('PATIENT', 'ADMIN', 'STAF')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Mendaftarkan pasien on-demand atau menghubungkan relasi pasien',
    description:
      'Membuat rekam medis pasien baru untuk keluarga atau menautkan profil pasien yang sudah ada ke akun pengguna.',
  })
  @ApiCreatedResponse({ description: 'Afiliasi pasien berhasil dibuat' })
  async createAffiliation(
    @CurrentUser() user: any,
    @Body() dto: CreatePatientAffiliationDto,
  ) {
    let targetPatientId = dto.patient_id;

    if (!targetPatientId) {
      if (!dto.name || !dto.nik || !dto.birth_date || !dto.gender) {
        throw new BadRequestException({
          code: 'INCOMPLETE_DEMOGRAPHIC_DATA',
          message:
            'Nama, NIK, tanggal lahir, dan jenis kelamin wajib diisi jika mendaftarkan pasien baru.',
        });
      }

      // Check if NIK already exists
      const existingPatient = await this.patientRepo.findByNik(dto.nik);
      if (existingPatient) {
        targetPatientId = existingPatient.id;
      } else {
        // Generate MRN
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const prefix = `RM-${year}${month}-`;

        const [latestRecord] = await this.db
          .select({ mrn: patientProfiles.medicalRecordNumber })
          .from(patientProfiles)
          .where(ilike(patientProfiles.medicalRecordNumber, `${prefix}%`))
          .orderBy(desc(patientProfiles.medicalRecordNumber))
          .limit(1);

        let nextSequence = 1;
        if (latestRecord?.mrn) {
          const parts = latestRecord.mrn.split('-');
          const lastSeq = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(lastSeq)) {
            nextSequence = lastSeq + 1;
          }
        }
        const rmNumber = `${prefix}${String(nextSequence).padStart(4, '0')}`;

        const dbGender =
          dto.gender === 'Perempuan' || dto.gender === 'P' ? 'female' : 'male';
        const bloodTypeMap: Record<string, 'a' | 'b' | 'ab' | 'o' | 'unknown'> =
          {
            A: 'a',
            B: 'b',
            AB: 'ab',
            O: 'o',
            'Belum Tahu': 'unknown',
          };
        const dbBloodType =
          (dto.blood_type && bloodTypeMap[dto.blood_type]) || 'unknown';

        const [newProfile] = await this.db
          .insert(patientProfiles)
          .values({
            userId: dto.relationship_type === 'self' ? user.id : null,
            occupationId: dto.occupation_id || null,
            medicalRecordNumber: rmNumber,
            nationalIdEncrypted: dto.nik,
            nationalIdHash: dto.nik,
            fullName: dto.name.trim(),
            gender: dbGender,
            birthPlace: dto.tempat_lahir?.trim() || '',
            birthDate: dto.birth_date,
            bloodType: dbBloodType,
            phone: dto.phone?.trim() || null,
            motherName: dto.nama_ibu_kandung?.trim() || null,
            occupation: dto.pekerjaan?.trim() || null,
            status: 'active',
            registeredAt: new Date().toISOString(),
          })
          .returning();

        targetPatientId = newProfile.id;

        if (dto.alamat_detail || dto.provinsi) {
          const fullAddress =
            `${dto.alamat_detail || ''}, ${dto.kelurahan ? `Kel. ${dto.kelurahan}, ` : ''}${dto.kecamatan ? `Kec. ${dto.kecamatan}, ` : ''}${dto.kabupaten || ''}, Prov. ${dto.provinsi || ''}`.trim();
          await this.db.insert(patientAddresses).values({
            patientId: newProfile.id,
            type: 'domicile',
            provinceCode: dto.provinsi_id || null,
            provinceName: dto.provinsi || null,
            regencyCode: dto.kabupaten_id || null,
            regencyName: dto.kabupaten || null,
            districtCode: dto.kecamatan_id || null,
            districtName: dto.kecamatan || null,
            villageCode: dto.kelurahan_id || null,
            villageName: dto.kelurahan || null,
            line1: dto.alamat_detail?.trim() || fullAddress,
            fullAddress,
            isPrimary: true,
          });
        }
      }
    }

    const createdAffiliation = await this.affiliationRepo.create({
      userId: user.id,
      patientId: targetPatientId,
      relationshipType: dto.relationship_type,
      relationLabel: dto.relation_label || null,
      isPrimary: dto.is_primary ?? false,
    });

    return {
      success: true,
      message: 'Afiliasi pasien berhasil disimpan.',
      data: createdAffiliation,
    };
  }

  @Delete(':patientId')
  @Roles('PATIENT', 'ADMIN', 'STAF')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Menghapus hubungan relasi pasien dari akun login',
  })
  async deleteAffiliation(
    @CurrentUser() user: any,
    @Param('patientId') patientId: string,
  ) {
    const existing = await this.affiliationRepo.findByUserAndPatient(
      user.id,
      patientId,
    );
    if (!existing) {
      throw new NotFoundException({
        code: 'AFFILIATION_NOT_FOUND',
        message: 'Hubungan relasi pasien tidak ditemukan pada akun ini.',
      });
    }

    if (existing.isPrimary) {
      throw new ConflictException({
        code: 'CANNOT_DELETE_PRIMARY_AFFILIATION',
        message: 'Tidak dapat menghapus profil pasien utama dari akun Anda.',
      });
    }

    await this.affiliationRepo.delete(user.id, patientId);

    return {
      success: true,
      message: 'Hubungan relasi pasien berhasil dihapus.',
    };
  }
}
