import type { NikSecurityService } from '../../../../common/security/nik';

export function mapEnrichedPatient(aff: any, nikSecurity?: NikSecurityService) {
  const p = aff.patient;
  const pStatus = p?.status || 'active';
  const rawNik = p?.nik || '';
  const maskedNik = rawNik;

  return {
    id: aff.patientId,
    affiliationId: aff.id,
    isPrimary: aff.isPrimary ?? false,
    fullName: p?.fullName || '',
    nik: rawNik,
    maskedNik,
    gender: p?.gender || null,
    bloodType: p?.bloodType || null,
    birthPlace: p?.birthPlace || null,
    birthDate: p?.birthDate || null,
    motherName: p?.motherName || null,
    address: p?.fullAddress || null,
    fullAddress: p?.fullAddress || null,
    line1: p?.line1 || null,
    alamatDetail: p?.line1 || null,
    provinceName: p?.provinceName || null,
    provinceCode: p?.provinceCode || null,
    regencyName: p?.regencyName || null,
    regencyCode: p?.regencyCode || null,
    districtName: p?.districtName || null,
    districtCode: p?.districtCode || null,
    villageName: p?.villageName || null,
    villageCode: p?.villageCode || null,
    phoneNumber: p?.phone || null,
    phone: p?.phone || null,
    email: p?.email || null,
    relationship: aff.relationshipType,
    relationshipLabel: aff.relationLabel || aff.relationshipType,
    relationshipTypeId: aff.relationshipTypeId,
    icon: (aff as any).iconName || null,
    iconName: (aff as any).iconName || null,
    isSystem: Boolean((aff as any).isSystem || aff.isPrimary),
    occupationName: p?.occupation || null,
    status: pStatus,
    emergencyContactName: p?.emergencyContactName || null,
    emergencyContactPhone: p?.emergencyContactPhone || null,
    emergencyContactRelationship: p?.emergencyContactRelationship || null,
    hasExistingIntake: false,
    latestIntakeId: null,
    latestIntakeDate: null,
  };
}
