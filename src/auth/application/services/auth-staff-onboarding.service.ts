import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { and, eq, or, sql } from 'drizzle-orm';
import { RedisService } from '../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  clinicUnits,
  doctorAssignments,
  medicalSpecialties,
  practitioners,
  roles,
  sessionDefs,
  staffAddresses,
  staffInvitations,
  staffProfiles,
  user,
  userRoles,
  users,
} from '../../../database/schema';
import { MEDICAL_SPECIALTY_CODES } from '../../../modules/clinics/domain/constants/medical-specialty.constants';
import {
  BETTER_AUTH_STAFF_ROLES,
  type BetterAuthStaffRole,
  STAFF_INVITATION_STATUS,
  STAFF_ROLE_CODES,
  STAFF_STATUS,
  STAFF_TYPES,
  type StaffRoleCode,
  type StaffType,
} from '../../../modules/staffs/domain/constants/staff-invitation.constants';
import { USER_STATUS } from '../../constants/auth.constants';
import {
  AuthStaffOnboardingDto,
  StaffOnboardingRole,
} from '../../dto/auth-staff-onboarding.dto';
import type { JwtPayloadType } from '../../strategies/types/jwt-payload.type';
import { AuthUserMapper } from '../mappers/auth-user.mapper';

@Injectable()
export class AuthStaffOnboardingService {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redisService: RedisService,
  ) {}

  public async resolveOnboardingPoliklinikId(
    poliklinikId?: string,
  ): Promise<string | undefined> {
    const value = poliklinikId?.trim();
    if (!value) {
      return undefined;
    }

    let clinicUnit: any;
    if (isUUID(value)) {
      clinicUnit = await this.db.query.clinicUnits.findFirst({
        where: eq(clinicUnits.id, value),
      });
    }

    if (!clinicUnit) {
      const normalizedCode = value.toLowerCase().replace(/-/g, '_');
      clinicUnit = await this.db.query.clinicUnits.findFirst({
        where: or(
          eq(clinicUnits.code, value),
          eq(clinicUnits.code, normalizedCode),
          eq(sql`lower(${clinicUnits.name})`, value.toLowerCase()),
        ),
      });
    }

    if (!clinicUnit?.isActive) {
      throw new BadRequestException(
        'Poliklinik tidak valid. Pilih Poli Umum atau Poli KIA.',
      );
    }

    return clinicUnit.id;
  }

  async completeStaffOnboarding(
    userJwtPayload: JwtPayloadType,
    dto: AuthStaffOnboardingDto,
  ): Promise<any> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userJwtPayload.id),
      with: {
        userRoles_userId: true,
        staffProfiles: true,
      },
    });

    if (!userRecord) {
      throw new UnauthorizedException('Pengguna tidak ditemukan di sistem.');
    }

    // 1. Determine role from DB / Invitation (SSOT, prevents client-side role escalation)
    const assignedUserRole = await this.db.query.userRoles.findFirst({
      where: eq(userRoles.userId, userRecord.id),
      with: {
        role: true,
      },
    });

    let effectiveRoleCode: string | undefined = assignedUserRole?.role?.code;

    const pendingInvitation = await this.db.query.staffInvitations.findFirst({
      where: and(
        eq(staffInvitations.email, userRecord.email.toLowerCase()),
        eq(staffInvitations.status, STAFF_INVITATION_STATUS.PENDING),
      ),
    });

    if (pendingInvitation) {
      effectiveRoleCode = pendingInvitation.roleCode;
    }

    let betterAuthRole: BetterAuthStaffRole = BETTER_AUTH_STAFF_ROLES.DOCTOR;
    let rolesCode: StaffRoleCode = STAFF_ROLE_CODES.DOCTOR;
    let staffTypeVal: StaffType = STAFF_TYPES.DOCTOR;

    if (
      effectiveRoleCode === STAFF_ROLE_CODES.DOCTOR ||
      (!effectiveRoleCode && dto.role === StaffOnboardingRole.DOCTOR)
    ) {
      betterAuthRole = BETTER_AUTH_STAFF_ROLES.DOCTOR;
      rolesCode = STAFF_ROLE_CODES.DOCTOR;
      staffTypeVal = STAFF_TYPES.DOCTOR;
    } else if (
      effectiveRoleCode === STAFF_ROLE_CODES.MIDWIFE ||
      (!effectiveRoleCode && dto.role === StaffOnboardingRole.MIDWIFE)
    ) {
      betterAuthRole = BETTER_AUTH_STAFF_ROLES.MIDWIFE;
      rolesCode = STAFF_ROLE_CODES.MIDWIFE;
      staffTypeVal = STAFF_TYPES.MIDWIFE;
    } else {
      betterAuthRole = BETTER_AUTH_STAFF_ROLES.WORKER;
      rolesCode = STAFF_ROLE_CODES.WORKER;
      staffTypeVal = STAFF_TYPES.WORKER;
    }

    const defaultPrefix =
      staffTypeVal === STAFF_TYPES.DOCTOR
        ? 'STF-DOK'
        : staffTypeVal === STAFF_TYPES.MIDWIFE
          ? 'STF-BDN'
          : 'STF-ADM';
    const finalStaffCode =
      dto.staffCode?.trim() ||
      `${defaultPrefix}-${Date.now().toString().slice(-4)}`;

    const positionTitle =
      dto.profession?.trim() ||
      (staffTypeVal === STAFF_TYPES.DOCTOR
        ? 'Dokter'
        : staffTypeVal === STAFF_TYPES.MIDWIFE
          ? 'Bidan'
          : 'Staf Administrasi');
    const resolvedPoliklinikId = await this.resolveOnboardingPoliklinikId(
      dto.poliklinikId,
    );
    const userAvatarUrl = userRecord.avatarUrl?.trim() || null;

    await this.db.transaction(async (tx) => {
      // 1. Update Better Auth "user" table
      try {
        await tx
          .update(user)
          .set({
            role: betterAuthRole,
            name: dto.fullName.trim(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(user.id, userRecord.id));
      } catch {
        // Non-blocking if record is managed exclusively in users
      }

      // 2. Update users table
      await tx
        .update(users)
        .set({
          name: dto.fullName.trim(),
          phone: dto.phoneNumber?.trim() || userRecord.phone,
          status: USER_STATUS.ACTIVE,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, userRecord.id));

      // 3. Update user_roles
      const targetRole = await tx.query.roles.findFirst({
        where: eq(roles.code, rolesCode),
      });

      if (targetRole) {
        await tx.delete(userRoles).where(eq(userRoles.userId, userRecord.id));

        await tx.insert(userRoles).values({
          userId: userRecord.id,
          roleId: targetRole.id,
        });
      }

      // 4. Create or update staff_profiles
      let existingStaff = await tx.query.staffProfiles.findFirst({
        where: eq(staffProfiles.userId, userRecord.id),
      });

      const resolvedGender = dto.gender
        ? (dto.gender.toLowerCase() as 'male' | 'female')
        : existingStaff?.gender || null;

      if (existingStaff) {
        const [updated] = await tx
          .update(staffProfiles)
          .set({
            fullName: dto.fullName.trim(),
            staffCode: finalStaffCode,
            staffType: staffTypeVal,
            positionTitle,
            birthPlace: dto.birthPlace?.trim() || existingStaff.birthPlace,
            birthDate: dto.birthDate || existingStaff.birthDate,
            gender: resolvedGender || existingStaff.gender,
            nationalIdHash:
              dto.nationalId?.trim() || existingStaff.nationalIdHash,
            nationalIdEncrypted:
              dto.nationalId?.trim() || existingStaff.nationalIdEncrypted,
            phone: dto.phoneNumber?.trim() || existingStaff.phone,
            primaryUnitId: resolvedPoliklinikId || existingStaff.primaryUnitId,
            avatarUrl: existingStaff.avatarUrl || userAvatarUrl,
            status: STAFF_STATUS.ACTIVE,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(staffProfiles.id, existingStaff.id))
          .returning();
        existingStaff = updated;
      } else {
        const [created] = await tx
          .insert(staffProfiles)
          .values({
            userId: userRecord.id,
            staffCode: finalStaffCode,
            fullName: dto.fullName.trim(),
            staffType: staffTypeVal,
            positionTitle,
            birthPlace: dto.birthPlace?.trim() || null,
            birthDate: dto.birthDate || null,
            gender: resolvedGender,
            nationalIdHash: dto.nationalId?.trim() || null,
            nationalIdEncrypted: dto.nationalId?.trim() || null,
            phone: dto.phoneNumber?.trim(),
            email: userRecord.email,
            primaryUnitId: resolvedPoliklinikId,
            avatarUrl: userAvatarUrl,
            status: STAFF_STATUS.ACTIVE,
          })
          .returning();
        existingStaff = created;
      }

      // 5. Mark pending invitation accepted if exists
      if (pendingInvitation) {
        await tx
          .update(staffInvitations)
          .set({
            status: STAFF_INVITATION_STATUS.ACCEPTED,
            acceptedAt: new Date().toISOString(),
            acceptedUserId: userRecord.id,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(staffInvitations.id, pendingInvitation.id));
      }

      // 6. If clinical practitioner (doctor or midwife), create or update practitioner record
      const isClinicalPractitioner =
        (staffTypeVal === STAFF_TYPES.DOCTOR ||
          staffTypeVal === STAFF_TYPES.MIDWIFE) &&
        existingStaff;

      if (isClinicalPractitioner) {
        let practitionerId: string;
        const existingPractitioner = await tx.query.practitioners.findFirst({
          where: eq(practitioners.staffProfileId, existingStaff.id),
        });

        const targetSpecialtyCode =
          staffTypeVal === STAFF_TYPES.MIDWIFE
            ? MEDICAL_SPECIALTY_CODES.MATERNAL_CHILD_HEALTH
            : MEDICAL_SPECIALTY_CODES.GENERAL_PRACTITIONER;
        const matchedSpecialty = await tx.query.medicalSpecialties.findFirst({
          where: eq(medicalSpecialties.code, targetSpecialtyCode),
        });

        if (!existingPractitioner) {
          const [newPractitioner] = await tx
            .insert(practitioners)
            .values({
              staffProfileId: existingStaff.id,
              displayName: dto.fullName.trim(),
              licenseNumber: dto.licenseNumber?.trim() || null,
              specialtyId: matchedSpecialty?.id || null,
              isAcceptingAppointments: true,
            })
            .returning();
          practitionerId = newPractitioner.id;
        } else {
          practitionerId = existingPractitioner.id;
          let targetSpecialtyId = existingPractitioner.specialtyId;
          if (!targetSpecialtyId && matchedSpecialty) {
            targetSpecialtyId = matchedSpecialty.id;
          }

          await tx
            .update(practitioners)
            .set({
              displayName: dto.fullName.trim(),
              licenseNumber:
                dto.licenseNumber?.trim() || existingPractitioner.licenseNumber,
              specialtyId: targetSpecialtyId || null,
              isAcceptingAppointments: true,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(practitioners.id, existingPractitioner.id));
        }

        const existingAssignments = await tx.query.doctorAssignments.findMany({
          where: eq(doctorAssignments.doctorId, practitionerId),
        });

        if (existingAssignments.length === 0) {
          const activeSessionDefs = await tx.query.sessionDefs.findMany({
            where: eq(sessionDefs.isActive, true),
          });

          if (activeSessionDefs.length > 0) {
            await tx.insert(doctorAssignments).values(
              activeSessionDefs.map((def: any) => ({
                doctorId: practitionerId,
                sessionId: def.id,
                dow: null,
                isActive: true,
              })),
            );
          }
        }
      }

      // 7. Regional Address persistence in staff_addresses (Flutter & onboarding SSOT)
      if (existingStaff) {
        const provName = dto.provinsi?.trim() || null;
        const provCode = dto.provinsiId?.trim() || null;
        const regName = dto.kabupaten?.trim() || null;
        const regCode = dto.kabupatenId?.trim() || null;
        const distName = dto.kecamatan?.trim() || null;
        const distCode = dto.kecamatanId?.trim() || null;
        const villName = dto.kelurahan?.trim() || null;
        const villCode = dto.kelurahanId?.trim() || null;
        const streetLine1 = dto.line1?.trim() || '';

        const hasRegionalData =
          streetLine1.length > 0 || provName !== null || regName !== null;

        if (hasRegionalData) {
          const fullAddress = [
            streetLine1,
            villName ? `Kel. ${villName}` : null,
            distName ? `Kec. ${distName}` : null,
            regName,
            provName ? `Prov. ${provName}` : null,
          ]
            .filter(Boolean)
            .join(', ');

          const existingAddress = await tx.query.staffAddresses.findFirst({
            where: and(
              eq(staffAddresses.staffProfileId, existingStaff.id),
              eq(staffAddresses.isPrimary, true),
            ),
          });

          if (existingAddress) {
            await tx
              .update(staffAddresses)
              .set({
                provinceCode: provCode || existingAddress.provinceCode,
                provinceName: provName || existingAddress.provinceName,
                regencyCode: regCode || existingAddress.regencyCode,
                regencyName: regName || existingAddress.regencyName,
                districtCode: distCode || existingAddress.districtCode,
                districtName: distName || existingAddress.districtName,
                villageCode: villCode || existingAddress.villageCode,
                villageName: villName || existingAddress.villageName,
                line1: streetLine1 || existingAddress.line1,
                fullAddress: fullAddress || existingAddress.fullAddress,
                updatedAt: new Date().toISOString(),
              })
              .where(eq(staffAddresses.id, existingAddress.id));
          } else {
            await tx.insert(staffAddresses).values({
              staffProfileId: existingStaff.id,
              type: 'domicile',
              provinceCode: provCode || null,
              provinceName: provName || null,
              regencyCode: regCode || null,
              regencyName: regName || null,
              districtCode: distCode || null,
              districtName: distName || null,
              villageCode: villCode || null,
              villageName: villName || null,
              line1: streetLine1.length > 0 ? streetLine1 : null,
              fullAddress:
                fullAddress.length > 0
                  ? fullAddress
                  : streetLine1.length > 0
                    ? streetLine1
                    : null,
              isPrimary: true,
            });
          }
        }
      }
    });

    try {
      await this.redisService.invalidateTags(
        'schedule',
        'schedule:list',
        'schedule:detail',
      );
    } catch {
      // safe fallback
    }

    const updatedUser = await this.db.query.users.findFirst({
      where: eq(users.id, userJwtPayload.id),
      with: {
        userRoles_userId: {
          with: {
            role: true,
          },
        },
        staffProfiles: {
          with: {
            practitioners: true,
            addresses: true,
            clinicUnit: true,
          },
        },
        patientProfiles: {
          with: {
            patientAddresses: true,
            patientEmergencyContacts: true,
          },
        },
      },
    });

    return updatedUser ? AuthUserMapper.formatUser(updatedUser, false) : null;
  }
}
