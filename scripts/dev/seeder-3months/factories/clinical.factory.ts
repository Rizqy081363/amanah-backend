import type { PoolClient } from 'pg';
import type { DbContext, CreatedStaff, CreatedPatient, TimelineDay } from '../types';
import { getRandomClinicalCase } from '../core/clinical-data-pool';

export async function seedClinicalAppointmentsAndEncounters(
  client: PoolClient,
  ctx: DbContext,
  timeline: TimelineDay[],
  staffList: CreatedStaff[],
  patients: CreatedPatient[]
): Promise<number> {
  const doctors = staffList.filter(
    (s) => s.practitionerId && (s.roleCode.includes('doctor') || s.department.includes('Keperawatan'))
  );
  const midwives = staffList.filter(
    (s) => s.practitionerId && (s.roleCode.includes('midwife') || s.roleCode.includes('specialist'))
  );

  const generalServices = [
    ctx.services.get('pemeriksaan_dokter_umum'),
    ctx.services.get('cek_tekanan_darah'),
    ctx.services.get('pengobatan_keluhan_ringan'),
    ctx.services.get('surat_keterangan_sehat'),
  ].filter(Boolean);

  const kiaServices = [
    ctx.services.get('pemeriksaan_kehamilan'),
    ctx.services.get('usg_kandungan'),
    ctx.services.get('imunisasi_anak'),
    ctx.services.get('keluarga_berencana'),
  ].filter(Boolean);

  const sessionMorning = ctx.sessions.get('pagi') || ctx.sessions.get('morning') || ctx.sessions.values().next().value;
  const sessionAfternoon = ctx.sessions.get('sore') || ctx.sessions.get('afternoon') || sessionMorning;

  let totalEncountersSeeded = 0;
  let bookingSequence = 1;

  for (const day of timeline) {
    if (!day.isWorkday) continue; // Skip Sundays

    const isToday = day.isToday;
    const isFuture = day.isFuture;

    // 8-12 patients per workday in past, 4-7 advance bookings for future
    const dailyPatientCount = isFuture ? (4 + (day.dayIndex % 4)) : (8 + (day.dayIndex % 5));
    let queueSeqGeneral = 1;
    let queueSeqKia = 1;

    for (let slot = 0; slot < dailyPatientCount; slot++) {
      // Pick patient rotating across the patients
      const patientIdx = (day.dayIndex * 7 + slot) % patients.length;
      const patient = patients[patientIdx];

      // Determine clinical service & practitioner
      let service = generalServices[slot % generalServices.length]!;
      let practitioner = doctors[slot % doctors.length]!;
      let isKia = false;

      // Children -> Immunization / General
      if (patient.birthDate >= '2022-01-01') {
        const imunService = ctx.services.get('imunisasi_anak');
        if (imunService && midwives.length > 0) {
          service = imunService;
          practitioner = midwives[slot % midwives.length]!;
          isKia = true;
        }
      } else if (patient.gender === 'female' && patient.birthDate >= '1985-01-01' && patient.birthDate <= '2004-01-01') {
        // Adult female -> 50% KIA (pregnancy/USG/KB)
        if (slot % 2 === 0 && kiaServices.length > 0) {
          service = kiaServices[slot % kiaServices.length]!;
          practitioner = (service.code.includes('usg') ? doctors.find((d) => d.roleCode.includes('specialist')) : null)
            || midwives[slot % midwives.length]!
            || doctors[0]!;
          isKia = true;
        }
      }

      const session = slot < 6 ? sessionMorning : sessionAfternoon;
      const servicePrefix = service.code_prefix || (isKia ? 'KIA' : 'UM');
      const sessionPrefix = session?.code_prefix || (slot < 6 ? 'P' : 'S');
      const queueNumberInt = isKia ? queueSeqKia++ : queueSeqGeneral++;
      const queueTicketString = `${servicePrefix}-${sessionPrefix}${String(queueNumberInt).padStart(3, '0')}`;

      // Slot times
      const baseHour = slot < 6 ? 8 : 14;
      const minuteOffset = (slot % 6) * 20;
      const startHourStr = String(baseHour + Math.floor(minuteOffset / 60)).padStart(2, '0');
      const startMinStr = String(minuteOffset % 60).padStart(2, '0');
      const endMinute = (minuteOffset + 20) % 60;
      const endHourStr = String(baseHour + Math.floor((minuteOffset + 20) / 60)).padStart(2, '0');
      const endMinStr = String(endMinute).padStart(2, '0');

      const startTime = `${startHourStr}:${startMinStr}:00`;
      const endTime = `${endHourStr}:${endMinStr}:00`;
      const startTz = `${day.date} ${startTime}+07`;
      const endTz = `${day.date} ${endTime}+07`;

      const bookingCode = `BOOK-${day.date.replace(/-/g, '')}-${String(bookingSequence++).padStart(4, '0')}`;
      const clinicalCase = getRandomClinicalCase(service.code);

      // Determine Status
      let aptStatus: 'completed' | 'in_service' | 'waiting' | 'booked' | 'cancelled' | 'no_show' | 'late' = 'completed';
      let queueStatus: 'completed' | 'in_service' | 'waiting' | 'cancelled' | 'skipped' = 'completed';

      let actualStart: string | null = startTz;
      let actualEnd: string | null = endTz;
      let checkedInAt: string | null = `${day.date} ${startHourStr}:00:00+07`;
      let completedAt: string | null = endTz;
      let cancelReason: string | null = null;

      if (isFuture) {
        // Upcoming days: All booked advance appointments
        aptStatus = 'booked';
        queueStatus = 'waiting';
        actualStart = null;
        actualEnd = null;
        checkedInAt = null;
        completedAt = null;
      } else if (isToday) {
        if (slot < 2) {
          aptStatus = 'completed';
          queueStatus = 'completed';
        } else if (slot === 2) {
          aptStatus = 'in_service';
          queueStatus = 'in_service';
          actualStart = `${day.date} 08:40:00+07`;
          actualEnd = null;
          completedAt = null;
        } else if (slot < 6) {
          aptStatus = 'waiting';
          queueStatus = 'waiting';
          actualStart = null;
          actualEnd = null;
          completedAt = null;
        } else {
          aptStatus = 'booked';
          queueStatus = 'waiting';
          actualStart = null;
          actualEnd = null;
          checkedInAt = null;
          completedAt = null;
        }
      } else {
        // Past workdays
        const statusHash = (day.dayIndex * 19 + slot * 7) % 100;
        if (statusHash < 83) {
          aptStatus = 'completed';
          queueStatus = 'completed';
        } else if (statusHash < 91) {
          aptStatus = 'cancelled';
          queueStatus = 'cancelled';
          actualStart = null;
          actualEnd = null;
          completedAt = null;
          cancelReason = 'Pasien membatalkan janji temu karena ada keperluan mendadak';
        } else if (statusHash < 97) {
          aptStatus = 'no_show';
          queueStatus = 'skipped';
          actualStart = null;
          actualEnd = null;
          completedAt = null;
          checkedInAt = null;
        } else {
          aptStatus = 'late';
          queueStatus = 'completed';
        }
      }

      const roomId = practitioner.defaultRoomId 
        || (isKia ? ctx.rooms.get('r_kia_01')?.id : ctx.rooms.get('r_pu_01')?.id)
        || null;

      // 1. Insert Appointment
      const aptRes = await client.query(
        `
        INSERT INTO appointments (
          booking_code, patient_id, practitioner_id, service_id, room_id,
          visit_type, status, scheduled_date, scheduled_start_time, scheduled_end_time,
          queue_number, complaint, estimated_start_at, estimated_end_at,
          actual_started_at, actual_completed_at, checked_in_at, completed_at, cancel_reason,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'new_visit', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
        RETURNING id;
        `,
        [
          bookingCode,
          patient.patientProfileId,
          practitioner.practitionerId,
          service.id,
          roomId,
          aptStatus,
          day.date,
          startTime,
          endTime,
          queueNumberInt,
          clinicalCase.complaint,
          startTz,
          endTz,
          actualStart,
          actualEnd,
          checkedInAt,
          completedAt,
          cancelReason,
          startTz,
        ]
      );
      const appointmentId = aptRes.rows[0].id;

      // 2. Insert Queue Ticket
      await client.query(
        `
        INSERT INTO queue_tickets (
          appointment_id, service_id, category_id, session_id, doctor_id, patient_id, room_id,
          queue_date, queue_number, priority, status, waiting_position, source, assigned_at,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'regular', $10, $11, 'online', $12, $13, NOW())
        ON CONFLICT (id) DO NOTHING;
        `,
        [
          appointmentId,
          service.id,
          service.service_category_id || null,
          session?.id || null,
          practitioner.practitionerId,
          patient.patientProfileId,
          roomId,
          day.date,
          queueTicketString,
          queueStatus,
          queueNumberInt,
          startTz,
          startTz,
        ]
      );

      // 3. Insert Clinical Encounter (SOAP EMR) for completed appointments
      if (aptStatus === 'completed') {
        await client.query(
          `
          INSERT INTO clinical_encounters (
            appointment_id, patient_id, practitioner_id, service_id, encounter_date,
            status, subjective_notes, objective_notes, assessment, plan, created_by, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (appointment_id) DO NOTHING;
          `,
          [
            appointmentId,
            patient.patientProfileId,
            practitioner.practitionerId,
            service.id,
            day.date,
            clinicalCase.subjectiveNotes,
            clinicalCase.objectiveNotes,
            clinicalCase.assessment,
            clinicalCase.plan,
            practitioner.userId,
            endTz,
            endTz,
          ]
        );

        // Update patient visit metrics
        await client.query(
          `
          UPDATE patient_profiles
          SET visit_count = visit_count + 1,
              last_visit_at = $1
          WHERE id = $2;
          `,
          [endTz, patient.patientProfileId]
        );

        totalEncountersSeeded++;
      }
    }
  }

  return totalEncountersSeeded;
}
