import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  patientAddresses,
  patientAffiliations,
  patientEmergencyContacts,
  patientProfiles,
  users,
} from '../../../../database/schema';
import {
  formatBloodTypeDisplay,
  normalizeBloodTypeToDb,
} from '../../domain/data/patient-reference.data';
import { PatientEntity } from '../../domain/entities/patient.entity';
import { PatientRepository } from '../../domain/repositories/patient.repository';
import { PatientDirectoryQueryDto } from '../../presentation/dto/patient-directory-query.dto';
import {
  PatientDirectoryItemDto,
  PatientDirectoryResponseDto,
} from '../../presentation/dto/patient-directory-response.dto';
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
        gender: data.gender,
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

    const dbGender = dto.gender;
    const dbBloodType = normalizeBloodTypeToDb(dto.blood_type);

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
        user: true,
        patientAddresses: true,
        patientEmergencyContacts: true,
        patientAffiliations: {
          with: {
            user: true,
          },
        },
      },
    });

    if (!record) {
      return null;
    }

    // 1. Authoritative appointment statistics aggregation
    const apptStats = await this.db
      .select({
        totalAppointments: sql<number>`COALESCE(COUNT(${appointments.id}), 0)::int`,
        completedVisits: sql<number>`COALESCE(COUNT(CASE WHEN ${appointments.status} = 'completed' THEN 1 END), 0)::int`,
        missedAppointments: sql<number>`COALESCE(COUNT(CASE WHEN ${appointments.status} IN ('no_show', 'late') THEN 1 END), 0)::int`,
        cancelledAppointments: sql<number>`COALESCE(COUNT(CASE WHEN ${appointments.status} = 'cancelled' THEN 1 END), 0)::int`,
        lastVisitDate: sql<string | null>`MAX(${appointments.scheduledDate})`,
      })
      .from(appointments)
      .where(eq(appointments.patientId, id));

    const stats = apptStats[0] || {
      totalAppointments: 0,
      completedVisits: 0,
      missedAppointments: 0,
      cancelledAppointments: 0,
      lastVisitDate: null,
    };

    // 2. Affiliation paradigm metadata resolution
    let relationshipType: string | null = null;
    let relationLabel: string | null = null;
    let masterPatientId: string | null = null;
    let masterPatientName: string | null = null;
    let isMaster = true;
    let affiliateCount = 0;

    // Check if this patient is registered as an affiliate under a master account
    const affiliationAsChild = await this.db
      .select({
        userId: patientAffiliations.userId,
        relationshipType: patientAffiliations.relationshipType,
        relationLabel: patientAffiliations.relationLabel,
      })
      .from(patientAffiliations)
      .where(
        and(
          eq(patientAffiliations.patientId, id),
          ne(patientAffiliations.relationshipType, 'self'),
        ),
      )
      .limit(1);

    if (affiliationAsChild.length > 0) {
      const aff = affiliationAsChild[0];
      relationshipType = aff.relationshipType;
      relationLabel = aff.relationLabel;

      const masterProfile = await this.db
        .select({
          id: patientProfiles.id,
          fullName: patientProfiles.fullName,
        })
        .from(patientProfiles)
        .where(
          and(
            eq(patientProfiles.userId, aff.userId),
            ne(patientProfiles.id, id),
          ),
        )
        .limit(1);

      if (masterProfile.length > 0) {
        masterPatientId = masterProfile[0].id;
        masterPatientName = masterProfile[0].fullName;
        isMaster = false;
      }
    }

    // Check if this patient acts as master and has affiliates
    if (record.userId) {
      const affCountRes = await this.db
        .select({
          count: sql<number>`COUNT(*)::int`,
        })
        .from(patientAffiliations)
        .where(
          and(
            eq(patientAffiliations.userId, record.userId),
            ne(patientAffiliations.patientId, id),
          ),
        );
      affiliateCount = affCountRes[0]?.count ?? 0;
      if (affiliateCount > 0) {
        isMaster = true;
      }
    }

    return this.mapRecordToEntity({
      ...record,
      totalAppointments: stats.totalAppointments,
      completedVisits: stats.completedVisits,
      missedAppointments: stats.missedAppointments,
      cancelledAppointments: stats.cancelledAppointments,
      lastVisitDate: stats.lastVisitDate,
      isMaster,
      hasOwnAccount: Boolean(record.userId),
      affiliateCount,
      relationshipType,
      relationLabel,
      masterPatientId,
      masterPatientName,
    });
  }

  async findByUserId(userId: string): Promise<PatientEntity | null> {
    const record = await this.db.query.patientProfiles.findFirst({
      where: eq(patientProfiles.userId, userId),
      with: {
        user: true,
        patientAddresses: true,
        patientEmergencyContacts: true,
        patientAffiliations: {
          with: {
            user: true,
          },
        },
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
        user: true,
        patientAddresses: true,
        patientEmergencyContacts: true,
        patientAffiliations: {
          with: {
            user: true,
          },
        },
      },
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findByRecordNumber(rm: string): Promise<PatientEntity | null> {
    const record = await this.db.query.patientProfiles.findFirst({
      where: eq(patientProfiles.medicalRecordNumber, rm),
      with: {
        user: true,
        patientAddresses: true,
        patientEmergencyContacts: true,
        patientAffiliations: {
          with: {
            user: true,
          },
        },
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
        user: true,
        patientAddresses: true,
        patientEmergencyContacts: true,
        patientAffiliations: {
          with: {
            user: true,
          },
        },
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
      updateValues.gender = d.gender;
    }

    const bloodType = d.bloodType ?? d.blood_type;
    if (bloodType !== undefined) {
      updateValues.bloodType = normalizeBloodTypeToDb(bloodType);
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

  async findDirectory(
    query: PatientDirectoryQueryDto,
  ): Promise<PatientDirectoryResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;

    const hasFilterOrSearch = Boolean(
      query.search?.trim() ||
        (query.gender && query.gender !== 'all') ||
        (query.status && query.status !== 'active' && query.status !== 'all') ||
        (query.bloodType && query.bloodType !== 'all') ||
        (query.profileType && query.profileType !== 'all') ||
        query.email?.trim() ||
        query.birthDateFrom?.trim() ||
        query.birthDateTo?.trim(),
    );

    const isMasterCondition = sql`(
      EXISTS (
        SELECT 1 FROM patient_affiliations pa
        WHERE pa.patient_id = ${patientProfiles.id}
          AND (pa.relationship_type = 'self' OR pa.is_primary = true)
      )
      OR NOT EXISTS (
        SELECT 1 FROM patient_affiliations pa
        WHERE pa.patient_id = ${patientProfiles.id}
      )
    )`;

    const conditions = [];

    if (!hasFilterOrSearch) {
      // Mode Browsing Default: Tampilkan baris akun utama (master/mandiri) sebagai pohon hierarki
      conditions.push(isMasterCondition);
    } else if (query.profileType && query.profileType !== 'all') {
      if (query.profileType === 'master') {
        conditions.push(isMasterCondition);
      } else if (query.profileType === 'affiliate') {
        conditions.push(sql`NOT (${isMasterCondition})`);
      }
    }

    if (query.status && query.status !== 'all') {
      conditions.push(eq(patientProfiles.status, query.status as any));
    }

    if (query.gender && query.gender !== 'all') {
      conditions.push(eq(patientProfiles.gender, query.gender));
    }

    if (query.bloodType && query.bloodType !== 'all') {
      const normalizedBlood = normalizeBloodTypeToDb(query.bloodType);
      conditions.push(eq(patientProfiles.bloodType, normalizedBlood));
    }

    if (query.email?.trim()) {
      const emailTerm = `%${escapeLike(query.email.trim())}%`;
      conditions.push(
        or(
          ilike(patientProfiles.email, emailTerm),
          sql`EXISTS (SELECT 1 FROM users WHERE users.id = ${patientProfiles.userId} AND users.email ILIKE ${emailTerm})`,
        )!,
      );
    }

    if (query.birthDateFrom?.trim()) {
      conditions.push(
        gte(patientProfiles.birthDate, query.birthDateFrom.trim()),
      );
    }
    if (query.birthDateTo?.trim()) {
      conditions.push(lte(patientProfiles.birthDate, query.birthDateTo.trim()));
    }

    if (query.search?.trim()) {
      const term = `%${escapeLike(query.search.trim())}%`;
      conditions.push(
        or(
          ilike(patientProfiles.fullName, term),
          ilike(patientProfiles.medicalRecordNumber, term),
          ilike(patientProfiles.phone, term),
          ilike(patientProfiles.nationalIdHash, term),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(patientProfiles)
      .where(whereClause);

    const total = countRow?.count ?? 0;
    const totalPages = Math.ceil(total / limit);

    const [summaryRow] = await this.db
      .select({
        totalPatients: sql<number>`count(DISTINCT ${patientProfiles.id})::int`,
        totalAppointments: sql<number>`count(${appointments.id})::int`,
        totalCompletedVisits: sql<number>`count(CASE WHEN ${appointments.status} = 'completed' THEN 1 END)::int`,
        totalMissedOrCancelled: sql<number>`count(CASE WHEN ${appointments.status} IN ('no_show', 'late', 'cancelled') THEN 1 END)::int`,
      })
      .from(patientProfiles)
      .leftJoin(appointments, eq(appointments.patientId, patientProfiles.id))
      .where(eq(patientProfiles.status, 'active'));

    const summary = {
      totalPatients: summaryRow?.totalPatients ?? 0,
      totalAppointments: summaryRow?.totalAppointments ?? 0,
      totalCompletedVisits: summaryRow?.totalCompletedVisits ?? 0,
      totalMissedOrCancelled: summaryRow?.totalMissedOrCancelled ?? 0,
    };

    if (total === 0) {
      return {
        data: [],
        meta: { total: 0, page, limit, totalPages: 0 },
        summary,
      };
    }

    const sortWhitelist: Record<string, any> = {
      name: patientProfiles.fullName,
      medicalRecordNumber: patientProfiles.medicalRecordNumber,
      birthDate: patientProfiles.birthDate,
      registeredAt: patientProfiles.registeredAt,
      status: patientProfiles.status,
      createdAt: patientProfiles.createdAt,
    };

    let sortCol = patientProfiles.createdAt;
    let sortDir: 'asc' | 'desc' = 'desc';

    if (query.sort?.trim()) {
      const [key, dir] = query.sort.trim().split(':');
      if (sortWhitelist[key]) {
        sortCol = sortWhitelist[key];
        if (dir === 'asc' || dir === 'desc') {
          sortDir = dir;
        }
      }
    }

    const orderClauses = [
      sortDir === 'asc' ? asc(sortCol) : desc(sortCol),
      asc(patientProfiles.id),
    ];

    const rows = await this.db
      .select({
        id: patientProfiles.id,
        userId: patientProfiles.userId,
        avatarUrl: patientProfiles.avatarUrl,
        userAvatarUrl: sql<string | null>`(
          SELECT avatar_url FROM users WHERE users.id = ${patientProfiles.userId}
        )`,
        masterUserId: sql<string | null>`(
          SELECT pa.user_id FROM patient_affiliations pa
          WHERE pa.patient_id = patient_profiles.id
          ORDER BY pa.is_primary DESC, pa.created_at DESC
          LIMIT 1
        )`,
        masterUserAvatarUrl: sql<string | null>`(
          SELECT u.avatar_url FROM patient_affiliations pa
          JOIN users u ON u.id = pa.user_id
          WHERE pa.patient_id = patient_profiles.id
          ORDER BY pa.is_primary DESC, pa.created_at DESC
          LIMIT 1
        )`,
        emailUserAvatarUrl: sql<string | null>`(
          SELECT avatar_url FROM users WHERE users.email = ${patientProfiles.email} LIMIT 1
        )`,
        emailUserId: sql<string | null>`(
          SELECT id FROM users WHERE users.email = ${patientProfiles.email} LIMIT 1
        )`,
        medicalRecordNumber: patientProfiles.medicalRecordNumber,
        fullName: patientProfiles.fullName,
        nationalIdHash: patientProfiles.nationalIdHash,
        nationalIdEncrypted: patientProfiles.nationalIdEncrypted,
        gender: patientProfiles.gender,
        birthDate: patientProfiles.birthDate,
        birthPlace: patientProfiles.birthPlace,
        motherName: patientProfiles.motherName,
        occupation: patientProfiles.occupation,
        bloodType: patientProfiles.bloodType,
        phone: patientProfiles.phone,
        status: patientProfiles.status,
        registeredAt: patientProfiles.registeredAt,
        email: sql<
          string | null
        >`COALESCE(${patientProfiles.email}, (SELECT email FROM users WHERE users.id = patient_profiles.user_id))`,
        fullAddress: sql<string | null>`(
          SELECT COALESCE(full_address, line1)
          FROM patient_addresses
          WHERE patient_addresses.patient_id = patient_profiles.id
          ORDER BY is_primary DESC, created_at DESC
          LIMIT 1
        )`,
        totalAppointments: sql<number>`(
          SELECT count(*)::int
          FROM appointments
          WHERE appointments.patient_id = patient_profiles.id
        )`,
        completedVisits: sql<number>`(
          SELECT count(*)::int
          FROM appointments
          WHERE appointments.patient_id = patient_profiles.id AND appointments.status = 'completed'
        )`,
        missedAppointments: sql<number>`(
          SELECT count(*)::int
          FROM appointments
          WHERE appointments.patient_id = patient_profiles.id AND appointments.status IN ('no_show', 'late')
        )`,
        cancelledAppointments: sql<number>`(
          SELECT count(*)::int
          FROM appointments
          WHERE appointments.patient_id = patient_profiles.id AND appointments.status = 'cancelled'
        )`,
        lastVisitDate: sql<string | null>`(
          SELECT max(scheduled_date)::text
          FROM appointments
          WHERE appointments.patient_id = patient_profiles.id
        )`,
        isAffiliateChild: sql<boolean>`EXISTS (
          SELECT 1 FROM patient_affiliations pa
          WHERE pa.patient_id = patient_profiles.id
            AND pa.relationship_type != 'self'
            AND pa.is_primary = false
        )`,
        relType: sql<string | null>`(
          SELECT relationship_type::text FROM patient_affiliations pa
          WHERE pa.patient_id = patient_profiles.id
          ORDER BY is_primary DESC, created_at DESC
          LIMIT 1
        )`,
        relLabel: sql<string | null>`(
          SELECT relation_label FROM patient_affiliations pa
          WHERE pa.patient_id = patient_profiles.id
          ORDER BY is_primary DESC, created_at DESC
          LIMIT 1
        )`,
        masterPatientId: sql<string | null>`(
          SELECT mp.id FROM patient_affiliations pa
          JOIN patient_affiliations mpa ON mpa.user_id = pa.user_id AND (mpa.relationship_type = 'self' OR mpa.is_primary = true)
          JOIN patient_profiles mp ON mp.id = mpa.patient_id
          WHERE pa.patient_id = patient_profiles.id AND pa.relationship_type != 'self'
          LIMIT 1
        )`,
        masterPatientName: sql<string | null>`(
          SELECT mp.full_name FROM patient_affiliations pa
          JOIN patient_affiliations mpa ON mpa.user_id = pa.user_id AND (mpa.relationship_type = 'self' OR mpa.is_primary = true)
          JOIN patient_profiles mp ON mp.id = mpa.patient_id
          WHERE pa.patient_id = patient_profiles.id AND pa.relationship_type != 'self'
          LIMIT 1
        )`,
        affCount: sql<number>`(
          SELECT count(*)::int FROM patient_affiliations pa
          WHERE pa.user_id = patient_profiles.user_id AND pa.patient_id != patient_profiles.id
        )`,
      })
      .from(patientProfiles)
      .where(whereClause)
      .orderBy(...orderClauses)
      .limit(limit)
      .offset(offset);

    const now = new Date();
    const mapRowToItem = (
      r: any,
      isMaster: boolean,
      masterPatientId?: string | null,
      masterPatientName?: string | null,
      relType?: string | null,
      relLabel?: string | null,
    ): PatientDirectoryItemDto => {
      const birth = new Date(r.birthDate);
      let age = now.getFullYear() - birth.getFullYear();
      const monthDiff = now.getMonth() - birth.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && now.getDate() < birth.getDate())
      ) {
        age--;
      }
      if (isNaN(age) || age < 0) age = 0;

      const rawNik = r.nationalIdHash || r.nationalIdEncrypted || null;
      let maskedNik: string | null = null;
      if (rawNik && rawNik.length >= 8) {
        maskedNik = `${rawNik.slice(0, 4)}********${rawNik.slice(-4)}`;
      } else if (rawNik) {
        maskedNik = '********';
      }

      const resolvedUserId =
        r.userId || r.masterUserId || r.emailUserId || null;
      const resolvedDirectAvatar =
        r.avatarUrl ||
        r.userAvatarUrl ||
        r.masterUserAvatar ||
        r.masterUserAvatarUrl ||
        r.emailUserAvatar ||
        r.emailUserAvatarUrl ||
        null;
      const finalAvatarUrl =
        resolvedDirectAvatar ||
        (resolvedUserId ? `/api/v1/users/${resolvedUserId}/avatar` : null);

      return {
        id: r.id,
        avatarUrl: finalAvatarUrl,
        medicalRecordNumber: r.medicalRecordNumber,
        fullName: r.fullName,
        maskedNik,
        gender: r.gender as 'male' | 'female',
        birthDate: r.birthDate,
        birthPlace: r.birthPlace || null,
        motherName: r.motherName || null,
        occupation: r.occupation || null,
        age,
        bloodType: formatBloodTypeDisplay(r.bloodType),
        email: r.email || null,
        phone: r.phone,
        fullAddress: r.fullAddress,
        status: r.status,
        isMaster,
        hasOwnAccount: Boolean(r.hasOwnAccount ?? r.userId),
        affiliateCount: 0,
        relationshipType:
          relType || r.relationshipType || (isMaster ? 'self' : null),
        relationLabel:
          relLabel || r.relationLabel || (isMaster ? 'Akun Utama' : null),
        masterPatientId: masterPatientId || null,
        masterPatientName: masterPatientName || null,
        totalAppointments: r.totalAppointments ?? 0,
        completedVisits: r.completedVisits ?? 0,
        missedAppointments: r.missedAppointments ?? 0,
        cancelledAppointments: r.cancelledAppointments ?? 0,
        lastVisitDate: r.lastVisitDate,
        registeredAt: r.registeredAt,
        affiliates: [],
      };
    };

    let data: PatientDirectoryItemDto[];

    if (!hasFilterOrSearch) {
      // MODE A: Browsing Default -> Hierarkis (Akun Utama dengan nested affiliates)
      const userIds = rows
        .map((r) => r.userId)
        .filter((uid): uid is string => Boolean(uid));

      const affiliatesMap = new Map<string, any[]>();
      if (userIds.length > 0) {
        const rawAffiliates = await this.db
          .select({
            id: patientProfiles.id,
            masterUserId: patientAffiliations.userId,
            avatarUrl: patientProfiles.avatarUrl,
            masterUserAvatar: sql<string | null>`(
              SELECT avatar_url FROM users WHERE users.id = ${patientAffiliations.userId}
            )`,
            emailUserAvatar: sql<string | null>`(
              SELECT avatar_url FROM users WHERE users.email = ${patientProfiles.email} LIMIT 1
            )`,
            emailUserId: sql<string | null>`(
              SELECT id FROM users WHERE users.email = ${patientProfiles.email} LIMIT 1
            )`,
            medicalRecordNumber: patientProfiles.medicalRecordNumber,
            fullName: patientProfiles.fullName,
            nationalIdHash: patientProfiles.nationalIdHash,
            nationalIdEncrypted: patientProfiles.nationalIdEncrypted,
            gender: patientProfiles.gender,
            birthDate: patientProfiles.birthDate,
            birthPlace: patientProfiles.birthPlace,
            motherName: patientProfiles.motherName,
            occupation: patientProfiles.occupation,
            bloodType: patientProfiles.bloodType,
            phone: patientProfiles.phone,
            status: patientProfiles.status,
            registeredAt: patientProfiles.registeredAt,
            email: sql<
              string | null
            >`COALESCE(${patientProfiles.email}, (SELECT email FROM users WHERE users.id = patient_profiles.user_id))`,
            relationshipType: patientAffiliations.relationshipType,
            relationLabel: patientAffiliations.relationLabel,
            hasOwnAccount: sql<boolean>`${patientProfiles.userId} IS NOT NULL`,
            fullAddress: sql<string | null>`(
              SELECT COALESCE(full_address, line1)
              FROM patient_addresses
              WHERE patient_addresses.patient_id = patient_profiles.id
              ORDER BY is_primary DESC, created_at DESC
              LIMIT 1
            )`,
            totalAppointments: sql<number>`(
              SELECT count(*)::int
              FROM appointments
              WHERE appointments.patient_id = patient_profiles.id
            )`,
            completedVisits: sql<number>`(
              SELECT count(*)::int
              FROM appointments
              WHERE appointments.patient_id = patient_profiles.id AND appointments.status = 'completed'
            )`,
            missedAppointments: sql<number>`(
              SELECT count(*)::int
              FROM appointments
              WHERE appointments.patient_id = patient_profiles.id AND appointments.status IN ('no_show', 'late')
            )`,
            cancelledAppointments: sql<number>`(
              SELECT count(*)::int
              FROM appointments
              WHERE appointments.patient_id = patient_profiles.id AND appointments.status = 'cancelled'
            )`,
            lastVisitDate: sql<string | null>`(
              SELECT max(scheduled_date)::text
              FROM appointments
              WHERE appointments.patient_id = patient_profiles.id
            )`,
          })
          .from(patientAffiliations)
          .innerJoin(
            patientProfiles,
            eq(patientProfiles.id, patientAffiliations.patientId),
          )
          .where(
            and(
              inArray(patientAffiliations.userId, userIds),
              sql`${patientAffiliations.patientId} != (SELECT pa2.patient_id FROM patient_affiliations pa2 WHERE pa2.user_id = patient_affiliations.user_id AND (pa2.relationship_type = 'self' OR pa2.is_primary = true) LIMIT 1)`,
            ),
          )
          .orderBy(patientAffiliations.createdAt);

        for (const aff of rawAffiliates) {
          const list = affiliatesMap.get(aff.masterUserId) || [];
          list.push(aff);
          affiliatesMap.set(aff.masterUserId, list);
        }
      }

      data = rows.map((r) => {
        const masterAffiliatesRaw = r.userId
          ? affiliatesMap.get(r.userId) || []
          : [];
        const mappedAffiliates = masterAffiliatesRaw.map((aff) =>
          mapRowToItem(
            aff,
            false,
            r.id,
            r.fullName,
            aff.relationshipType,
            aff.relationLabel,
          ),
        );

        const masterItem = mapRowToItem(r, true);
        masterItem.affiliateCount = mappedAffiliates.length;
        masterItem.affiliates = mappedAffiliates;
        return masterItem;
      });
    } else {
      // MODE B: Search / Filter Aktif -> 100% Flat Agnostic
      data = rows.map((r) => {
        const isChild = Boolean(r.isAffiliateChild);
        if (isChild) {
          return mapRowToItem(
            r,
            false,
            r.masterPatientId,
            r.masterPatientName,
            r.relType,
            r.relLabel,
          );
        }
        const masterItem = mapRowToItem(r, true);
        masterItem.affiliateCount = r.affCount ?? 0;
        masterItem.affiliates = [];
        return masterItem;
      });
    }

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
      summary,
    };
  }

  async delete(id: string): Promise<boolean> {
    await this.db
      .update(patientProfiles)
      .set({ status: 'inactive', updatedAt: new Date().toISOString() })
      .where(eq(patientProfiles.id, id));

    return true;
  }

  async bulkDelete(ids: string[]): Promise<{ count: number }> {
    if (!ids || ids.length === 0) {
      return { count: 0 };
    }

    const updated = await this.db
      .update(patientProfiles)
      .set({ status: 'inactive', updatedAt: new Date().toISOString() })
      .where(inArray(patientProfiles.id, ids))
      .returning({ id: patientProfiles.id });

    return { count: updated.length };
  }
}
