import type { PatientEntity } from '../../domain/entities/patient.entity';
import { formatBloodTypeDisplay } from '../../domain/data/patient-reference.data';

export class PatientRecordMapper {
  static toEntity(record: any): PatientEntity {
    const bloodTypeDisplay = formatBloodTypeDisplay(record.bloodType);

    const primaryAddress =
      record.patientAddresses?.find((a: any) => a.isPrimary) ||
      record.patientAddresses?.[0];
    const primaryEmergency = record.patientEmergencyContacts?.[0];

    const resolvedPhone = record.phone || record.user?.phone || '';
    const resolvedEmail = record.email || record.user?.email || null;
    const resolvedRegisteredAt = record.registeredAt
      ? typeof record.registeredAt === 'string'
        ? record.registeredAt
        : record.registeredAt.toISOString()
      : record.createdAt
        ? new Date(record.createdAt).toISOString()
        : null;
    const resolvedFirstLoginAt = record.firstLoginAt
      ? typeof record.firstLoginAt === 'string'
        ? record.firstLoginAt
        : record.firstLoginAt.toISOString()
      : record.user?.createdAt
        ? new Date(record.user.createdAt).toISOString()
        : null;
    const resolvedLastLoginAt = record.user?.lastLoginAt
      ? typeof record.user.lastLoginAt === 'string'
        ? record.user.lastLoginAt
        : record.user.lastLoginAt.toISOString()
      : null;

    return {
      id: record.id,
      userId: record.userId || '',
      medicalRecordNumber: record.medicalRecordNumber,
      nik: record.nationalIdEncrypted || record.nationalIdHash || '',
      fullName: record.fullName,
      gender: (record.gender as 'male' | 'female') || 'male',
      birthPlace: record.birthPlace || '',
      birthDate:
        typeof record.birthDate === 'string'
          ? record.birthDate
          : record.birthDate?.toISOString?.()?.slice(0, 10) || '',
      bloodType: bloodTypeDisplay,
      namaIbuKandung: record.motherName || null,
      pekerjaan: record.occupation || null,
      phoneNumber: resolvedPhone,
      email: resolvedEmail,
      address: primaryAddress?.fullAddress || '',
      alamatDetail: primaryAddress?.line1 || null,
      provinsi: primaryAddress?.provinceName || null,
      provinsiId: primaryAddress?.provinceCode || null,
      kabupaten: primaryAddress?.regencyName || null,
      kabupatenId: primaryAddress?.regencyCode || null,
      kecamatan: primaryAddress?.districtName || null,
      kecamatanId: primaryAddress?.districtCode || null,
      kelurahan: primaryAddress?.villageName || null,
      kelurahanId: primaryAddress?.villageCode || null,
      addressDetail: primaryAddress
        ? {
            id: primaryAddress.id,
            type: primaryAddress.type,
            provinceCode: primaryAddress.provinceCode,
            provinceName: primaryAddress.provinceName,
            regencyCode: primaryAddress.regencyCode,
            regencyName: primaryAddress.regencyName,
            districtCode: primaryAddress.districtCode,
            districtName: primaryAddress.districtName,
            villageCode: primaryAddress.villageCode,
            villageName: primaryAddress.villageName,
            line1: primaryAddress.line1,
            fullAddress: primaryAddress.fullAddress,
            isPrimary: primaryAddress.isPrimary,
          }
        : null,
      emergencyContactName: primaryEmergency?.name || null,
      emergencyContactPhone: primaryEmergency?.phone || null,
      emergencyContactRelationship: primaryEmergency?.relationship || null,
      emergencyContactDetail: primaryEmergency
        ? {
            id: primaryEmergency.id,
            name: primaryEmergency.name,
            phone: primaryEmergency.phone,
            relationship: primaryEmergency.relationship,
            notes: primaryEmergency.notes,
          }
        : null,
      allergies: record.patientAllergies || [],
      medicalHistory: record.medicalHistorySummary || null,
      avatarUrl: record.avatarUrl || null,
      status: record.status || 'active',
      registeredAt: resolvedRegisteredAt,
      firstLoginAt: resolvedFirstLoginAt,
      lastLoginAt: resolvedLastLoginAt,
      totalAppointments: Number(record.totalAppointments ?? 0),
      completedVisits: Number(record.completedVisits ?? 0),
      missedAppointments: Number(record.missedAppointments ?? 0),
      cancelledAppointments: Number(record.cancelledAppointments ?? 0),
      lastVisitDate: record.lastVisitDate ?? null,
      isMaster: record.isMaster ?? true,
      hasOwnAccount: record.hasOwnAccount ?? Boolean(record.userId),
      affiliateCount: Number(record.affiliateCount ?? 0),
      relationshipType: record.relationshipType ?? null,
      relationLabel: record.relationLabel ?? null,
      masterPatientId: record.masterPatientId ?? null,
      masterPatientName: record.masterPatientName ?? null,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    };
  }
}
