import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
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
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AuthenticatedUser,
  CurrentUser,
  HybridAuthGuard,
  isExternalUser,
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/auth';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  clinicServices,
  patientAffiliations,
  patientProfiles,
  patientRelationshipTypes,
} from '../../../database/schema';
import {
  PATIENT_REPOSITORY,
  type PatientRepository,
} from '../domain/repositories/patient.repository';
import {
  PATIENT_AFFILIATION_REPOSITORY,
  type PatientAffiliationRepository,
} from '../domain/repositories/patient-affiliation.repository';
import { CreatePatientAffiliationUseCase } from '../application/use-cases/create-patient-affiliation.use-case';
import { CreatePatientAffiliationDto } from './dto/create-patient-affiliation.dto';
import { VerifyNikAvailabilityDto } from './dto/verify-nik-availability.dto';
import { mapEnrichedPatient } from './mappers/enriched-patient.mapper';
import { NikSecurityService } from '../../../common/security/nik';

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
    private readonly createAffiliationUseCase: CreatePatientAffiliationUseCase,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly nikSecurity: NikSecurityService,
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
    const formType = intakeFormCode;

    const rawAffiliations = await this.affiliationRepo.findByUserId(user.id);

    // Dynamic relationship cardinality enforcement:
    // Count user's existing affiliations per relationship_type_id
    const userAffiliationCounts = await this.db
      .select({
        relationshipTypeId: patientAffiliations.relationshipTypeId,
        count: sql<number>`count(*)::int`,
      })
      .from(patientAffiliations)
      .where(eq(patientAffiliations.userId, user.id))
      .groupBy(patientAffiliations.relationshipTypeId);

    const affiliationCountMap = new Map<string, number>();
    for (const row of userAffiliationCounts) {
      affiliationCountMap.set(row.relationshipTypeId, Number(row.count));
    }

    const activeRelationshipTypes =
      await this.db.query.patientRelationshipTypes.findMany({
        where: eq(patientRelationshipTypes.isActive, true),
        orderBy: [
          asc(patientRelationshipTypes.displayOrder),
          asc(patientRelationshipTypes.name),
        ],
      });

    // Filter available relationships based on database-driven cardinality rules
    const allowedRelationships = activeRelationshipTypes
      .filter((t) => {
        const count = affiliationCountMap.get(t.id) ?? 0;
        return t.allowsMultiple || count === 0;
      })
      .map((t) => ({
        id: t.id,
        value: t.code,
        label: t.name,
        icon: t.iconName,
        iconName: t.iconName,
        description: t.description || undefined,
        isSystem: t.isSystem,
        allowsMultiple: t.allowsMultiple,
      }));

    const hasExistingPrimary = rawAffiliations.some(
      (aff) => aff.isPrimary || aff.isSystem,
    );

    const enrichedPatients = rawAffiliations.map((aff) =>
      mapEnrichedPatient(aff, this.nikSecurity),
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
        formSchema: service.intakeForm?.schema || null,
        allowedRelationships,
        patients: enrichedPatients,
        totalPatients: enrichedPatients.length,
        hasExistingPatient: enrichedPatients.length > 0,
        hasExistingPrimary: Boolean(hasExistingPrimary),
        currentUser: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone || null,
        },
      },
    };
  }

  @Post('nik/availability')
  @RequirePermissions('patients:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cek ketersediaan NIK administratif internal (terbatas staf berwenang)',
    description:
      'Pemeriksaan administratif internal untuk staf klinik saat admisi pasien. Terkunci dari akses publik untuk mencegah Identity Enumeration.',
  })
  async checkNikAvailability(
    @Body() dto: VerifyNikAvailabilityDto,
  ) {
    const cleanNik = this.nikSecurity.parseOrThrow(dto.nik);
    const blindIndex = this.nikSecurity.computeBlindIndex(cleanNik);

    const existing = await this.db.query.patientProfiles.findFirst({
      where: or(
        eq(patientProfiles.nationalIdHash, blindIndex),
        eq(patientProfiles.nationalIdHash, cleanNik),
        eq(patientProfiles.nationalIdEncrypted, cleanNik),
      ),
      columns: {
        id: true,
      },
    });

    return {
      success: true,
      data: {
        available: !existing,
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
    const data = await this.createAffiliationUseCase.execute({
      userId: user.id,
      userEmail: user.email,
      userPhone: user.phone || user.patient?.phoneNumber || null,
      dto,
    });

    return {
      success: true,
      message: 'Afiliasi pasien berhasil disimpan.',
      data,
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

  @Get(':patientId/unmask-nik')
  @RequirePermissions('patients:read', 'appointments:book')
  @ApiOperation({
    summary: 'Mendapatkan NIK asli terdekripsi untuk pasien tertentu (Terotorisasi)',
    description:
      'Mengambil NIK yang telah didekripsi hanya jika pemanggil memiliki wewenang atau merupakan pemilik profil.',
  })
  async getUnmaskedNik(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId', new ZodValidationPipe(z.string().uuid()))
    patientId: string,
  ) {
    const profile = await this.db.query.patientProfiles.findFirst({
      where: eq(patientProfiles.id, patientId),
      columns: {
        id: true,
        userId: true,
        nationalIdEncrypted: true,
        nationalIdHash: true,
      },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Profil pasien tidak ditemukan.',
      });
    }

    if (isExternalUser(user) && profile.userId !== user.id) {
      const isAffiliated = await this.affiliationRepo.findByUserAndPatient(
        user.id,
        patientId,
      );
      if (!isAffiliated) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_PATIENT_ACCESS',
          message: 'Anda tidak memiliki wewenang untuk melihat NIK pasien ini.',
        });
      }
    }

    const decrypted = profile.nationalIdEncrypted
      ? this.nikSecurity.decrypt(profile.nationalIdEncrypted)
      : null;

    return {
      success: true,
      data: {
        patientId: profile.id,
        nik: decrypted,
        maskedNik: decrypted,
      },
    };
  }
}
