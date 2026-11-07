import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, or, sql } from 'drizzle-orm';
import { NikSecurityService } from '../../../../common/security/nik';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  bloodTypes,
  patientAddresses,
  patientAffiliations,
  patientEmergencyContacts,
  patientProfiles,
  patientRelationshipTypes,
} from '../../../../database/schema';
import { normalizeBloodTypeToDb } from '../../domain/data/patient-reference.data';
import type { PatientAffiliationEntity } from '../../domain/entities/patient-affiliation.entity';
import {
  PATIENT_AFFILIATION_REPOSITORY,
  type PatientAffiliationRepository,
} from '../../domain/repositories/patient-affiliation.repository';
import type { CreatePatientAffiliationDto } from '../../presentation/dto/create-patient-affiliation.dto';
import { generateNextMedicalRecordNumber } from '../../presentation/helpers/patient-mrn.helper';

export interface CreatePatientAffiliationInput {
  userId: string;
  userEmail: string;
  userPhone?: string | null;
  dto: CreatePatientAffiliationDto;
}

@Injectable()
export class CreatePatientAffiliationUseCase {
  constructor(
    @Inject(PATIENT_AFFILIATION_REPOSITORY)
    private readonly affiliationRepo: PatientAffiliationRepository,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly nikSecurity: NikSecurityService,
  ) {}

  async execute(
    input: CreatePatientAffiliationInput,
  ): Promise<PatientAffiliationEntity> {
    const { userId, userEmail, userPhone, dto } = input;

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

    const isSelfProfile = Boolean(
      dto.isPrimary ||
      relTypeRecord?.code === 'self' ||
      relTypeRecord?.code === 'diri_sendiri' ||
      relTypeRecord?.isSystem
    );

    if (isSelfProfile) {
      const existingUserAffiliations =
        await this.affiliationRepo.findByUserId(userId);
      const hasPrimary = existingUserAffiliations.some(
        (aff) =>
          aff.isPrimary ||
          aff.isSystem ||
          aff.relationshipType === 'self' ||
          aff.relationshipType === 'diri_sendiri',
      );
      if (hasPrimary) {
        throw new ConflictException({
          code: 'PRIMARY_PROFILE_EXISTS',
          message:
            'Profil akun utama (Diri Sendiri) sudah terdaftar pada akun Anda.',
          invalidParams: [
            {
              name: 'relationshipTypeId',
              reason:
                'Profil akun utama (Diri Sendiri) sudah terdaftar pada akun Anda.',
              code: 'PRIMARY_PROFILE_EXISTS',
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
            eq(patientAffiliations.userId, userId),
            eq(patientAffiliations.relationshipTypeId, relTypeRecord.id),
          ),
        );
      if (Number(existingRelCount?.count ?? 0) > 0) {
        throw new ConflictException({
          code: 'RELATIONSHIP_LIMIT_REACHED',
          message: `Relasi '${relTypeRecord.name}' sudah terdaftar pada akun Anda dan tidak mengizinkan profil ganda.`,
          invalidParams: [
            {
              name: 'relationshipTypeId',
              reason: `Relasi '${relTypeRecord.name}' hanya dapat didaftarkan satu kali.`,
              code: 'RELATIONSHIP_LIMIT_REACHED',
            },
          ],
        });
      }
    }

    const resolvedEmail =
      dto.email?.trim() || (isSelfProfile ? userEmail : null);

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
        if (isSelfProfile && referencedPatient.userId === userId) {
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

    if (targetPatientId) {
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

      if (targetPatient.userId && targetPatient.userId !== userId) {
        throw new ForbiddenException({
          code: 'CANNOT_AFFILIATE_OTHER_PRIMARY_PROFILE',
          message: 'Tidak dapat menautkan profil utama akun pengguna lain.',
        });
      }

      return await this.affiliationRepo.create({
        userId,
        patientId: targetPatientId,
        relationshipTypeId: dto.relationshipTypeId,
        relationshipType: dto.relationshipType,
        relationLabel: dto.relationLabel || null,
        isPrimary: isSelfProfile,
      });
    }

    // Creating new patient on-demand
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
        invalidParams: [
          {
            name: 'nik',
            reason: 'NIK sudah terdaftar.',
            code: 'NIK_ALREADY_REGISTERED',
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
          invalidParams: [
            {
              name: 'nik',
              reason: 'NIK sudah terdaftar.',
              code: 'NIK_ALREADY_REGISTERED',
            },
          ],
        });
      }

      const rmNumber = await generateNextMedicalRecordNumber(tx);
      const dbGender = patientGender || 'male';
      let resolvedBloodTypeId: string | null = null;
      if (dto.bloodType) {
        const clean = dto.bloodType.trim();
        if (
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            clean,
          )
        ) {
          resolvedBloodTypeId = clean;
        } else {
          const normalizedCode = normalizeBloodTypeToDb(clean);
          const row = await tx.query.bloodTypes.findFirst({
            where: or(
              eq(bloodTypes.code, normalizedCode),
              eq(bloodTypes.name, clean),
              eq(bloodTypes.code, clean.toLowerCase()),
            ),
          });
          resolvedBloodTypeId = row?.id ?? null;
        }
      }
      const securedNik = this.nikSecurity.secure(cleanNik)!;

      try {
        const [newProfile] = await tx
          .insert(patientProfiles)
          .values({
            userId: isSelfProfile ? userId : null,
            occupationId: dto.occupationId || null,
            bloodTypeId: resolvedBloodTypeId,
            medicalRecordNumber: rmNumber,
            nationalIdEncrypted: securedNik.encrypted,
            nationalIdHash: securedNik.blindIndex,
            fullName: patientFullName,
            gender: dbGender,
            birthPlace: dto.birthPlace?.trim() || '',
            birthDate: patientBirthDate,
            phone:
              dto.phone?.trim() ||
              (isSelfProfile ? userPhone || null : null),
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

        const createdAffiliation = await this.affiliationRepo.create(
          {
            userId,
            patientId: targetPatientId,
            relationshipTypeId: dto.relationshipTypeId,
            relationshipType: dto.relationshipType,
            relationLabel: dto.relationLabel || null,
            isPrimary: isSelfProfile,
          },
          tx,
        );

        return createdAffiliation;
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
            invalidParams: [
              {
                name: 'nik',
                reason: 'NIK sudah terdaftar.',
                code: 'NIK_ALREADY_REGISTERED',
              },
            ],
          });
        }
        throw dbErr;
      }
    });
  }
}
