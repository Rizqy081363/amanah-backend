import { NameInitialsHelper } from '../../../common/utils/name-initials.helper';
import { formatBloodTypeDisplay } from '../../../modules/patients/domain/data/patient-reference.data';
import { STAFF_STATUS } from '../../../modules/staffs/domain/constants/staff-invitation.constants';
import {
  resolveSystemRole,
  SYSTEM_ROLES,
  type SystemRole,
} from '../../constants/auth.constants';

export class AuthUserMapper {
  static formatUser(userRecord: any, hasPendingInvitation = false) {
    const { authAccounts: _authAccounts, ...sanitizedUser } = userRecord;

    const primaryRole = sanitizedUser.userRoles_userId?.[0]?.role;
    const hasStaffProfiles = Boolean(
      sanitizedUser.staffProfiles && sanitizedUser.staffProfiles.length > 0,
    );
    const systemRole: SystemRole = resolveSystemRole(
      primaryRole?.code,
      hasStaffProfiles,
    );

    const p = sanitizedUser.patientProfiles?.[0];
    const primaryPatientAddress =
      p?.patientAddresses?.find((a: any) => a.isPrimary) ||
      p?.patientAddresses?.[0];
    const primaryEmergency = p?.patientEmergencyContacts?.[0];

    const patient = p
      ? {
          id: p.id,
          userId: p.userId,
          medicalRecordNumber: p.medicalRecordNumber,
          nik: p.nationalIdEncrypted || null,
          fullName: p.fullName,
          gender: p.gender || null,
          birthPlace: p.birthPlace || null,
          birthDate:
            typeof p.birthDate === 'string'
              ? p.birthDate
              : p.birthDate?.toISOString?.()?.slice(0, 10) || null,
          bloodType: formatBloodTypeDisplay(p.bloodType),
          phoneNumber: p.phone || null,
          motherName: p.motherName || null,
          occupation: p.occupation || null,
          address: primaryPatientAddress?.fullAddress || '',
          alamatDetail: primaryPatientAddress?.line1 || null,
          provinsi: primaryPatientAddress?.provinceName || null,
          provinsiId: primaryPatientAddress?.provinceCode || null,
          kabupaten: primaryPatientAddress?.regencyName || null,
          kabupatenId: primaryPatientAddress?.regencyCode || null,
          kecamatan: primaryPatientAddress?.districtName || null,
          kecamatanId: primaryPatientAddress?.districtCode || null,
          kelurahan: primaryPatientAddress?.villageName || null,
          kelurahanId: primaryPatientAddress?.villageCode || null,
          emergencyContactName: primaryEmergency?.name || null,
          emergencyContactPhone: primaryEmergency?.phone || null,
          emergencyContactRelationship: primaryEmergency?.relationship || null,
          status: p.status,
        }
      : null;

    const s = sanitizedUser.staffProfiles?.[0];

    // Compute canonical avatar object and initials
    const fullName =
      s !== null && s !== undefined
        ? s.fullName
        : p !== null && p !== undefined
          ? p.fullName
          : sanitizedUser.name;
    const initials = NameInitialsHelper.getInitials(fullName);

    const storedAvatarUrl =
      sanitizedUser.avatarUrl !== null && sanitizedUser.avatarUrl !== undefined
        ? sanitizedUser.avatarUrl
        : s !== null && s !== undefined
          ? s.avatarUrl
          : null;
    let avatarType: 'custom' | 'oauth' | 'initials' = 'initials';
    let hasCustomAvatar = false;

    if (storedAvatarUrl) {
      if (
        storedAvatarUrl.startsWith('http://') ||
        storedAvatarUrl.startsWith('https://')
      ) {
        if (
          storedAvatarUrl.includes('/api/v1/users/') &&
          storedAvatarUrl.includes('/avatar')
        ) {
          avatarType = 'custom';
          hasCustomAvatar = true;
        } else {
          avatarType = 'oauth';
          hasCustomAvatar = false;
        }
      } else {
        avatarType = 'custom';
        hasCustomAvatar = true;
      }
    }

    const canonicalAvatarUrl = `/api/v1/users/${sanitizedUser.id}/avatar`;
    const avatar = {
      url: canonicalAvatarUrl,
      initials,
      type: avatarType,
      hasCustomAvatar,
      directUrl: storedAvatarUrl || canonicalAvatarUrl,
    };

    const primaryStaffAddress =
      s?.addresses?.find((a: any) => a.isPrimary) || s?.addresses?.[0];

    const staff = s
      ? {
          id: s.id,
          userId: s.userId,
          practitionerId: s.practitioners?.[0]?.id ?? null,
          poliklinikId: s.primaryUnitId ?? null,
          poliklinikName: s.clinicUnit?.name ?? null,
          fullName: s.fullName,
          profession: s.positionTitle ?? null,
          staffCode: s.staffCode || null,
          nationalId: s.nationalIdEncrypted || null,
          idCardNumber: s.nationalIdEncrypted || null,
          birthPlace: s.birthPlace || null,
          birthDate:
            typeof s.birthDate === 'string'
              ? s.birthDate
              : s.birthDate?.toISOString?.()?.slice(0, 10) || null,
          gender: s.gender || null,
          avatarUrl: s.avatarUrl || avatar.url,
          photoUrl: avatar.url,
          phoneNumber: s.phone || null,
          isActive: s.status === 'active',
          address: primaryStaffAddress
            ? {
                provinceCode: primaryStaffAddress.provinceCode || null,
                provinceName: primaryStaffAddress.provinceName || null,
                regencyCode: primaryStaffAddress.regencyCode || null,
                regencyName: primaryStaffAddress.regencyName || null,
                districtCode: primaryStaffAddress.districtCode || null,
                districtName: primaryStaffAddress.districtName || null,
                villageCode: primaryStaffAddress.villageCode || null,
                villageName: primaryStaffAddress.villageName || null,
                line1: primaryStaffAddress.line1 || null,
                fullAddress: primaryStaffAddress.fullAddress || null,
              }
            : null,
          fullAddress: primaryStaffAddress?.fullAddress || '',
          alamatDetail: primaryStaffAddress?.line1 || null,
          provinsi: primaryStaffAddress?.provinceName || null,
          provinsiId: primaryStaffAddress?.provinceCode || null,
          kabupaten: primaryStaffAddress?.regencyName || null,
          kabupatenId: primaryStaffAddress?.regencyCode || null,
          kecamatan: primaryStaffAddress?.districtName || null,
          kecamatanId: primaryStaffAddress?.districtCode || null,
          kelurahan: primaryStaffAddress?.villageName || null,
          kelurahanId: primaryStaffAddress?.villageCode || null,
        }
      : null;

    let needsOnboarding = false;
    if (systemRole === SYSTEM_ROLES.ADMIN) {
      needsOnboarding = false;
    } else if (systemRole === SYSTEM_ROLES.STAF) {
      if (hasPendingInvitation) {
        needsOnboarding = true;
      } else if (!s || s.status === STAFF_STATUS.INACTIVE) {
        needsOnboarding = true;
      } else {
        const hasAddress = primaryStaffAddress !== undefined && primaryStaffAddress !== null;
        const hasDemographics = Boolean(s.birthDate && s.gender);
        needsOnboarding = !hasAddress || !hasDemographics;
      }
    } else {
      needsOnboarding = !patient;
    }

    return {
      ...sanitizedUser,
      avatarUrl: avatar.url,
      avatar,
      systemRole,
      role: {
        id: primaryRole?.id,
        code: primaryRole?.code,
        name: systemRole,
      },
      staff,
      patient,
      needsOnboarding,
    };
  }
}
