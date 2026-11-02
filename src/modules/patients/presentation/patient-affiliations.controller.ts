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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { asc, desc, eq, ilike } from 'drizzle-orm';
import { z } from 'zod';
import {
  AuthenticatedUser,
  CurrentUser,
  HybridAuthGuard,
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/auth';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  clinicServices,
  patientAddresses,
  patientProfiles,
  patientRelationshipTypes,
} from '../../../database/schema';
import { normalizeBloodTypeToDb } from '../domain/data/patient-reference.data';
import {
  PATIENT_REPOSITORY,
  type PatientRepository,
} from '../domain/repositories/patient.repository';
import {
  PATIENT_AFFILIATION_REPOSITORY,
  type PatientAffiliationRepository,
} from '../domain/repositories/patient-affiliation.repository';
import { CreatePatientAffiliationDto } from './dto/create-patient-affiliation.dto';

function mapEnrichedPatient(aff: any) {
  const p = aff.patient;
  const pStatus = p?.status || 'active';
  return {
    id: aff.patientId,
    affiliationId: aff.id,
    isPrimary: aff.isPrimary ?? false,
    fullName: p?.fullName || '',
    nik: p?.nik || '',
    gender: p?.gender || null,
    bloodType: p?.bloodType || null,
    birthPlace: p?.birthPlace || null,
    birthDate: p?.birthDate || null,
    motherName: p?.motherName || null,
    address: p?.fullAddress || null,
    alamatDetail: p?.line1 || null,
    provinsi: p?.provinsi || null,
    provinsiId: p?.provinsiId || null,
    kabupaten: p?.kabupaten || null,
    kabupatenId: p?.kabupatenId || null,
    kecamatan: p?.kecamatan || null,
    kecamatanId: p?.kecamatanId || null,
    kelurahan: p?.kelurahan || null,
    kelurahanId: p?.kelurahanId || null,
    phoneNumber: p?.phone || null,
    phone: p?.phone || null,
    email: p?.email || null,
    relationship: aff.relationshipType,
    relationshipLabel: aff.relationLabel || aff.relationshipType,
    occupationName: p?.occupation || null,
    status: pStatus,
    hasExistingIntake: false,
    latestIntakeId: null,
    latestIntakeDate: null,
  };
}

