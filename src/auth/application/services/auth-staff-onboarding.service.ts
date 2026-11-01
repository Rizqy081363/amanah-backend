import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { and, eq, ne, or, sql } from 'drizzle-orm';
import { RedisService } from '../../../common/redis/redis.service';
import { ClinicTimeService } from '../../../common/time/clinic-time.service';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  clinicUnits,
  doctorAssignments,
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
import {
  STAFF_INVITATION_STATUS,
  STAFF_STATUS,
} from '../../../modules/staffs/domain/constants/staff-invitation.constants';
import { USER_STATUS } from '../../../common/constants/user-status.constants';
import {
  NOTIFICATION_REPOSITORY,
  REALTIME_GATEWAY_PORT,
  REALTIME_ROOMS,
} from '../../../modules/notifications/notifications.constants';
import { SocketIoRealtimeGateway } from '../../../modules/notifications/infrastructure/realtime/socket-io-realtime.gateway';
import { NotificationGatewayService } from '../../../modules/notifications/application/services/notification-gateway.service';
import type { NotificationRepository } from '../../../modules/notifications/domain/repositories/notification.repository';
import { AccessControlService } from '../../../modules/access-control/application/services/access-control.service';
import { AuthStaffOnboardingDto } from '../../dto/auth-staff-onboarding.dto';
import { AuthUserResponseDto } from '../../dto/auth-user-response.dto';
import type { JwtPayloadType } from '../../strategies/types/jwt-payload.type';
import { AuthUserMapper } from '../mappers/auth-user.mapper';

@Injectable()
export class AuthStaffOnboardingService {
  private readonly logger = new Logger(AuthStaffOnboardingService.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redisService: RedisService,
    @Optional()
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
    @Optional()
    private readonly notificationGateway?: NotificationGatewayService,
    @Optional()
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo?: NotificationRepository,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
    @Optional()
    private readonly accessControlService?: AccessControlService,
  ) {}

  private getNowDate(): Date {
    return this.clinicTimeService
      ? this.clinicTimeService.nowDate()
      : new Date();
  }

