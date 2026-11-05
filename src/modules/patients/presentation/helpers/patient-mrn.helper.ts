import { desc, ilike } from 'drizzle-orm';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { patientProfiles } from '../../../../database/schema';

export async function generateNextMedicalRecordNumber(
  db: DrizzleDatabase,
): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `RM-${year}${month}-`;

  const [latestRecord] = await db
    .select({ mrn: patientProfiles.medicalRecordNumber })
    .from(patientProfiles)
    .where(ilike(patientProfiles.medicalRecordNumber, `${prefix}%`))
    .orderBy(desc(patientProfiles.medicalRecordNumber))
    .limit(1);

  let nextSequence = 1;
  if (latestRecord?.mrn) {
    const parts = latestRecord.mrn.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(lastSeq)) {
      nextSequence = lastSeq + 1;
    }
  }
  return `${prefix}${String(nextSequence).padStart(4, '0')}`;
}
