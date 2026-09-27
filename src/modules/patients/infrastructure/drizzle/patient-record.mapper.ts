import type { PatientEntity } from '../../domain/entities/patient.entity';

export class PatientRecordMapper {
  static toEntity(record: any): PatientEntity {
    let bloodTypeDisplay = 'Belum Tahu';
    if (record.bloodType && record.bloodType !== 'unknown') {
      bloodTypeDisplay = record.bloodType.toUpperCase();
    }

    const primaryAddress =
      record.patientAddresses?.find((a: any) => a.isPrimary) ||
      record.patientAddresses?.[0];
    const primaryEmergency = record.patientEmergencyContacts?.[0];

    return {
      id: record.id,
      userId: record.userId || '',
      medicalRecordNumber: record.medicalRecordNumber,
      nik: record.nationalIdEncrypted || record.nationalIdHash || '',
      fullName: record.fullName,
      gender: record.gender === 'female' ? 'Perempuan' : 'Laki-laki',
      birthPlace: record.birthPlace || '',
      birthDate:
        typeof record.birthDate === 'string'
          ? record.birthDate
          : record.birthDate?.toISOString?.()?.slice(0, 10) || '',
      bloodType: bloodTypeDisplay,
      namaIbuKandung: record.motherName || null,
      pekerjaan: record.occupation || null,
      phoneNumber: record.phone || '',
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
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    };
  }
}
