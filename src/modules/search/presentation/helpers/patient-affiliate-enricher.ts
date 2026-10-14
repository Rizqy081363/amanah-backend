import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  patientAffiliations,
  patientProfiles,
  users,
} from '../../../../database/schema';

export async function enrichPatientsWithAffiliates(
  db: DrizzleDatabase,
  rows: any[],
): Promise<any[]> {
  if (!rows || rows.length === 0) {
    return [];
  }

  const userIds = rows
    .map((r) => r.userId)
    .filter((uid): uid is string => Boolean(uid));

  if (userIds.length === 0) {
    return rows.map((r) => ({
      ...r,
      isMaster: true,
      hasOwnAccount: Boolean(r.userId),
      affiliateCount: 0,
      affiliates: [],
    }));
  }

  const rawAffiliates = await (db as any)
    .select({
      id: patientProfiles.id,
      masterUserId: patientAffiliations.userId,
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
      email: sql<string | null>`COALESCE(${patientProfiles.email}, (SELECT email FROM users WHERE users.id = ${patientProfiles.userId}))`,
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
        ne(patientAffiliations.relationshipType, 'self'),
      ),
    );

  const affiliatesMap = new Map<string, any[]>();
  for (const aff of rawAffiliates) {
    if (!affiliatesMap.has(aff.masterUserId)) {
      affiliatesMap.set(aff.masterUserId, []);
    }
    affiliatesMap.get(aff.masterUserId)!.push({
      ...aff,
      isMaster: false,
      affiliateCount: 0,
      affiliates: [],
    });
  }

  return rows.map((r) => {
    const affiliates = r.userId ? affiliatesMap.get(r.userId) || [] : [];
    return {
      ...r,
      isMaster: true,
      hasOwnAccount: Boolean(r.userId),
      affiliateCount: affiliates.length,
      affiliates,
    };
  });
}
