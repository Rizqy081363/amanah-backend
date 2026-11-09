import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  maternalHealthIntakes,
} from '../../../../database/schema/amanah.schema';
import {
  PersistMaternityIntakeCommand,
  PersistMaternityIntakePatch,
} from '../../domain/commands/maternity.commands';
import { MaternityIntakeEntity } from '../../domain/entities/maternity-intake.entity';
import {
  MaternityHistoryQuery,
  MaternityHistoryResult,
  MaternityRepository,
} from '../../domain/repositories/maternity.repository.interface';
import {
  syncContraceptiveHistories,
  syncHealthConditions,
  syncHusbandProfile,
  syncPreviousPregnancies,
} from '../persistence/child-collections.writer';
import { translateDatabaseError } from '../persistence/db-error.translator';
import { MaternityIntakeReader } from '../persistence/maternity-intake.reader';
import {
  buildMaternalHeaderPatch,
  toSafeNumericString,
} from './maternity-persistence.helper';

@Injectable()
export class MaternityDrizzleRepository implements MaternityRepository {
  private readonly reader: MaternityIntakeReader;

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {
    this.reader = new MaternityIntakeReader(this.db);
  }

  async create(
    cmd: PersistMaternityIntakeCommand,
    submittedByUserId?: string,
  ): Promise<MaternityIntakeEntity> {
    try {
      const intakeId = await this.db.transaction(async (tx) => {
        const [intake] = await tx
          .insert(maternalHealthIntakes)
          .values({
            patientId: cmd.patientId,
            appointmentId: cmd.appointmentId || null,
            motherName: cmd.motherName,
            motherNik: cmd.motherNik,
            motherBirthDate: cmd.motherBirthDate || null,
            motherAge: cmd.motherAge || null,
            marriageOrder: cmd.marriageOrder ?? 1,
            marriageDate: cmd.marriageDate || null,
            motherJob: cmd.motherJob || null,
            motherEducation: cmd.motherEducation || null,
            religion: cmd.religion || null,
            phoneNumber: cmd.phoneNumber || null,
            domicileAddress: cmd.domicileAddress || null,
            identityCardAddress: cmd.identityCardAddress || null,
            dasawisma: cmd.dasawisma || null,
            posyandu: cmd.posyandu || null,
            puskesmas: cmd.puskesmas || null,
            partnerName: cmd.partnerName || cmd.husband?.fullName || null,
            partnerNik: cmd.partnerNik || cmd.husband?.nik || null,
            partnerBirthDate:
              cmd.partnerBirthDate || cmd.husband?.birthDate || null,
            partnerAge: cmd.partnerAge || cmd.husband?.age || null,
            partnerJob: cmd.partnerJob || cmd.husband?.job || null,
            partnerEducation:
              cmd.partnerEducation || cmd.husband?.education || null,
            partnerBloodType:
              cmd.partnerBloodType || cmd.husband?.bloodType || null,
            heightCm: toSafeNumericString(cmd.heightCm, 3, 2),
            prePregnancyWeightKg: toSafeNumericString(
              cmd.prePregnancyWeightKg,
              3,
              2,
            ),
            upperArmCircumferenceCm: toSafeNumericString(
              cmd.upperArmCircumferenceCm,
              3,
              1,
            ),
            initialBmi: toSafeNumericString(cmd.initialBmi, 3, 1),
            tetanusStatus: cmd.tetanusStatus || null,
            motherBloodType: cmd.motherBloodType || null,
            hpht: cmd.hpht || null,
            estimatedDueDate: cmd.estimatedDueDate || null,
            gestationalAgeWeeks: toSafeNumericString(
              cmd.gestationalAgeWeeks,
              3,
              1,
            ),
            gestationalAgeFormatted: cmd.gestationalAgeFormatted || null,
            currentComplaints: cmd.currentComplaints || null,
            gravidaCount: cmd.gravidaCount,
            parityCount: cmd.parityCount,
            abortionCount: cmd.abortionCount,
            livingChildrenCount: cmd.livingChildrenCount,
            hasPreviousPregnancyHistory: cmd.hasPreviousPregnancyHistory,
            hasContraceptionHistory: cmd.hasContraceptionHistory,
            smokedBeforePregnancy: cmd.smokedBeforePregnancy || null,
            alcoholBeforePregnancy: cmd.alcoholBeforePregnancy,
            irregularDietBeforePregnancy: cmd.irregularDietBeforePregnancy,
            reducedPhysicalActivityBeforePregnancy:
              cmd.reducedPhysicalActivityBeforePregnancy,
            unprescribedMedicationBeforePregnancy:
              cmd.unprescribedMedicationBeforePregnancy,
            concerningCosmeticUseBeforePregnancy:
              cmd.concerningCosmeticUseBeforePregnancy,
            pesticideExposureBeforePregnancy:
              cmd.pesticideExposureBeforePregnancy,
            chemicalExposureBeforePregnancy:
              cmd.chemicalExposureBeforePregnancy,
            smokeExposureBeforePregnancy: cmd.smokeExposureBeforePregnancy,
            concerningEnvironmentNotes: cmd.concerningEnvironmentNotes || null,
            allergyInfo: cmd.allergyInfo || null,
            otherNotes: cmd.otherNotes || null,
          })
          .returning();

        if (cmd.husband) {
          await syncHusbandProfile(tx, intake.id, cmd.husband);
        }
        if (cmd.previousPregnancies && cmd.previousPregnancies.length > 0) {
          await syncPreviousPregnancies(tx, intake.id, cmd.previousPregnancies);
        }
        if (
          cmd.contraceptiveHistories &&
          cmd.contraceptiveHistories.length > 0
        ) {
          await syncContraceptiveHistories(
            tx,
            intake.id,
            cmd.contraceptiveHistories,
          );
        }
        if (cmd.healthConditions && cmd.healthConditions.length > 0) {
          await syncHealthConditions(tx, intake.id, cmd.healthConditions);
        }

        return intake.id;
      });

      return (await this.findById(intakeId))!;
    } catch (error) {
      translateDatabaseError(error);
    }
  }

