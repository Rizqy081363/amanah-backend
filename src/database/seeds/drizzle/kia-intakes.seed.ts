import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { createChildImmunizationSeed } from './factories/child-immunization-intake.factory';
import { createMaternalIntakeSeed } from './factories/maternal-intake.factory';

type SeedContext = {
  client: PoolClient;
  roleIdsByCode: Map<string, string>;
  userIdsByEmail: Map<string, string>;
  unitIdsByCode: Map<string, string>;
  specialtyIdsByCode: Map<string, string>;
  roomIdsByCode: Map<string, string>;
  serviceIdsByCode: Map<string, string>;
  staffIdsByCode: Map<string, string>;
  practitionerIdsByEmail: Map<string, string>;
  patientIdsByEmail: Map<string, string>;
  occupationIdsByCode: Map<string, string>;
};

export async function seedKiaIntakes(context: SeedContext): Promise<void> {
  const { client } = context;

  const midwifeRes = await client.query<{ id: string }>(
    `SELECT p.id
     FROM practitioners p
     LEFT JOIN medical_specialties ms ON ms.id = p.specialty_id
     WHERE ms.code = 'maternal_child_health'
     LIMIT 1`,
  );

  let midwifePractitionerId = midwifeRes.rows[0]?.id;
  if (!midwifePractitionerId) {
    const fallbackPrac = await client.query<{ id: string }>(
      `SELECT id FROM practitioners LIMIT 1`,
    );
    midwifePractitionerId = fallbackPrac.rows[0]?.id;
  }

  const pregnancyServiceId = context.serviceIdsByCode.get('pregnancy_checkup');
  const immunizationServiceId =
    context.serviceIdsByCode.get('child_immunization');
  const kiaRoomId =
    context.roomIdsByCode.get('room_kia_1') ||
    Array.from(context.roomIdsByCode.values())[0];

  const motherPatientId = context.patientIdsByEmail.get('pasien@amanah.com');

  if (
    motherPatientId &&
    midwifePractitionerId &&
    pregnancyServiceId &&
    kiaRoomId
  ) {
    const maternalApptRes = await client.query<{ id: string }>(
      `INSERT INTO appointments (
         booking_code,
         patient_id,
         practitioner_id,
         service_id,
         room_id,
         visit_type,
         status,
         scheduled_date,
         scheduled_start_time,
         scheduled_end_time,
         queue_number,
         complaint
       )
       VALUES (
         'BOOK-KIA-MAT-01',
         $1, $2, $3, $4,
         'new_visit',
         'booked',
         CURRENT_DATE + 2,
         '09:00',
         '09:30',
         1,
         'Pemeriksaan kehamilan trimester kedua dan konsultasi ANC rutin'
       )
       ON CONFLICT (booking_code) DO UPDATE
       SET patient_id = EXCLUDED.patient_id,
           practitioner_id = EXCLUDED.practitioner_id,
           service_id = EXCLUDED.service_id,
           room_id = EXCLUDED.room_id,
           status = 'booked',
           scheduled_date = EXCLUDED.scheduled_date,
           scheduled_start_time = EXCLUDED.scheduled_start_time,
           scheduled_end_time = EXCLUDED.scheduled_end_time,
           queue_number = 1,
           complaint = EXCLUDED.complaint,
           updated_at = NOW()
       RETURNING id`,
      [motherPatientId, midwifePractitionerId, pregnancyServiceId, kiaRoomId],
    );

    const maternalAppointmentId = maternalApptRes.rows[0].id;

    await client.query(
      `INSERT INTO queue_tickets (
         appointment_id,
         service_id,
         room_id,
         queue_date,
         queue_number,
         priority,
         status,
         waiting_position
       )
       VALUES ($1, $2, $3, CURRENT_DATE + 2, 'BD-001', 'regular', 'waiting', 1)
       ON CONFLICT (appointment_id) DO UPDATE
       SET service_id = EXCLUDED.service_id,
           room_id = EXCLUDED.room_id,
           queue_date = EXCLUDED.queue_date,
           queue_number = 'BD-001',
           priority = EXCLUDED.priority,
           status = EXCLUDED.status,
           waiting_position = EXCLUDED.waiting_position,
           updated_at = NOW()`,
      [maternalAppointmentId, pregnancyServiceId, kiaRoomId],
    );

    const existingMaternalSubmission = await client.query<{ id: string }>(
      `SELECT id FROM medical_intake_submissions WHERE appointment_id = $1 LIMIT 1`,
      [maternalAppointmentId],
    );

    let submissionId = existingMaternalSubmission.rows[0]?.id;
    const maternalSeed = createMaternalIntakeSeed({
      patientId: motherPatientId,
      appointmentId: maternalAppointmentId,
      motherName: 'Ny. Dewi Lestari',
    });

    if (!submissionId) {
      const submissionRes = await client.query<{ id: string }>(
        `INSERT INTO medical_intake_submissions (
           id,
           appointment_id,
           patient_id,
           flow,
           schema_version,
           schema_title,
           answers,
           automatic,
           created_at,
           updated_at
         )
         VALUES ($1, $2, $3, 'pregnancy', 'v1', 'Formulir Pemeriksaan Kehamilan & ANC', $4, '{}'::jsonb, NOW(), NOW())
         RETURNING id`,
        [
          randomUUID(),
          maternalAppointmentId,
          motherPatientId,
          JSON.stringify(maternalSeed),
        ],
      );
      submissionId = submissionRes.rows[0].id;
    }

    const existingMaternalIntake = await client.query<{ id: string }>(
      `SELECT id FROM maternal_health_intakes WHERE appointment_id = $1 LIMIT 1`,
      [maternalAppointmentId],
    );

    let maternalIntakeId = existingMaternalIntake.rows[0]?.id;

    if (!maternalIntakeId) {
      const maternalIntakeRes = await client.query<{ id: string }>(
        `INSERT INTO maternal_health_intakes (
           id,
           intake_submission_id,
           patient_id,
           appointment_id,
           mother_nik,
           mother_name,
           mother_birth_date,
           mother_age,
           marriage_order,
           marriage_date,
           mother_job,
           mother_education,
           religion,
           phone_number,
           domicile_address,
           identity_card_address,
           dasawisma,
           posyandu,
           puskesmas,
           partner_name,
           partner_nik,
           partner_birth_date,
           partner_age,
           partner_job,
           partner_education,
           partner_blood_type,
           height_cm,
           pre_pregnancy_weight_kg,
           upper_arm_circumference_cm,
           initial_bmi,
           tetanus_status,
           mother_blood_type,
           hpht,
           estimated_due_date,
           gestational_age_weeks,
           gestational_age_formatted,
           current_complaints,
           gravida_count,
           parity_count,
           abortion_count,
           living_children_count,
           has_previous_pregnancy_history,
           has_contraception_history,
           smoked_before_pregnancy,
           alcohol_before_pregnancy,
           irregular_diet_before_pregnancy,
           reduced_physical_activity_before_pregnancy,
           unprescribed_medication_before_pregnancy,
           concerning_cosmetic_use_before_pregnancy,
           pesticide_exposure_before_pregnancy,
           chemical_exposure_before_pregnancy,
           smoke_exposure_before_pregnancy,
           concerning_environment_notes,
           allergy_info,
           other_notes,
           disease_history
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
           $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
           $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
           $41, $42, $43, $44, $45, $46, $47, $48, $49, $50,
           $51, $52, $53, $54, $55, $56
         )
          RETURNING id`,
        [
          randomUUID(), submissionId, motherPatientId, maternalAppointmentId,
          maternalSeed.motherNik, maternalSeed.motherName, maternalSeed.motherBirthDate, maternalSeed.motherAge,
          maternalSeed.marriageOrder, maternalSeed.marriageDate, maternalSeed.motherJob, maternalSeed.motherEducation,
          maternalSeed.religion, maternalSeed.phoneNumber, maternalSeed.domicileAddress, maternalSeed.identityCardAddress,
          maternalSeed.dasawisma, maternalSeed.posyandu, maternalSeed.puskesmas, maternalSeed.partnerName,
          maternalSeed.partnerNik, maternalSeed.partnerBirthDate, maternalSeed.partnerAge, maternalSeed.partnerJob,
          maternalSeed.partnerEducation, maternalSeed.partnerBloodType, maternalSeed.heightCm, maternalSeed.prePregnancyWeightKg,
          maternalSeed.upperArmCircumferenceCm, maternalSeed.initialBmi, maternalSeed.tetanusStatus, maternalSeed.motherBloodType,
          maternalSeed.hpht, maternalSeed.estimatedDueDate, maternalSeed.gestationalAgeWeeks, maternalSeed.gestationalAgeFormatted,
          maternalSeed.currentComplaints, maternalSeed.gravidaCount, maternalSeed.parityCount, maternalSeed.abortionCount,
          maternalSeed.livingChildrenCount, maternalSeed.hasPreviousPregnancyHistory, maternalSeed.hasContraceptionHistory,
          maternalSeed.smokedBeforePregnancy, maternalSeed.alcoholBeforePregnancy, maternalSeed.irregularDietBeforePregnancy,
          maternalSeed.reducedPhysicalActivityBeforePregnancy, maternalSeed.unprescribedMedicationBeforePregnancy,
          maternalSeed.concerningCosmeticUseBeforePregnancy, maternalSeed.pesticideExposureBeforePregnancy,
          maternalSeed.chemicalExposureBeforePregnancy, maternalSeed.smokeExposureBeforePregnancy,
          maternalSeed.concerningEnvironmentNotes, maternalSeed.allergyInfo, maternalSeed.otherNotes,
          JSON.stringify(maternalSeed.diseaseHistory),
        ],
      );
      maternalIntakeId = maternalIntakeRes.rows[0].id;

      for (const prev of maternalSeed.previousPregnancies) {
        await client.query(
          `INSERT INTO maternal_previous_pregnancies (
             id,
             maternal_intake_id,
             order_number,
             birth_year,
             birth_weight_grams,
             birth_length_cm,
             child_sex,
             gestational_age_at_birth,
             birth_attendant,
             delivery_method,
             delivery_place,
             complications
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            randomUUID(),
            maternalIntakeId,
            prev.orderNumber,
            prev.birthYear,
            prev.birthWeightGrams,
            prev.birthLengthCm,
            prev.childSex,
            prev.gestationalAgeAtBirth,
            prev.birthAttendant,
            prev.deliveryMethod,
            prev.deliveryPlace,
            prev.complications,
          ],
        );
      }

      for (const contra of maternalSeed.contraceptiveHistories) {
        await client.query(
          `INSERT INTO maternal_contraceptive_histories (
             id,
             maternal_intake_id,
             order_number,
             start_date,
             contraceptive_type,
             duration_text,
             stop_date,
             problems,
             side_effects
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            randomUUID(),
            maternalIntakeId,
            contra.orderNumber,
            contra.startDate,
            contra.contraceptiveType,
            contra.durationText,
            contra.stopDate,
            contra.problems,
            contra.sideEffects,
          ],
        );
      }
    }
  }

  const childProfileRes = await client.query<{ id: string }>(
    `SELECT id FROM patient_profiles WHERE medical_record_number = 'MRN-FAM-002' LIMIT 1`,
  );

  let childPatientId = childProfileRes.rows[0]?.id;
  if (!childPatientId) {
    const newChild = await client.query<{ id: string }>(
      `INSERT INTO patient_profiles (
         id,
         medical_record_number,
         full_name,
         birth_place,
         birth_date,
         gender,
         blood_type,
         phone,
         status
       )
       VALUES ($1, 'MRN-FAM-002', 'Yusuf Pratama', 'Bandung', '2025-08-20', 'male', 'o', '081234567892', 'active')
       ON CONFLICT (medical_record_number) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [randomUUID()],
    );
    childPatientId = newChild.rows[0].id;
  }

  if (
    childPatientId &&
    midwifePractitionerId &&
    immunizationServiceId &&
    kiaRoomId
  ) {
    const immApptRes = await client.query<{ id: string }>(
      `INSERT INTO appointments (
         booking_code,
         patient_id,
         practitioner_id,
         service_id,
         room_id,
         visit_type,
         status,
         scheduled_date,
         scheduled_start_time,
         scheduled_end_time,
         queue_number,
         complaint
       )
       VALUES (
         'BOOK-KIA-IMM-01',
         $1, $2, $3, $4,
         'new_visit',
         'booked',
         CURRENT_DATE + 3,
         '10:00',
         '10:30',
         1,
         'Jadwal imunisasi lanjutan campak/MR dan pemantauan tumbuh kembang balita'
       )
       ON CONFLICT (booking_code) DO UPDATE
       SET patient_id = EXCLUDED.patient_id,
           practitioner_id = EXCLUDED.practitioner_id,
           service_id = EXCLUDED.service_id,
           room_id = EXCLUDED.room_id,
           status = 'booked',
           scheduled_date = EXCLUDED.scheduled_date,
           scheduled_start_time = EXCLUDED.scheduled_start_time,
           scheduled_end_time = EXCLUDED.scheduled_end_time,
           queue_number = 1,
           complaint = EXCLUDED.complaint,
           updated_at = NOW()
       RETURNING id`,
      [childPatientId, midwifePractitionerId, immunizationServiceId, kiaRoomId],
    );

    const immAppointmentId = immApptRes.rows[0].id;

    await client.query(
      `INSERT INTO queue_tickets (
         appointment_id,
         service_id,
         room_id,
         queue_date,
         queue_number,
         priority,
         status,
         waiting_position
       )
       VALUES ($1, $2, $3, CURRENT_DATE + 3, 'BD-001', 'regular', 'waiting', 1)
       ON CONFLICT (appointment_id) DO UPDATE
       SET service_id = EXCLUDED.service_id,
           room_id = EXCLUDED.room_id,
           queue_date = EXCLUDED.queue_date,
           queue_number = 'BD-001',
           priority = EXCLUDED.priority,
           status = EXCLUDED.status,
           waiting_position = EXCLUDED.waiting_position,
           updated_at = NOW()`,
      [immAppointmentId, immunizationServiceId, kiaRoomId],
    );

    const existingImmSubmission = await client.query<{ id: string }>(
      `SELECT id FROM medical_intake_submissions WHERE appointment_id = $1 LIMIT 1`,
      [immAppointmentId],
    );

    let immSubmissionId = existingImmSubmission.rows[0]?.id;
    const childSeed = createChildImmunizationSeed({
      patientId: childPatientId,
      appointmentId: immAppointmentId,
      childName: 'Yusuf Pratama',
      childSex: 'Laki-laki',
      childBirthDate: '2025-08-20',
    });

    if (!immSubmissionId) {
      const immSubRes = await client.query<{ id: string }>(
        `INSERT INTO medical_intake_submissions (
           id,
           appointment_id,
           patient_id,
           flow,
           schema_version,
           schema_title,
           answers,
           automatic,
           created_at,
           updated_at
         )
         VALUES ($1, $2, $3, 'immunization', 'v1', 'Formulir Skrining Imunisasi Anak', $4, '{}'::jsonb, NOW(), NOW())
         RETURNING id`,
        [
          randomUUID(),
          immAppointmentId,
          childPatientId,
          JSON.stringify(childSeed),
        ],
      );
      immSubmissionId = immSubRes.rows[0].id;
    }

    const existingImmIntake = await client.query<{ id: string }>(
      `SELECT id FROM child_immunization_intakes WHERE appointment_id = $1 LIMIT 1`,
      [immAppointmentId],
    );

    if (!existingImmIntake.rows[0]?.id) {
      await client.query(
        `INSERT INTO child_immunization_intakes (
           id,
           intake_submission_id,
           patient_id,
           appointment_id,
           child_name,
           child_nik,
           child_birth_date,
           child_sex,
           child_age_formatted,
           parent_phone,
           father_name,
           mother_name,
           child_address,
           previous_vaccine_history,
           child_allergy_history
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          randomUUID(), immSubmissionId, childPatientId, immAppointmentId,
          childSeed.childName, childSeed.childNik, childSeed.childBirthDate,
          childSeed.childSex, childSeed.childAgeFormatted, childSeed.parentPhone,
          childSeed.fatherName, childSeed.motherName, childSeed.childAddress,
          childSeed.previousVaccineHistory, childSeed.childAllergyHistory,
        ],
      );
    }
  }
}
