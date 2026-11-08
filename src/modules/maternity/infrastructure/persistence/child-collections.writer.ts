import { eq, sql } from 'drizzle-orm';
import {
  maternalContraceptiveHistories,
  maternalPreviousPregnancies,
} from '../../../../database/schema/amanah.schema';
import {
  maternalHealthConditionResponses,
  maternalHusbandProfiles,
} from '../../../../database/schema/maternal.schema';
import {
  PersistContraceptiveHistoryCommand,
  PersistHealthConditionCommand,
  PersistHusbandCommand,
  PersistPreviousPregnancyCommand,
} from '../../domain/commands/maternity.commands';
import {
  mapContraceptiveHistoryRow,
  mapPreviousPregnancyRow,
} from '../drizzle/maternity-persistence.helper';

export async function syncHusbandProfile(
  tx: any,
  intakeId: string,
  husband?: PersistHusbandCommand | null,
): Promise<void> {
  if (!husband) return;
  const existing = await tx.query.maternalHusbandProfiles.findFirst({
    where: eq(maternalHusbandProfiles.maternalIntakeId, intakeId),
  });

  if (existing) {
    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    for (const [key, val] of Object.entries(husband)) {
      if (val !== undefined) patch[key] = val;
    }
    await tx
      .update(maternalHusbandProfiles)
      .set(patch)
      .where(eq(maternalHusbandProfiles.id, existing.id));
  } else if (husband.fullName) {
    await tx.insert(maternalHusbandProfiles).values({
      maternalIntakeId: intakeId,
      fullName: husband.fullName,
      nik: husband.nik || null,
      birthDate: husband.birthDate || null,
      age: husband.age || null,
      job: husband.job || null,
      education: husband.education || null,
      bloodType: husband.bloodType || null,
      phoneNumber: husband.phoneNumber || null,
    });
  }
}

export async function syncHealthConditions(
  tx: any,
  intakeId: string,
  conditions?: PersistHealthConditionCommand[],
): Promise<void> {
  if (!conditions || conditions.length === 0) return;

  const rows = conditions.map((cond) => ({
    maternalIntakeId: intakeId,
    conditionCode: cond.conditionCode,
    hasCondition: cond.hasCondition,
    diagnosisYear: cond.diagnosisYear || null,
    notes: cond.notes || null,
  }));

  await tx
    .insert(maternalHealthConditionResponses)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        maternalHealthConditionResponses.maternalIntakeId,
        maternalHealthConditionResponses.conditionCode,
      ],
      set: {
        hasCondition: sql`excluded.has_condition`,
        diagnosisYear: sql`excluded.diagnosis_year`,
        notes: sql`excluded.notes`,
      },
    });
}

export async function syncPreviousPregnancies(
  tx: any,
  intakeId: string,
  pregnancies?: PersistPreviousPregnancyCommand[],
): Promise<void> {
  if (pregnancies === undefined) return;

  await tx
    .delete(maternalPreviousPregnancies)
    .where(eq(maternalPreviousPregnancies.maternalIntakeId, intakeId));

  if (pregnancies.length > 0) {
    const rows = pregnancies.map((p, idx) =>
      mapPreviousPregnancyRow(p, intakeId, idx),
    );
    await tx.insert(maternalPreviousPregnancies).values(rows);
  }
}

export async function syncContraceptiveHistories(
  tx: any,
  intakeId: string,
  histories?: PersistContraceptiveHistoryCommand[],
): Promise<void> {
  if (histories === undefined) return;

  await tx
    .delete(maternalContraceptiveHistories)
    .where(eq(maternalContraceptiveHistories.maternalIntakeId, intakeId));

  if (histories.length > 0) {
    const rows = histories.map((c, idx) =>
      mapContraceptiveHistoryRow(c, intakeId, idx),
    );
    await tx.insert(maternalContraceptiveHistories).values(rows);
  }
}
