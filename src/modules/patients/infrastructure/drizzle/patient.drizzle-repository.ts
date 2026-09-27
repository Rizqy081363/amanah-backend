import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { desc, eq, ilike, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  patientAddresses,
  patientEmergencyContacts,
  patientProfiles,
  users,
} from '../../../../database/schema';
import { PatientEntity } from '../../domain/entities/patient.entity';
import { PatientRepository } from '../../domain/repositories/patient.repository';
import { RegisterPatientDto } from '../../presentation/dto/register-patient.dto';
import { PatientRecordMapper } from './patient-record.mapper';

@Injectable()
export class PatientDrizzleRepository implements PatientRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapRecordToEntity(record: any): PatientEntity {
    return PatientRecordMapper.toEntity(record);
  }

  async create(
    data: Omit<PatientEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PatientEntity> {
    const rmNumber =
      data.medicalRecordNumber ||
      `RM-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    const [record] = await this.db
      .insert(patientProfiles)
      .values({
        userId: data.userId || null,
        medicalRecordNumber: rmNumber,
        nationalIdEncrypted: data.nik,
        nationalIdHash: data.nik,
        fullName: data.fullName,
        gender: data.gender === 'Perempuan' ? 'female' : 'male',
        birthPlace: data.birthPlace,
        birthDate: data.birthDate,
        bloodType: 'unknown',
        phone: data.phoneNumber,
        motherName: data.namaIbuKandung || null,
        occupation: data.pekerjaan || null,
        medicalHistorySummary: data.medicalHistory || null,
        avatarUrl: data.avatarUrl || null,
        status: 'active',
      })
      .returning();

    if (data.address) {
      await this.db.insert(patientAddresses).values({
        patientId: record.id,
        type: 'domicile',
        line1: data.alamatDetail || data.address,
        fullAddress: data.address,
        provinceCode: data.provinsiId || null,
        provinceName: data.provinsi || null,
        regencyCode: data.kabupatenId || null,
        regencyName: data.kabupaten || null,
        districtCode: data.kecamatanId || null,
        districtName: data.kecamatan || null,
        villageCode: data.kelurahanId || null,
        villageName: data.kelurahan || null,
        isPrimary: true,
      });
    }

    if (data.emergencyContactPhone) {
      await this.db.insert(patientEmergencyContacts).values({
        patientId: record.id,
        name: data.emergencyContactName || null,
        phone: data.emergencyContactPhone,
        relationship: data.emergencyContactRelationship || null,
      });
    }

    return this.findById(record.id) as Promise<PatientEntity>;
  }

  async register(
    userId: string,
    dto: RegisterPatientDto,
  ): Promise<PatientEntity> {
    const existingForUser = await this.findByUserId(userId);
    if (existingForUser) {
      throw new ConflictException({
        code: 'PATIENT_ALREADY_REGISTERED',
        message: 'Akun Anda sudah memiliki profil pasien terdaftar.',
      });
    }

    const existingNik = await this.findByNik(dto.nik);
    if (existingNik) {
      throw new ConflictException({
        code: 'DUPLICATE_NIK',
        message: 'NIK ini sudah terdaftar pada rekam medis pasien lain.',
      });
    }

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
      if (!isNaN(lastSeq)) {
        nextSequence = lastSeq + 1;
      }
    }
    const rmNumber = `${prefix}${String(nextSequence).padStart(4, '0')}`;

    const dbGender = dto.gender === 'Perempuan' ? 'female' : 'male';
    const bloodTypeMap: Record<string, 'a' | 'b' | 'ab' | 'o' | 'unknown'> = {
      A: 'a',
      B: 'b',
      AB: 'ab',
      O: 'o',
      'Belum Tahu': 'unknown',
    };
    const dbBloodType = bloodTypeMap[dto.blood_type] || 'unknown';

    let phoneToUse = dto.phone?.trim() || '';
    if (!phoneToUse) {
      const userRecord = await this.db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      phoneToUse = userRecord?.phone || '';
    }

    const fullAddress = `${dto.alamat_detail}, Kel. ${dto.kelurahan}, Kec. ${dto.kecamatan}, ${dto.kabupaten}, Prov. ${dto.provinsi}`;

    const [record] = await this.db
      .insert(patientProfiles)
      .values({
        userId,
        medicalRecordNumber: rmNumber,
        nationalIdEncrypted: dto.nik,
        nationalIdHash: dto.nik,
        fullName: dto.name.trim(),
        gender: dbGender,
        birthPlace: dto.tempat_lahir.trim(),
        birthDate: dto.birth_date,
        bloodType: dbBloodType,
        phone: phoneToUse,
        motherName: dto.nama_ibu_kandung.trim(),
        occupation: dto.pekerjaan.trim(),
        status: 'active',
        registeredAt: new Date().toISOString(),
        firstLoginAt: new Date().toISOString(),
      })
      .returning();

    await this.db.insert(patientAddresses).values({
      patientId: record.id,
      type: 'domicile',
      provinceCode: dto.provinsi_id,
      provinceName: dto.provinsi,
      regencyCode: dto.kabupaten_id,
      regencyName: dto.kabupaten,
      districtCode: dto.kecamatan_id,
      districtName: dto.kecamatan,
      villageCode: dto.kelurahan_id,
      villageName: dto.kelurahan,
      line1: dto.alamat_detail.trim(),
      fullAddress,
      isPrimary: true,
    });

    const result = await this.findById(record.id);
    return result!;
  }

  async findById(id: string): Promise<PatientEntity | null> {
    const record = await this.db.query.patientProfiles.findFirst({
      where: eq(patientProfiles.id, id),
      with: {
        patientAddresses: true,
        patientEmergencyContacts: true,
      },
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findByUserId(userId: string): Promise<PatientEntity | null> {
    const record = await this.db.query.patientProfiles.findFirst({
      where: eq(patientProfiles.userId, userId),
      with: {
        patientAddresses: true,
        patientEmergencyContacts: true,
      },
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findByNik(nik: string): Promise<PatientEntity | null> {
    const record = await this.db.query.patientProfiles.findFirst({
      where: or(
        eq(patientProfiles.nationalIdEncrypted, nik),
        eq(patientProfiles.nationalIdHash, nik),
      ),
      with: {
        patientAddresses: true,
        patientEmergencyContacts: true,
      },
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findByRecordNumber(rm: string): Promise<PatientEntity | null> {
    const record = await this.db.query.patientProfiles.findFirst({
      where: eq(patientProfiles.medicalRecordNumber, rm),
      with: {
        patientAddresses: true,
        patientEmergencyContacts: true,
      },
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findMany(
    limit = 20,
    offset = 0,
    search?: string,
  ): Promise<PatientEntity[]> {
    let whereClause = eq(patientProfiles.status, 'active');
    if (search?.trim()) {
      whereClause = or(
        ilike(patientProfiles.fullName, `%${search.trim()}%`),
        ilike(patientProfiles.medicalRecordNumber, `%${search.trim()}%`),
      ) as any;
    }

    const records = await this.db.query.patientProfiles.findMany({
      where: whereClause,
      limit,
      offset,
      orderBy: [desc(patientProfiles.createdAt), desc(patientProfiles.id)],
      with: {
        patientAddresses: true,
        patientEmergencyContacts: true,
      },
    });
    return records.map((r) => this.mapRecordToEntity(r));
  }

  async update(
    id: string,
    data: Partial<PatientEntity> | Record<string, any>,
  ): Promise<PatientEntity | null> {
    const d = data as Record<string, any>;
    const existing = await this.db.query.patientProfiles.findFirst({
      where: eq(patientProfiles.id, id),
    });
    if (!existing) {
      return null;
    }

    const updateValues: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    const fullName = d.fullName ?? d.name;
    if (fullName !== undefined) updateValues.fullName = fullName.trim();

    const phone = d.phoneNumber ?? d.phone;
    if (phone !== undefined) updateValues.phone = phone.trim();

    const motherName = d.namaIbuKandung ?? d.nama_ibu_kandung;
    if (motherName !== undefined) updateValues.motherName = motherName.trim();

    const birthPlace = d.birthPlace ?? d.tempat_lahir;
    if (birthPlace !== undefined) updateValues.birthPlace = birthPlace.trim();

    const birthDate = d.birthDate ?? d.birth_date;
    if (birthDate !== undefined) updateValues.birthDate = birthDate;

    if (d.gender !== undefined) {
      updateValues.gender = d.gender === 'Perempuan' ? 'female' : 'male';
    }

    const bloodType = d.bloodType ?? d.blood_type;
    if (bloodType !== undefined) {
      const bloodTypeMap: Record<string, 'a' | 'b' | 'ab' | 'o' | 'unknown'> = {
        A: 'a',
        B: 'b',
        AB: 'ab',
        O: 'o',
        'Belum Tahu': 'unknown',
      };
      updateValues.bloodType = bloodTypeMap[bloodType] || 'unknown';
    }

    if (d.pekerjaan !== undefined) updateValues.occupation = d.pekerjaan.trim();
    if (d.medicalHistory !== undefined)
      updateValues.medicalHistorySummary = d.medicalHistory;
    if (d.avatarUrl !== undefined) updateValues.avatarUrl = d.avatarUrl;
    if (d.status !== undefined) updateValues.status = d.status;

    if (d.nik !== undefined && d.nik.trim() !== '') {
      const cleanNik = d.nik.trim();
      if (
        cleanNik !== existing.nationalIdEncrypted &&
        cleanNik !== existing.nationalIdHash
      ) {
        const duplicateNik = await this.findByNik(cleanNik);
        if (duplicateNik && duplicateNik.id !== id) {
          throw new ConflictException({
            code: 'DUPLICATE_NIK',
            message: 'NIK ini sudah terdaftar pada rekam medis pasien lain.',
          });
        }
        updateValues.nationalIdEncrypted = cleanNik;
        updateValues.nationalIdHash = cleanNik;
      }
    }

    if (Object.keys(updateValues).length > 1) {
      await this.db
        .update(patientProfiles)
        .set(updateValues)
        .where(eq(patientProfiles.id, id));
    }

    // Address handling
    const alamatDetail = d.alamatDetail ?? d.alamat_detail;
    const provinsi = d.provinsi;
    const provinsiId = d.provinsiId ?? d.provinsi_id;
    const kabupaten = d.kabupaten;
    const kabupatenId = d.kabupatenId ?? d.kabupaten_id;
    const kecamatan = d.kecamatan;
    const kecamatanId = d.kecamatanId ?? d.kecamatan_id;
    const kelurahan = d.kelurahan;
    const kelurahanId = d.kelurahanId ?? d.kelurahan_id;
    const address = d.address;

    const hasAddressUpdate =
      alamatDetail !== undefined ||
      provinsi !== undefined ||
      provinsiId !== undefined ||
      kabupaten !== undefined ||
      kabupatenId !== undefined ||
      kecamatan !== undefined ||
      kecamatanId !== undefined ||
      kelurahan !== undefined ||
      kelurahanId !== undefined ||
      address !== undefined;

    if (hasAddressUpdate) {
      const existingAddress = await this.db.query.patientAddresses.findFirst({
        where: eq(patientAddresses.patientId, id),
      });

      const line1ToUse = (
        alamatDetail ??
        existingAddress?.line1 ??
        address ??
        ''
      ).trim();

      const provNameToUse = provinsi ?? existingAddress?.provinceName ?? '';
      const provCodeToUse = provinsiId ?? existingAddress?.provinceCode ?? null;
      const regNameToUse = kabupaten ?? existingAddress?.regencyName ?? '';
      const regCodeToUse = kabupatenId ?? existingAddress?.regencyCode ?? null;
      const distNameToUse = kecamatan ?? existingAddress?.districtName ?? '';
      const distCodeToUse =
        kecamatanId ?? existingAddress?.districtCode ?? null;
      const villNameToUse = kelurahan ?? existingAddress?.villageName ?? '';
      const villCodeToUse = kelurahanId ?? existingAddress?.villageCode ?? null;

      let fullAddressToUse = address?.trim() || '';
      if (!fullAddressToUse && (line1ToUse || provNameToUse || regNameToUse)) {
        const parts = [
          line1ToUse,
          villNameToUse ? `Kel. ${villNameToUse}` : '',
          distNameToUse ? `Kec. ${distNameToUse}` : '',
          regNameToUse,
          provNameToUse ? `Prov. ${provNameToUse}` : '',
        ].filter(Boolean);
        fullAddressToUse = parts.join(', ');
      }
      if (!fullAddressToUse && existingAddress?.fullAddress) {
        fullAddressToUse = existingAddress.fullAddress;
      }

      if (existingAddress) {
        await this.db
          .update(patientAddresses)
          .set({
            line1: line1ToUse || existingAddress.line1,
            fullAddress: fullAddressToUse || existingAddress.fullAddress,
            provinceCode: provCodeToUse,
            provinceName: provNameToUse || null,
            regencyCode: regCodeToUse,
            regencyName: regNameToUse || null,
            districtCode: distCodeToUse,
            districtName: distNameToUse || null,
            villageCode: villCodeToUse,
            villageName: villNameToUse || null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(patientAddresses.id, existingAddress.id));
      } else if (line1ToUse && fullAddressToUse) {
        await this.db.insert(patientAddresses).values({
          patientId: id,
          type: 'domicile',
          line1: line1ToUse,
          fullAddress: fullAddressToUse,
          provinceCode: provCodeToUse,
          provinceName: provNameToUse || null,
          regencyCode: regCodeToUse,
          regencyName: regNameToUse || null,
          districtCode: distCodeToUse,
          districtName: distNameToUse || null,
          villageCode: villCodeToUse,
          villageName: villNameToUse || null,
          isPrimary: true,
        });
      }
    }

    // Emergency contact handling
    const emergencyName = d.emergencyContactName ?? d.nama_kontak_darurat;
    const emergencyPhone = d.emergencyContactPhone ?? d.nomor_kontak_darurat;
    const emergencyRel =
      d.emergencyContactRelationship ?? d.hubungan_kontak_darurat;

    if (
      emergencyPhone !== undefined ||
      emergencyName !== undefined ||
      emergencyRel !== undefined
    ) {
      const existingContact =
        await this.db.query.patientEmergencyContacts.findFirst({
          where: eq(patientEmergencyContacts.patientId, id),
        });

      if (existingContact) {
        await this.db
          .update(patientEmergencyContacts)
          .set({
            name:
              emergencyName !== undefined
                ? emergencyName.trim()
                : existingContact.name,
            phone:
              emergencyPhone !== undefined
                ? emergencyPhone.trim()
                : existingContact.phone,
            relationship:
              emergencyRel !== undefined
                ? emergencyRel.trim()
                : existingContact.relationship,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(patientEmergencyContacts.id, existingContact.id));
      } else if (emergencyPhone && emergencyPhone.trim()) {
        await this.db.insert(patientEmergencyContacts).values({
          patientId: id,
          name: emergencyName?.trim() || null,
          phone: emergencyPhone.trim(),
          relationship: emergencyRel?.trim() || null,
        });
      }
    }

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    await this.db
      .update(patientProfiles)
      .set({ status: 'inactive', updatedAt: new Date().toISOString() })
      .where(eq(patientProfiles.id, id));

    return true;
  }
}
