import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  doctorAssignments,
  practitioners,
  sessionDefs,
} from '../../../../database/schema';
import { SchedulePolicyReader } from '../../../schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import { planAppointmentTiming } from '../../domain/services/appointment-timing.planner';
import type { AppointmentRecord } from '../../domain/types/appointment.types';
import {
  APPOINTMENT_REPOSITORY_PORT,
  type AppointmentRepositoryPort,
} from '../ports/appointment-repository.port';

export interface BookAppointmentInput {
  patientId: string;
  practitionerId: string;
  scheduledDate: string;
  serviceId?: string | null;
  poliklinikId?: string | null;
  roomId?: string | null;
  notes?: string | null;
}

@Injectable()
export class BookAppointmentUseCase {
  private readonly logger = new Logger(BookAppointmentUseCase.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY_PORT)
    private readonly appointmentRepo: AppointmentRepositoryPort,
    private readonly policyReader: SchedulePolicyReader,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async execute(input: BookAppointmentInput): Promise<AppointmentRecord> {
    const prac = await this.db.query?.practitioners?.findFirst?.({
      where: eq(practitioners.id, input.practitionerId),
    });

    const policy = await this.policyReader.getPolicy(prac);
    const durationMinutes = policy.durationMinutes || 30;

    const targetDate = new Date(`${input.scheduledDate}T00:00:00.000Z`);
    const dow = targetDate.getUTCDay();

    const assignment = await this.db.query?.doctorAssignments?.findFirst?.({
      where: and(
        eq(doctorAssignments.doctorId, input.practitionerId),
        eq(doctorAssignments.dow, dow),
        eq(doctorAssignments.isActive, true),
      ),
      with: {
        sessionDef: true,
      },
    });

    const morningSession = !assignment
      ? await this.db.query?.sessionDefs?.findFirst?.({
          where: eq(sessionDefs.code, 'morning'),
        })
      : null;

    const startTimeStr =
      assignment?.sessionDef?.defaultStartsAt ||
      morningSession?.defaultStartsAt ||
      '08:00';
    const [hours, minutes] = startTimeStr.split(':').map(Number);
    const dayStart = new Date(`${input.scheduledDate}T00:00:00.000Z`);
    dayStart.setUTCHours(hours || 8, minutes || 0, 0, 0);

    const bookingCode = `BOOK-${Date.now().toString(36).toUpperCase()}-${Math.floor(
      Math.random() * 1000,
    )}`;

    try {
      return await this.attemptBooking(
        input,
        dayStart,
        durationMinutes,
        bookingCode,
      );
    } catch (err: any) {
      if (
        err?.code === '23505' ||
        err?.message?.includes('unique') ||
        err?.message?.includes('duplicate')
      ) {
        this.logger.warn(
          `Queue collision detected for practitioner ${input.practitionerId}. Retrying with next queue number.`,
        );
        return await this.attemptBooking(
          input,
          dayStart,
          durationMinutes,
          bookingCode,
        );
      }
      throw err;
    }
  }

  private async attemptBooking(
    input: BookAppointmentInput,
    dayStart: Date,
    durationMinutes: number,
    bookingCode: string,
  ): Promise<AppointmentRecord> {
    const queueNumber = await this.appointmentRepo.getNextQueueNumber(
      input.practitionerId,
      input.scheduledDate,
    );

    const planned = planAppointmentTiming({
      dayStart,
      queueNumber,
      durationMinutes,
    });

    return await this.appointmentRepo.createWithTiming({
      bookingCode,
      patientId: input.patientId,
      practitionerId: input.practitionerId,
      serviceId: input.serviceId,
      poliklinikId: input.poliklinikId,
      roomId: null,
      scheduledDate: input.scheduledDate,
      queueNumber,
      estimatedStartAt: planned.estimatedStartAt,
      estimatedEndAt: planned.estimatedEndAt,
      notes: input.notes,
    });
  }
}
