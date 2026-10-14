import { sql } from 'drizzle-orm';
import { patientProfiles, users } from '../../../database/schema';
import { defineCatalog } from '../catalog.types';

export const patientsCatalog = defineCatalog({
  key: 'patients',
  table: patientProfiles,
  id: patientProfiles.id,
  select: {
    id: patientProfiles.id,
    userId: patientProfiles.userId,
    medicalRecordNumber: patientProfiles.medicalRecordNumber,
    fullName: patientProfiles.fullName,
    nationalIdHash: patientProfiles.nationalIdHash,
    nationalIdEncrypted: patientProfiles.nationalIdEncrypted,
    motherName: patientProfiles.motherName,
    birthPlace: patientProfiles.birthPlace,
    birthDate: patientProfiles.birthDate,
    gender: patientProfiles.gender,
    bloodType: patientProfiles.bloodType,
    occupation: patientProfiles.occupation,
    phone: patientProfiles.phone,
    email: sql<string | null>`COALESCE(${patientProfiles.email}, (SELECT email FROM users WHERE users.id = ${patientProfiles.userId}))`,
    status: patientProfiles.status,
    registeredAt: patientProfiles.registeredAt,
    firstLoginAt: patientProfiles.firstLoginAt,
    lastVisitAt: patientProfiles.lastVisitAt,
    visitCount: patientProfiles.visitCount,
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
  },
  search: {
    minLength: 2,
    fields: [
      { column: patientProfiles.fullName, kind: 'text', weight: 3 },
      { column: patientProfiles.medicalRecordNumber, kind: 'prefix', weight: 3 },
      { column: patientProfiles.phone, kind: 'prefix', weight: 2 },
      { column: patientProfiles.nationalIdHash, kind: 'prefix', weight: 2 },
      { column: patientProfiles.email, kind: 'text', weight: 1 },
    ],
  },
  filters: {
    gender: {
      type: 'enum',
      column: patientProfiles.gender,
      values: ['male', 'female'] as const,
    },
    status: {
      type: 'enum',
      column: patientProfiles.status,
      values: ['active', 'inactive'] as const,
    },
    bloodType: {
      type: 'enum',
      column: patientProfiles.bloodType,
      values: ['a', 'b', 'ab', 'o', 'unknown'] as const,
    },
    birthDate: {
      type: 'dateRange',
      column: patientProfiles.birthDate,
    },
    registeredAt: {
      type: 'dateRange',
      column: patientProfiles.registeredAt,
    },
  },
  sorts: {
    name: patientProfiles.fullName,
    medicalRecordNumber: patientProfiles.medicalRecordNumber,
    birthDate: patientProfiles.birthDate,
    registeredAt: patientProfiles.registeredAt,
    status: patientProfiles.status,
  },
  defaultSort: {
    key: 'registeredAt',
    dir: 'desc',
  },
  tiebreaker: patientProfiles.id,
  pagination: {
    defaultLimit: 30,
    maxLimit: 100,
  },
});
