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
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/auth';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  clinicServices,
  patientAddresses,
  patientAffiliations,
  patientEmergencyContacts,
  patientProfiles,
  patientRelationshipTypes,
} from '../../../database/schema';
import { normalizeBloodTypeToDb } from '../domain/data/patient-reference.data';
import { parseNikOrThrow } from '../domain/helpers/patient-nik.helper';
import {
  PATIENT_REPOSITORY,
  type PatientRepository,
} from '../domain/repositories/patient.repository';
import {
  PATIENT_AFFILIATION_REPOSITORY,
  type PatientAffiliationRepository,
} from '../domain/repositories/patient-affiliation.repository';
import { CreatePatientAffiliationDto } from './dto/create-patient-affiliation.dto';
import { VerifyNikAvailabilityDto } from './dto/verify-nik-availability.dto';
import { generateNextMedicalRecordNumber } from './helpers/patient-mrn.helper';
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
  @RequirePermissions('patients:register', 'patients:manage', 'appointments:book')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cek ketersediaan NIK secara real-time untuk pendaftaran pasien',
    description:
      'Memeriksa apakah NIK sudah terdaftar dalam sistem tanpa membocorkan identitas pemilik NIK.',
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
    let relTypeRecord: any = null;
    if (dto.relationshipTypeId) {
      relTypeRecord = await this.db.query.patientRelationshipTypes.findFirst({
        where: eq(patientRelationshipTypes.id, dto.relationshipTypeId),
      });
    } else if (dto.relationshipType) {
      relTypeRecord = await this.db.query.patientRelationshipTypes.findFirst({
        where: eq(patientRelationshipTypes.code, dto.relationshipType),
      });
    }

    if (relTypeRecord) {
      if (!dto.relationshipTypeId) dto.relationshipTypeId = relTypeRecord.id;
      if (!dto.relationshipType) dto.relationshipType = relTypeRecord.code;
    }

    const isSelfProfile = Boolean(dto.isPrimary || relTypeRecord?.isSystem);

    if (isSelfProfile) {
      const existingUserAffiliations = await this.affiliationRepo.findByUserId(
        user.id,
      );
      const hasPrimary = existingUserAffiliations.some(
        (aff) => aff.isPrimary || aff.isSystem,
      );
      if (hasPrimary) {
        throw new ConflictException({
          code: 'PRIMARY_PROFILE_EXISTS',
          message: 'Profil akun utama (Diri Sendiri) sudah terdaftar pada akun Anda.',
          errors: [
            {
              field: 'relationshipTypeId',
              code: 'PRIMARY_PROFILE_EXISTS',
              message:
                'Profil akun utama (Diri Sendiri) sudah terdaftar pada akun Anda.',
            },
          ],
        });
      }
    }

    // Backend-driven relationship cardinality enforcement
    if (relTypeRecord && !relTypeRecord.allowsMultiple) {
      const [existingRelCount] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(patientAffiliations)
        .where(
          and(
            eq(patientAffiliations.userId, user.id),
            eq(patientAffiliations.relationshipTypeId, relTypeRecord.id),
          ),
        );
      if (Number(existingRelCount?.count ?? 0) > 0) {
        throw new ConflictException({
          code: 'RELATIONSHIP_LIMIT_REACHED',
          message: `Relasi '${relTypeRecord.name}' sudah terdaftar pada akun Anda dan tidak mengizinkan profil ganda.`,
          errors: [
            {
              field: 'relationshipTypeId',
              code: 'RELATIONSHIP_LIMIT_REACHED',
              message: `Relasi '${relTypeRecord.name}' hanya dapat didaftarkan satu kali.`,
            },
          ],
        });
      }
    }

    const resolvedEmail =
      dto.email?.trim() || (isSelfProfile ? user.email : null);

    let resolvedEmergencyName = dto.emergencyContactName?.trim() || null;
    let resolvedEmergencyPhone = dto.emergencyContactPhone?.trim() || null;
    let resolvedEmergencyRelationship =
      dto.emergencyContactRelationship?.trim() || null;

    if (dto.emergencyContactPatientId) {
      if (dto.patientId && dto.emergencyContactPatientId === dto.patientId) {
        throw new BadRequestException({
          code: 'SELF_EMERGENCY_CONTACT_NOT_ALLOWED',
          message:
            'Pasien tidak dapat dijadikan kontak darurat untuk dirinya sendiri.',
        });
      }

      const referencedPatient = await this.db.query.patientProfiles.findFirst({
        where: eq(patientProfiles.id, dto.emergencyContactPatientId),
      });
      if (referencedPatient) {
        if (isSelfProfile && referencedPatient.userId === user.id) {
          throw new BadRequestException({
            code: 'SELF_EMERGENCY_CONTACT_NOT_ALLOWED',
            message:
              'Pasien akun utama tidak dapat mereferensikan dirinya sendiri sebagai kontak darurat.',
          });
        }
        resolvedEmergencyName = referencedPatient.fullName;
        resolvedEmergencyPhone =
          referencedPatient.phone || resolvedEmergencyPhone;
      }
    }

    if (dto.emergencyContactRelationshipTypeId) {
      const referencedRelType =
        await this.db.query.patientRelationshipTypes.findFirst({
          where: eq(
            patientRelationshipTypes.id,
            dto.emergencyContactRelationshipTypeId,
          ),
        });
      if (referencedRelType) {
        resolvedEmergencyRelationship = referencedRelType.name;
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

      const patientFullName = dto.name.trim();
      const patientBirthDate = dto.birthDate;
      const patientGender = dto.gender;
      const cleanNik = this.nikSecurity.parseOrThrow(dto.nik);
      const blindIndex = this.nikSecurity.computeBlindIndex(cleanNik);

      // Verify NIK does not already belong to another patient profile
      const existingPatient = await this.db.query.patientProfiles.findFirst({
        where: or(
          eq(patientProfiles.nationalIdHash, blindIndex),
          eq(patientProfiles.nationalIdHash, cleanNik),
          eq(patientProfiles.nationalIdEncrypted, cleanNik),
        ),
        columns: {
          id: true,
        },
      });

      if (existingPatient) {
        throw new ConflictException({
          code: 'NIK_ALREADY_REGISTERED',
          message: 'NIK sudah terdaftar.',
          errors: [
            {
              field: 'nik',
              code: 'NIK_ALREADY_REGISTERED',
              message: 'NIK sudah terdaftar.',
            },
          ],
        });
      }

      return await this.db.transaction(async (tx) => {
        // Re-check inside transaction to eliminate race conditions
        const duplicateCheck = await tx.query.patientProfiles.findFirst({
          where: or(
            eq(patientProfiles.nationalIdHash, blindIndex),
            eq(patientProfiles.nationalIdHash, cleanNik),
            eq(patientProfiles.nationalIdEncrypted, cleanNik),
          ),
          columns: {
            id: true,
          },
        });
        if (duplicateCheck) {
          throw new ConflictException({
            code: 'NIK_ALREADY_REGISTERED',
            message: 'NIK sudah terdaftar.',
            errors: [
              {
                field: 'nik',
                code: 'NIK_ALREADY_REGISTERED',
                message: 'NIK sudah terdaftar.',
              },
            ],
          });
        }

        const rmNumber = await generateNextMedicalRecordNumber(tx);
        const dbGender = patientGender || 'male';
        const dbBloodType = normalizeBloodTypeToDb(dto.bloodType);
        const securedNik = this.nikSecurity.secure(cleanNik)!;

        try {
          const [newProfile] = await tx
            .insert(patientProfiles)
            .values({
              userId: isSelfProfile ? user.id : null,
              occupationId: dto.occupationId || null,
              medicalRecordNumber: rmNumber,
              nationalIdEncrypted: securedNik.encrypted,
              nationalIdHash: securedNik.blindIndex,
              fullName: patientFullName,
              gender: dbGender,
              birthPlace: dto.birthPlace?.trim() || '',
              birthDate: patientBirthDate,
              bloodType: dbBloodType,
              phone:
                dto.phone?.trim() ||
                (isSelfProfile
                  ? user.phone || user.patient?.phoneNumber || null
                  : null),
              email: resolvedEmail,
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
            await tx.insert(patientAddresses).values({
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

          if (resolvedEmergencyPhone) {
            await tx.insert(patientEmergencyContacts).values({
              patientId: newProfile.id,
              name: resolvedEmergencyName,
              phone: resolvedEmergencyPhone,
              relationship: resolvedEmergencyRelationship,
            });
          }

          const createdAffiliation = await this.affiliationRepo.create({
            userId: user.id,
            patientId: targetPatientId,
            relationshipTypeId: dto.relationshipTypeId,
            relationshipType: dto.relationshipType,
            relationLabel: dto.relationLabel || null,
            isPrimary: isSelfProfile,
          });

          return {
            success: true,
            message: 'Afiliasi pasien berhasil disimpan.',
            data: createdAffiliation,
          };
        } catch (dbErr: any) {
          const pgCode = dbErr?.code || dbErr?.cause?.code;
          const pgConstraint =
            dbErr?.constraint ||
            dbErr?.constraint_name ||
            dbErr?.cause?.constraint ||
            dbErr?.cause?.constraint_name;
          if (
            pgCode === '23505' &&
            (pgConstraint === 'patient_profiles_national_id_hash_unique' ||
              pgConstraint?.includes('national_id'))
          ) {
            throw new ConflictException({
              code: 'NIK_ALREADY_REGISTERED',
              message: 'NIK sudah terdaftar.',
              errors: [
                {
                  field: 'nik',
                  code: 'NIK_ALREADY_REGISTERED',
                  message: 'NIK sudah terdaftar.',
                },
              ],
            });
          }
          throw dbErr;
        }
      });
    } else {
      // Linking an existing patientId: verify existence and prevent account hijacking
      const targetPatient = await this.db.query.patientProfiles.findFirst({
        where: eq(patientProfiles.id, targetPatientId),
      });
      if (!targetPatient) {
        throw new NotFoundException({
          code: 'PATIENT_NOT_FOUND',
          message: 'Profil pasien tidak ditemukan.',
        });
      }

      if (targetPatient.userId && targetPatient.userId !== user.id) {
        throw new ForbiddenException({
          code: 'CANNOT_AFFILIATE_OTHER_PRIMARY_PROFILE',
          message: 'Tidak dapat menautkan profil utama akun pengguna lain.',
        });
      }

      const createdAffiliation = await this.affiliationRepo.create({
        userId: user.id,
        patientId: targetPatientId,
        relationshipTypeId: dto.relationshipTypeId,
        relationshipType: dto.relationshipType,
        relationLabel: dto.relationLabel || null,
        isPrimary: isSelfProfile,
      });

      return {
        success: true,
        message: 'Afiliasi pasien berhasil disimpan.',
        data: createdAffiliation,
      };
    }
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

    const decrypted =
      this.nikSecurity.decrypt(profile.nationalIdEncrypted) ||
      profile.nationalIdEncrypted ||
      null;
    const masked = this.nikSecurity.mask(decrypted);

    return {
      success: true,
      data: {
        patientId: profile.id,
        nik: decrypted,
        maskedNik: masked,
      },
    };
  }
}