@ApiTags('Patient Affiliations (Keluarga & Relasi Pasien)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, PermissionsGuard)
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

  @Get('booking-context')
  @RequirePermissions('appointments:read', 'appointments:book')
  @ApiOperation({
    summary: 'Mendapatkan konteks formulir dan daftar pasien sesuai layanan',
  })
  async getBookingContext(
    @CurrentUser() user: AuthenticatedUser,
    @Query(
      'serviceId',
      new ZodValidationPipe(
        z.string().uuid('serviceId harus berformat UUID v4 valid'),
      ),
    )
    serviceId: string,
  ) {

    const service = await this.db.query.clinicServices.findFirst({
      where: eq(clinicServices.id, serviceId),
      with: {
        intakeForm: true,
      },
    });

    if (!service) {
      throw new NotFoundException({
        code: 'SERVICE_NOT_FOUND',
        message: 'Layanan medis tidak ditemukan',
      });
    }

    const hasIntakeForm = Boolean(
      service.intakeFormId && service.intakeForm?.isActive,
    );
    const intakeFormCode = hasIntakeForm ? service.intakeForm!.code : null;
    const intakeFormName = hasIntakeForm ? service.intakeForm!.name : null;
    const formType = intakeFormCode || 'regular';

    const rawAffiliations = await this.affiliationRepo.findByUserId(user.id);
    const hasExistingPrimary = rawAffiliations.some((aff) => aff.isPrimary);

    const activeRelationshipTypes =
      await this.db.query.patientRelationshipTypes.findMany({
        where: eq(patientRelationshipTypes.isActive, true),
        orderBy: [
          asc(patientRelationshipTypes.displayOrder),
          asc(patientRelationshipTypes.name),
        ],
      });

    let allowedRelationships = activeRelationshipTypes.map((t) => ({
      id: t.id,
      value: t.code,
      label: t.name,
      iconName: t.iconName,
      description: t.description || undefined,
    }));

    if (hasExistingPrimary) {
      const systemType = activeRelationshipTypes.find((t) => t.isSystem);
      if (systemType) {
        allowedRelationships = allowedRelationships.filter(
          (r) => r.id !== systemType.id,
        );
      }
    }

    const enrichedPatients = rawAffiliations.map((aff) =>
      mapEnrichedPatient(aff),
    );

    return {
      success: true,
      data: {
        serviceId: service.id,
        serviceName: service.name,
        hasIntakeForm,
        intakeFormId: service.intakeFormId || null,
        intakeFormCode,
        intakeFormName,
        formType,
        allowedRelationships,
        patients: enrichedPatients,
        totalPatients: enrichedPatients.length,
        hasExistingPatient: enrichedPatients.length > 0,
      },
    };
  }

  @Get('me')
  @RequirePermissions('profile:read')
  @ApiOperation({
    summary: 'Mendapatkan seluruh daftar pasien berafiliasi untuk akun login',
    description:
      'Mengambil semua profil pasien yang terhubung ke akun ini (Diri Sendiri, Ibu, Anak, Pasangan, Teman, Kerabat).',
  })
  @ApiOkResponse({ description: 'Daftar afiliasi berhasil diambil' })
  async getMyAffiliations(@CurrentUser() user: AuthenticatedUser) {
    const list = await this.affiliationRepo.findByUserId(user.id);
    return {
      success: true,
      data: list,
    };
  }

  @Post()
  @RequirePermissions('patients:register', 'patients:manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Mendaftarkan pasien on-demand atau menghubungkan relasi pasien',
    description:
      'Membuat rekam medis pasien baru untuk keluarga atau menautkan profil pasien yang sudah ada ke akun pengguna.',
  })
  @ApiCreatedResponse({ description: 'Afiliasi pasien berhasil dibuat' })
  async createAffiliation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePatientAffiliationDto,
  ) {
    if (dto.isPrimary) {
      const existingUserAffiliations = await this.affiliationRepo.findByUserId(
        user.id,
      );
      const hasPrimary = existingUserAffiliations.some((aff) => aff.isPrimary);
      if (hasPrimary) {
        throw new ConflictException({
          code: 'PRIMARY_PROFILE_EXISTS',
          message: 'Profil akun utama sudah terdaftar pada akun Anda.',
        });
      }
    }

    let targetPatientId = dto.patientId;

    if (!targetPatientId) {
      if (!dto.name || !dto.nik || !dto.birthDate || !dto.gender) {
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
        const updates: Record<string, any> = {};
        const newBloodType = dto.bloodType
          ? normalizeBloodTypeToDb(dto.bloodType)
          : 'unknown';
        if (
          (!existingPatient.bloodType ||
            existingPatient.bloodType === 'unknown') &&
          newBloodType !== 'unknown'
        ) {
          updates.bloodType = newBloodType;
        }
        if (!existingPatient.occupation && dto.occupation) {
          updates.occupation = dto.occupation.trim();
        }
        if (!existingPatient.motherName && dto.motherName) {
          updates.motherName = dto.motherName.trim();
        }
        if (!existingPatient.birthPlace && dto.birthPlace) {
          updates.birthPlace = dto.birthPlace.trim();
        }
        if (dto.phone?.trim() && dto.phone.trim() !== existingPatient.phone) {
          updates.phone = dto.phone.trim();
        }
        if (dto.email?.trim() && dto.email.trim() !== existingPatient.email) {
          updates.email = dto.email.trim();
        }
        if (Object.keys(updates).length > 0) {
          updates.updatedAt = new Date().toISOString();
          await this.db
            .update(patientProfiles)
            .set(updates)
            .where(eq(patientProfiles.id, existingPatient.id));
        }
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
          if (!Number.isNaN(lastSeq)) {
            nextSequence = lastSeq + 1;
          }
        }
        const rmNumber = `${prefix}${String(nextSequence).padStart(4, '0')}`;

        const dbGender = dto.gender || 'male';
        const dbBloodType = normalizeBloodTypeToDb(dto.bloodType);

        const [newProfile] = await this.db
          .insert(patientProfiles)
          .values({
            userId: dto.isPrimary ? user.id : null,
            occupationId: dto.occupationId || null,
            medicalRecordNumber: rmNumber,
            nationalIdEncrypted: dto.nik,
            nationalIdHash: dto.nik,
            fullName: dto.name.trim(),
            gender: dbGender,
            birthPlace: dto.birthPlace?.trim() || '',
            birthDate: dto.birthDate,
            bloodType: dbBloodType,
            phone: dto.phone?.trim() || null,
            email: dto.email?.trim() || null,
            motherName: dto.motherName?.trim() || null,
            occupation: dto.occupation?.trim() || null,
            status: 'active',
            registeredAt: new Date().toISOString(),
          })
          .returning();

        targetPatientId = newProfile.id;

        const line1 = dto.line1?.trim() || '';
        const provinceName = dto.provinceName || null;
        const provinceCode = dto.provinceCode || null;
        const regencyName = dto.regencyName || null;
        const regencyCode = dto.regencyCode || null;
        const districtName = dto.districtName || null;
        const districtCode = dto.districtCode || null;
        const villageName = dto.villageName || null;
        const villageCode = dto.villageCode || null;

        if (line1 || provinceName) {
          const fullAddress =
            `${line1}, ${villageName ? `Kel. ${villageName}, ` : ''}${districtName ? `Kec. ${districtName}, ` : ''}${regencyName || ''}, Prov. ${provinceName || ''}`.trim();
          await this.db.insert(patientAddresses).values({
            patientId: newProfile.id,
            type: 'domicile',
            provinceCode,
            provinceName,
            regencyCode,
            regencyName,
            districtCode,
            districtName,
            villageCode,
            villageName,
            line1: line1 || fullAddress,
            fullAddress,
            isPrimary: true,
          });
        }
      }
    }

    const createdAffiliation = await this.affiliationRepo.create({
      userId: user.id,
      patientId: targetPatientId,
      relationshipTypeId: dto.relationshipTypeId,
      relationshipType: dto.relationshipType,
      relationLabel: dto.relationLabel || null,
      isPrimary: dto.isPrimary ?? false,
    });

    return {
      success: true,
      message: 'Afiliasi pasien berhasil disimpan.',
      data: createdAffiliation,
    };
  }

  @Delete(':patientId')
  @RequirePermissions('profile:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Menghapus hubungan relasi pasien dari akun login',
  })
  async deleteAffiliation(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      'patientId',
      new ZodValidationPipe(
        z.string().uuid('patientId harus berformat UUID v4 valid'),
      ),
    )
    patientId: string,
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
