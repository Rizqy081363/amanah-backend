import { Temporal } from '@js-temporal/polyfill';
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  and,
  asc,
  eq,
  ilike,
  inArray,
  isNull,
  not,
  or,
  sql,
} from 'drizzle-orm';
import type { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import type { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  childImmunizationIntakes,
  clinicClosures,
  clinicRooms,
  clinicServices,
  clinicUnits,
  maternalHealthIntakes,
  medicalIntakeSubmissions,
  patientProfiles,
  practitioners,
  queueTickets,
  sessionDefs,
} from '../../../../database/schema';
import type { QueuePositionRecalculationService } from '../../../queue-engine/application/services/queue-position-recalculation.service';
import {
  ScheduleShiftRegistry,
  SHIFT_TIMING_CONFIGS,
} from '../../../schedules/domain/constants/schedule-shift.constants';
import {
  DB_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/appointment-lifecycle.constants';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { ActiveTicketPolicyService } from '../../domain/services/active-ticket-policy.service';
import { AppointmentRecordMapper } from './appointment-record.mapper';

export class AppointmentCreationHandler {
  static async create(
    db: DrizzleDatabase,
    data: Omit<AppointmentEntity, 'id' | 'createdAt' | 'updatedAt'>,
    findById: (id: string) => Promise<AppointmentEntity | null>,
    clinicConfig?: ClinicConfigService,
    clinicTimeService?: ClinicTimeService,
    queuePositionRecalculationService?: QueuePositionRecalculationService,
  ): Promise<AppointmentEntity> {
    // Validate patient existence and active status
    if (data.patientId) {
      const patient = await db.query.patientProfiles.findFirst({
        where: eq(patientProfiles.id, data.patientId),
        columns: {
          id: true,
          status: true,
          fullName: true,
        },
      });
      if (!patient) {
        throw new NotFoundException({
          code: 'PATIENT_NOT_FOUND',
          message: 'Data profil pasien tidak ditemukan.',
        });
      }
      if (patient.status === 'inactive') {
        throw new BadRequestException({
          code: 'PATIENT_INACTIVE',
          message:
            'Pasien dalam status nonaktif tidak dapat membuat janji temu baru.',
        });
      }
    }

    const bookingCode = `BOOK-${Date.now().toString(36).toUpperCase()}-${Math.floor(
      Math.random() * 1000,
    )}`;

    const targetShift = ScheduleShiftRegistry.resolve(data.session).shift;

    const policy = clinicConfig
      ? await clinicConfig.getSchedulePolicy().catch(() => null)
      : null;

    const shiftConfig =
      SHIFT_TIMING_CONFIGS[targetShift] || SHIFT_TIMING_CONFIGS.morning;
    let defaultStart = `${shiftConfig.defaultStartTime}:00`;
    let defaultEnd = `${shiftConfig.defaultEndTime}:00`;

    if (policy) {
      if (targetShift === 'early_morning') {
        defaultStart = `${policy.earlyMorningStart}:00`;
        defaultEnd = `${policy.earlyMorningEnd}:00`;
      } else if (targetShift === 'morning') {
        defaultStart = `${policy.morningStart}:00`;
        defaultEnd = `${policy.morningEnd}:00`;
      } else if (targetShift === 'afternoon') {
        defaultStart = `${policy.afternoonStart}:00`;
        defaultEnd = `${policy.afternoonEnd}:00`;
      } else if (targetShift === 'night') {
        defaultStart = `${policy.nightStart}:00`;
        defaultEnd = `${policy.nightEnd}:00`;
      }
    }

    let practitionerId: string | null = null;
    if (data.staffId) {
      const prac = await db.query.practitioners.findFirst({
        where: or(
          eq(practitioners.id, data.staffId),
          eq(practitioners.staffProfileId, data.staffId),
        ),
      });
      practitionerId = prac ? prac.id : data.staffId;
    }

    let isLayananKebidanan = false;
    let clinicServiceRecord: any = null;
    if (data.layananId) {
      clinicServiceRecord = await db.query.clinicServices.findFirst({
        where: eq(clinicServices.id, data.layananId),
        with: {
          serviceCategory: true,
          medicalSpecialty: true,
        },
      });

      if (
        clinicServiceRecord &&
        (clinicServiceRecord.serviceCategory?.code === 'layanan_kebidanan' ||
          clinicServiceRecord.medicalFlow === 'pregnancy' ||
          clinicServiceRecord.medicalFlow === 'immunization')
      ) {
        isLayananKebidanan = true;
        const kiaUnit = await db.query.clinicUnits.findFirst({
          where: or(
            eq(clinicUnits.code, 'poli_kia'),
            ilike(clinicUnits.name, '%kia%'),
          ),
        });
        if (kiaUnit) {
          data.poliklinikId = kiaUnit.id;
        }

        if (practitionerId) {
          const prac = await db.query.practitioners.findFirst({
            where: eq(practitioners.id, practitionerId),
            with: {
              medicalSpecialty: true,
              staffProfile: true,
            },
          });
          const isMidwife = prac?.staffProfile?.staffType === 'midwife';
          const isKiaSpecialty =
            prac?.medicalSpecialty?.code === 'maternal_child_health';
          if (!isMidwife && !isKiaSpecialty) {
            throw new UnprocessableEntityException(
              'Layanan KIA hanya dapat ditangani oleh Bidan atau Dokter Spesialis KIA',
            );
          }
        }
      }
    }

    // Room and doctor assignment are runtime resources (assigned at call, not at booking)
    const startTime = defaultStart;
    const endTime = defaultEnd;

    // Rule R19: Dialihkan, bukan ditolak
    // If category or clinic is closed on requested date and shift, automatically reroute to next open date (horizon 14 days)
    const categoryId =
      clinicServiceRecord?.categoryId ||
      clinicServiceRecord?.serviceCategory?.id ||
      null;

    const reqStartIso = `${data.appointmentDate}T${startTime}.000Z`;
    const reqEndIso = `${data.appointmentDate}T${endTime}.000Z`;

    const activeClosure = await db.query.clinicClosures.findFirst({
      where: and(
        isNull(clinicClosures.cancelledAt),
        sql`${clinicClosures.startsAt} < ${reqEndIso} AND ${clinicClosures.endsAt} > ${reqStartIso}`,
        or(
          eq(clinicClosures.scope, 'clinic'),
          categoryId
            ? and(
                eq(clinicClosures.scope, 'category'),
                eq(clinicClosures.categoryId, categoryId),
              )
            : sql`FALSE`,
        ),
      ),
    });

    if (activeClosure) {
      const candidateDate = new Date(`${data.appointmentDate}T00:00:00.000Z`);
      let foundOpenDate: string | null = null;
      for (let i = 1; i <= 14; i++) {
        candidateDate.setUTCDate(candidateDate.getUTCDate() + 1);
        const nextDateStr = candidateDate.toISOString().slice(0, 10);
        const nextStartIso = `${nextDateStr}T${startTime}.000Z`;
        const nextEndIso = `${nextDateStr}T${endTime}.000Z`;
        const conflict = await db.query.clinicClosures.findFirst({
          where: and(
            isNull(clinicClosures.cancelledAt),
            sql`${clinicClosures.startsAt} < ${nextEndIso} AND ${clinicClosures.endsAt} > ${nextStartIso}`,
            or(
              eq(clinicClosures.scope, 'clinic'),
              categoryId
                ? and(
                    eq(clinicClosures.scope, 'category'),
                    eq(clinicClosures.categoryId, categoryId),
                  )
                : sql`FALSE`,
            ),
          ),
        });
        if (!conflict) {
          foundOpenDate = nextDateStr;
          break;
        }
      }

      if (!foundOpenDate) {
        throw new UnprocessableEntityException(
          `Layanan sedang tutup (${activeClosure.reason || 'Penutupan operasional'}). Tidak ada jadwal buka yang tersedia dalam 14 hari ke depan. Silakan hubungi admin klinik (Rule R19).`,
        );
      }

      const originalDate = data.appointmentDate;
      data.appointmentDate = foundOpenDate;
      const rerouteNotice = `[Dialihkan otomatis dari ${originalDate} karena: ${activeClosure.reason || 'Penutupan operasional'}]`;
      data.complaint = data.complaint
        ? `${rerouteNotice} ${data.complaint}`
        : rerouteNotice;
    }

    // Rule H2 & Blueprint Section 4.5: Satu tiket aktif per pasien per kategori per hari
    if (data.patientId && categoryId && data.appointmentDate) {
      await ActiveTicketPolicyService.assertNoActiveTicketConflict(
        db,
        {
          patientId: data.patientId,
          categoryId,
          queueDate: data.appointmentDate,
        },
        clinicConfig,
      );
    }

    const effectiveMedicalFlow =
      (clinicServiceRecord?.medicalFlow as any) ||
      (data as any).medicalFlow ||
      (clinicServiceRecord?.name?.toLowerCase().includes('imunisasi')
        ? 'immunization'
        : clinicServiceRecord?.name?.toLowerCase().includes('kebidanan') ||
            clinicServiceRecord?.name?.toLowerCase().includes('persalinan')
          ? 'pregnancy'
          : null);

    const targetUnitId = data.poliklinikId;
    let unitPrefix: string | null = null;
    if (targetUnitId) {
      const unit = await db.query.clinicUnits.findFirst({
        where: eq(clinicUnits.id, targetUnitId),
      });
      if (unit?.queuePrefix) {
        unitPrefix = unit.queuePrefix;
      }
    }

    const categoryPrefix =
      clinicServiceRecord?.codePrefix ||
      clinicServiceRecord?.serviceCategory?.codePrefix ||
      unitPrefix ||
      'A';

    const normalizedSession = (data.session || '').trim().toLowerCase();
    const sessionRecord = await db.query.sessionDefs.findFirst({
      where: or(
        eq(sessionDefs.code, targetShift),
        ilike(sessionDefs.code, `%${normalizedSession}%`),
        ilike(sessionDefs.labelKey, `%${normalizedSession}%`),
      ),
    });
    const sessionId = sessionRecord?.id || null;

    const sessionPrefix = sessionRecord?.codePrefix
      ? `${sessionRecord.codePrefix}`
      : '';

    // Calculate queue sequence based on active appointments under the assigned doctor
    // or partitioned by category for unassigned appointments
    let activeCountRow: { count: number } | undefined;
    if (practitionerId) {
      [activeCountRow] = await db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.scheduledDate, data.appointmentDate),
            eq(appointments.practitionerId, practitionerId),
            inArray(appointments.status, [
              DB_APPOINTMENT_STATUS.BOOKED,
              DB_APPOINTMENT_STATUS.WAITING,
              DB_APPOINTMENT_STATUS.IN_SERVICE,
            ]),
          ),
        );
    } else {
      [activeCountRow] = await db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(appointments)
        .innerJoin(
          clinicServices,
          eq(appointments.serviceId, clinicServices.id),
        )
        .where(
          and(
            eq(appointments.scheduledDate, data.appointmentDate),
            isNull(appointments.practitionerId),
            categoryId
              ? eq(clinicServices.serviceCategoryId, categoryId)
              : eq(appointments.serviceId, data.layananId),
            inArray(appointments.status, [
              DB_APPOINTMENT_STATUS.BOOKED,
              DB_APPOINTMENT_STATUS.WAITING,
              DB_APPOINTMENT_STATUS.IN_SERVICE,
            ]),
          ),
        );
    }
    const numericQueueNumber = (activeCountRow?.count || 0) + 1;

    // Resolve collision-free ticket number for target doctor stream or unassigned category pool among active tickets
    const ticketScopeCondition = practitionerId
      ? eq(queueTickets.doctorId, practitionerId)
      : and(
          isNull(queueTickets.doctorId),
          categoryId
            ? eq(queueTickets.categoryId, categoryId)
            : eq(queueTickets.serviceId, data.layananId),
        );

    const existingTickets = await db
      .select({ queueNumber: queueTickets.queueNumber })
      .from(queueTickets)
      .where(
        and(
          ticketScopeCondition,
          eq(queueTickets.queueDate, data.appointmentDate),
          inArray(queueTickets.status, [
            QUEUE_TICKET_STATUS.WAITING,
            QUEUE_TICKET_STATUS.CALLED,
            QUEUE_TICKET_STATUS.IN_SERVICE,
          ]),
        ),
      );
    const usedNumbers = new Set(existingTickets.map((t) => t.queueNumber));
    let ticketIndex = numericQueueNumber;
    let formattedTicketNumber = `${categoryPrefix}-${sessionPrefix}${String(ticketIndex).padStart(3, '0')}`;
    while (usedNumbers.has(formattedTicketNumber)) {
      ticketIndex++;
      formattedTicketNumber = `${categoryPrefix}-${sessionPrefix}${String(ticketIndex).padStart(3, '0')}`;
    }

    const [startH, startM] = (startTime || '08:00')
      .split(':')
      .map((v) => parseInt(v, 10));
    const h = Number.isNaN(startH) ? 8 : startH;
    const m = Number.isNaN(startM) ? 0 : startM;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    const tz =
      clinicTimeService?.getTimezone() ||
      (clinicConfig ? await clinicConfig.getTimezone() : 'Asia/Jakarta');

    const baseStart = new Date(
      Temporal.PlainDateTime.from(`${data.appointmentDate}T${timeStr}`)
        .toZonedDateTime(tz)
        .toInstant().epochMilliseconds,
    );

    const consultationMinutes =
      policy?.defaultConsultationDurationMinutes ?? 20;
    const queueOffsetMinutes =
      Math.max(0, numericQueueNumber - 1) * consultationMinutes;
    const estimatedStart = new Date(
      baseStart.getTime() + queueOffsetMinutes * 60_000,
    );
    const estimatedEnd = new Date(
      estimatedStart.getTime() + consultationMinutes * 60_000,
    );

    const [apt] = await db
      .insert(appointments)
      .values({
        bookingCode,
        patientId: data.patientId,
        practitionerId: practitionerId || null,
        serviceId: data.layananId,
        roomId: null,
        visitType:
          data.visitType === 'Kontrol Ulang' ? 'follow_up' : 'new_visit',
        status: DB_APPOINTMENT_STATUS.BOOKED,
        scheduledDate: data.appointmentDate,
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
        queueNumber: numericQueueNumber,
        estimatedStartAt: estimatedStart.toISOString(),
        estimatedEndAt: estimatedEnd.toISOString(),
        complaint: data.complaint || null,
        medicalFlow: effectiveMedicalFlow,
        createdBy:
          (data as any).createdBy || (data as any).patientUserId || null,
      })
      .returning();

    let ticket: any;
    try {
      const [insertedTicket] = await db
        .insert(queueTickets)
        .values({
          appointmentId: apt.id,
          serviceId: data.layananId,
          categoryId: categoryId,
          sessionId: sessionId,
          patientId: data.patientId || null,
          doctorId: practitionerId || null,
          roomId: null,
          queueDate: data.appointmentDate,
          queueNumber: formattedTicketNumber,
          status: QUEUE_TICKET_STATUS.WAITING,
          priority: 'regular',
          waitingPosition: numericQueueNumber,
          projectedStart: estimatedStart.toISOString(),
          projectedEnd: estimatedEnd.toISOString(),
          source: 'online',
          assignedAt: new Date().toISOString(),
        })
        .returning();
      ticket = insertedTicket;
    } catch (insertError: any) {
      if (
        insertError?.code === '23505' &&
        (insertError?.constraint === 'queue_tickets_one_active_per_patient' ||
          String(insertError?.message || '').includes(
            'queue_tickets_one_active_per_patient',
          ))
      ) {
        // Rollback created appointment to avoid orphan appointment record
        await db
          .delete(appointments)
          .where(eq(appointments.id, apt.id))
          .catch(() => {});

        if (data.patientId && categoryId && data.appointmentDate) {
          await ActiveTicketPolicyService.assertNoActiveTicketConflict(
            db,
            {
              patientId: data.patientId,
              categoryId,
              queueDate: data.appointmentDate,
            },
            clinicConfig,
          );
        }
      }
      throw insertError;
    }

    if (data.sourceIntakeId) {
      await db
        .update(maternalHealthIntakes)
        .set({ appointmentId: apt.id })
        .where(
          or(
            eq(maternalHealthIntakes.id, data.sourceIntakeId),
            eq(maternalHealthIntakes.intakeSubmissionId, data.sourceIntakeId),
          ),
        );

      const imm = await db.query.childImmunizationIntakes.findFirst({
        where: or(
          eq(childImmunizationIntakes.id, data.sourceIntakeId),
          eq(childImmunizationIntakes.intakeSubmissionId, data.sourceIntakeId),
        ),
      });
      if (imm) {
        await db
          .update(childImmunizationIntakes)
          .set({ appointmentId: apt.id })
          .where(eq(childImmunizationIntakes.id, imm.id));
        if (imm.intakeSubmissionId) {
          await db
            .update(medicalIntakeSubmissions)
            .set({ appointmentId: apt.id })
            .where(eq(medicalIntakeSubmissions.id, imm.intakeSubmissionId));
        }
      }

      await db
        .update(medicalIntakeSubmissions)
        .set({ appointmentId: apt.id })
        .where(eq(medicalIntakeSubmissions.id, data.sourceIntakeId));
    }

    if (queuePositionRecalculationService) {
      await queuePositionRecalculationService
        .recalculateDoctorQueue({
          serviceDate: data.appointmentDate,
          practitionerId: practitionerId || null,
          categoryId: practitionerId ? undefined : categoryId,
        })
        .catch(() => {});
    }

    const fullApt = await findById(apt.id);
    return (
      fullApt ||
      AppointmentRecordMapper.toEntity(
        apt,
        ticket,
        data.poliklinikId,
        undefined,
        clinicTimeService,
      )
    );
  }
}