  async update(
    id: string,
    patch: PersistMaternityIntakePatch,
  ): Promise<MaternityIntakeEntity | null> {
    try {
      const updatedId = await this.db.transaction(async (tx) => {
        const existing = await tx.query.maternalHealthIntakes.findFirst({
          where: eq(maternalHealthIntakes.id, id),
        });

        if (!existing) return null;
        const intakeId = existing.id;

        if (patch.appointmentComplaintSync && existing.appointmentId) {
          await tx
            .update(appointments)
            .set({
              complaint: patch.appointmentComplaintSync.complaint,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(appointments.id, existing.appointmentId));
        }

        const headerPatch = buildMaternalHeaderPatch(patch);
        await tx
          .update(maternalHealthIntakes)
          .set(headerPatch)
          .where(eq(maternalHealthIntakes.id, intakeId));

        if (patch.husband !== undefined) {
          await syncHusbandProfile(tx, intakeId, patch.husband);
        }
        if (patch.previousPregnancies !== undefined) {
          await syncPreviousPregnancies(
            tx,
            intakeId,
            patch.previousPregnancies,
          );
        }
        if (patch.contraceptiveHistories !== undefined) {
          await syncContraceptiveHistories(
            tx,
            intakeId,
            patch.contraceptiveHistories,
          );
        }
        if (patch.healthConditions !== undefined) {
          await syncHealthConditions(tx, intakeId, patch.healthConditions);
        }

        return intakeId;
      });

      if (!updatedId) return null;
      return this.findById(updatedId);
    } catch (error) {
      translateDatabaseError(error);
    }
  }

  async findById(id: string): Promise<MaternityIntakeEntity | null> {
    return this.reader.findById(id);
  }

  async findByAppointmentId(
    appointmentId: string,
  ): Promise<MaternityIntakeEntity | null> {
    return this.reader.findByAppointmentId(appointmentId);
  }

  async findLatestByPatientId(
    patientId: string,
  ): Promise<MaternityIntakeEntity | null> {
    return this.reader.findLatestByPatientId(patientId);
  }

  async findByPatientId(patientId: string): Promise<MaternityIntakeEntity[]> {
    return this.reader.findByPatientId(patientId);
  }

  async findMaternalHistory(
    patientIds: string[],
    query: MaternityHistoryQuery,
  ): Promise<MaternityHistoryResult> {
    return this.reader.findMaternalHistory(patientIds, query);
  }
}