  private getNowIso(): string {
    return this.getNowDate().toISOString();
  }

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
      throw new BadRequestException('Poliklinik tidak valid atau tidak aktif.');
    }

    return clinicUnit.id;
  }

  async completeStaffOnboarding(
    userJwtPayload: JwtPayloadType,
    dto: AuthStaffOnboardingDto,
  ): Promise<AuthUserResponseDto | null> {
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

    let effectiveRole = assignedUserRole?.role;

    const pendingInvitation = await this.db.query.staffInvitations.findFirst({
      where: and(
        eq(staffInvitations.email, userRecord.email.toLowerCase()),
        eq(staffInvitations.status, STAFF_INVITATION_STATUS.PENDING),
      ),
    });

    if (pendingInvitation?.roleId) {
      const invRole = await this.db.query.roles.findFirst({
        where: eq(roles.id, pendingInvitation.roleId),
      });
      if (invRole) {
        if (!invRole.isActive) {
          throw new ForbiddenException({
            code: 'INVITATION_ROLE_INACTIVE',
            message:
              'Peran yang ditugaskan dalam undangan ini sudah tidak aktif atau telah dihapus.',
          });
        }
        effectiveRole = invRole;
      }
    }

    if (effectiveRole && !effectiveRole.isActive) {
      throw new ForbiddenException({
        code: 'ROLE_INACTIVE',
        message: 'Peran akun Anda saat ini sedang dinonaktifkan.',
      });
    }

    const roleCode = effectiveRole?.code ?? null;
    const roleId = effectiveRole?.id ?? null;
    const isClinical = effectiveRole?.isClinical ?? false;

    const defaultPrefix = isClinical ? 'STF-CLN' : 'STF-ADM';
    const finalStaffCode =
      dto.staffCode?.trim() ||
      `${defaultPrefix}-${Date.now().toString().slice(-4)}`;

    const positionTitle =
      dto.profession?.trim() || effectiveRole?.name || 'Staf Klinik';
    const resolvedPoliklinikId = await this.resolveOnboardingPoliklinikId(
      dto.poliklinikId,
    );
    const userAvatarUrl = userRecord.avatarUrl?.trim() || null;

    const resolvedPhone = dto.phoneNumber?.trim() || userRecord.phone || null;
    if (resolvedPhone) {
      const existingPhoneUser = await this.db.query.users.findFirst({
        where: and(eq(users.phone, resolvedPhone), ne(users.id, userRecord.id)),
      });
      if (existingPhoneUser) {
        throw new ConflictException({
          code: 'PHONE_ALREADY_EXISTS',
          message:
            'Nomor telepon sudah terdaftar pada akun lain. Silakan gunakan nomor telepon lain.',
        });
      }
    }

    await this.db.transaction(async (tx) => {
      // 1. Update Better Auth "user" table
      try {
        await tx
          .update(user)
          .set({
            role: roleCode,
            name: dto.fullName.trim(),
            updatedAt: this.getNowIso(),
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
          updatedAt: this.getNowIso(),
        })
        .where(eq(users.id, userRecord.id));

      // 3. Update user_roles
      if (roleId) {
        await tx.delete(userRoles).where(eq(userRoles.userId, userRecord.id));

        await tx.insert(userRoles).values({
          userId: userRecord.id,
          roleId: roleId,
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
            roleId: roleId || existingStaff.roleId,
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
            updatedAt: this.getNowIso(),
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
            roleId: roleId || null,
            fullName: dto.fullName.trim(),
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
            acceptedAt: this.getNowIso(),
            acceptedUserId: userRecord.id,
            updatedAt: this.getNowIso(),
          })
          .where(eq(staffInvitations.id, pendingInvitation.id));
      }

      // 6. If clinical practitioner (isClinical is true), create or update practitioner record
      if (isClinical && existingStaff) {
        let practitionerId: string;
        const existingPractitioner = await tx.query.practitioners.findFirst({
          where: eq(practitioners.staffProfileId, existingStaff.id),
        });

        if (!existingPractitioner) {
          const [newPractitioner] = await tx
            .insert(practitioners)
            .values({
              staffProfileId: existingStaff.id,
              displayName: dto.fullName.trim(),
              licenseNumber: dto.licenseNumber?.trim() || null,
              isAcceptingAppointments: true,
            })
            .returning();
          practitionerId = newPractitioner.id;
        } else {
          practitionerId = existingPractitioner.id;
          await tx
            .update(practitioners)
            .set({
              displayName: dto.fullName.trim(),
              licenseNumber:
                dto.licenseNumber?.trim() || existingPractitioner.licenseNumber,
              isAcceptingAppointments: true,
              updatedAt: this.getNowIso(),
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
                updatedAt: this.getNowIso(),
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
        authAccounts: true,
        userRoles_userId: {
          with: {
            role: {
              with: {
                rolePermissions: {
                  with: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        staffProfiles: {
          with: {
            practitioners: true,
            addresses: true,
            clinicUnit: true,
            role: {
              with: {
                rolePermissions: {
                  with: {
                    permission: true,
                  },
                },
              },
            },
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

    const primaryStaff = updatedUser?.staffProfiles?.[0];
    const staffName = dto.fullName.trim();
    const nowIso = this.getNowIso();

    const staffOnboardedPayload = {
      userId: userRecord.id,
      staffProfileId: primaryStaff?.id || '',
      staffCode: primaryStaff?.staffCode || finalStaffCode,
      fullName: staffName,
      roleId,
      roleCode,
      isClinical,
      profession: positionTitle,
      poliklinikId: resolvedPoliklinikId || null,
      status: 'active',
      onboardedAt: nowIso,
    };

    // 1. Scoped Real-time WebSocket Dispatch to Admin & Clinic
    try {
      void this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'staff:onboarded',
        staffOnboardedPayload,
      );
      void this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'staff:updated',
        staffOnboardedPayload,
      );
      void this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'roles:updated',
        { roleId, action: 'staff_onboarded' },
      );
      void this.realtimeGateway?.emitToUser?.(
        userRecord.id,
        'staff:onboarded',
        staffOnboardedPayload,
      );
    } catch (realtimeErr) {
      this.logger.warn(
        `Failed to emit staff:onboarded realtime event: ${String(realtimeErr)}`,
      );
    }

    // 2. Dispatch FCM Push & In-App Notification (Mobile & Web Bell)
    const welcomeTitle = 'Selamat Bergabung di Klinik Amanah!';
    const welcomeBody = `Selamat bertugas, ${staffName}! Akun Anda telah aktif sebagai ${positionTitle}. Silakan cek jadwal dan tugas Anda di aplikasi.`;

    try {
      if (this.notificationGateway) {
        await this.notificationGateway.dispatch({
          commandId: `welcome-staff-${userRecord.id}-${this.getNowDate().getTime()}`,
          sourceDomain: 'staff',
          target: {
            type: 'user',
            recipientUserIds: [userRecord.id],
          },
          category: 'system',
          content: {
            title: welcomeTitle,
            body: welcomeBody,
            actionUrl: '/home',
            data: {
              staffId: primaryStaff?.id || '',
              staffCode: primaryStaff?.staffCode || finalStaffCode,
              roleId: roleId || '',
              roleCode,
              isClinical: String(isClinical),
              profession: positionTitle,
              category: 'welcome_staff',
            },
          },
          channels: ['push', 'in_app'],
          priority: 'high',
        });
      }
    } catch (pushErr) {
      this.logger.warn(
        `Failed to dispatch welcome push notification via gateway: ${String(pushErr)}`,
      );
    }

    // 3. Persist In-App Notification in DB for Mobile Bell History
    try {
      if (this.notificationRepo) {
        await this.notificationRepo.createNotification({
          category: 'system',
          title: welcomeTitle,
          body: welcomeBody,
          senderName: 'Klinik Amanah',
          senderRole: 'Sistem Kepegawaian',
          isUrgent: false,
          recipientUserIds: [userRecord.id],
        });
      }
    } catch (repoErr) {
      this.logger.warn(
        `Failed to persist in-app welcome notification: ${String(repoErr)}`,
      );
    }

    let accessibleRoutes: string[] = [];
    if (this.accessControlService && userRecord?.id) {
      try {
        accessibleRoutes =
          await this.accessControlService.getUserEffectiveRoutes(userRecord.id);
      } catch {
        // Safe fallback
      }
    }

    return updatedUser
      ? AuthUserMapper.formatUser(updatedUser, false, accessibleRoutes)
      : null;
  }
}
