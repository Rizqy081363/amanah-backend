import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  practitionerLeavePeriods,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
} from '@database/schema';
import { ACTIVE_APPOINTMENT_STATUSES } from '@modules/schedules/domain/constants/schedule.constants';
import {
  type RescheduleEligibilityEntity,
  type RescheduleSourceSessionInfo,
  ScheduleOperationalStatus,
} from '@modules/schedules/domain/entities/schedule.entity';
import { ScheduleSessionFactory } from '@modules/schedules/domain/factories/schedule-session.factory';
import {
  resolveSessionOperationalStatus,
  SchedulePersistenceStatus,
} from '@modules/schedules/domain/schedule-status';
import { ScheduleConflictQuery } from '@modules/schedules/infrastructure/drizzle/queries/schedule-conflict.query';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import type { CheckRescheduleEligibilityQueryDto } from '@modules/schedules/presentation/dto/check-reschedule-eligibility-query.dto';
import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { and, eq, gt, gte, inArray, lt, lte, not, or } from 'drizzle-orm';

@Injectable()
export class DrizzleRescheduleEligibilityEvaluator {
  private readonly practitionerResolver: PractitionerResolver;
  private readonly conflictQuery: ScheduleConflictQuery;

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    @Optional() practitionerResolver?: PractitionerResolver,
    @Optional() conflictQuery?: ScheduleConflictQuery,
  ) {
    this.practitionerResolver =
      practitionerResolver ?? new PractitionerResolver(db);
    this.conflictQuery = conflictQuery ?? new ScheduleConflictQuery(db);
  }

  async evaluate(
    id: string,
    sessionId: string,
    query: CheckRescheduleEligibilityQueryDto,
  ): Promise<RescheduleEligibilityEntity> {
    const practitioner = await this.practitionerResolver.resolve(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }

    const session = await this.db.query.practitionerScheduleSessions.findFirst({
      where: and(
        eq(practitionerScheduleSessions.id, sessionId),
        eq(practitionerScheduleSessions.practitionerId, practitioner.id),
      ),
      with: {
        clinicRoom: true,
      },
    });

    if (!session) {
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan untuk dokter ini`,
      );
    }

    const sourceDate = session.scheduleDate;
    const sessStart =
      session.startTime.length === 5
        ? `${session.startTime}:00`
        : session.startTime;
    const sessEnd =
      session.endTime.length === 5 ? `${session.endTime}:00` : session.endTime;

    const [sourceDaySetting, sourceLeave, activeAppts] = await Promise.all([
      this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitioner.id),
          eq(practitionerScheduleDaySettings.scheduleDate, sourceDate),
        ),
      }),
      this.db.query.practitionerLeavePeriods.findFirst({
        where: and(
          eq(practitionerLeavePeriods.practitionerId, practitioner.id),
          lte(practitionerLeavePeriods.startDate, sourceDate),
          gte(practitionerLeavePeriods.endDate, sourceDate),
        ),
      }),
      this.db.query.appointments.findMany({
        where: and(
          or(
            eq(appointments.scheduleSessionId, sessionId),
            and(
              eq(appointments.practitionerId, practitioner.id),
              eq(appointments.scheduledDate, sourceDate),
              gte(appointments.scheduledStartTime, sessStart),
              lt(appointments.scheduledStartTime, sessEnd),
            ),
          ),
          inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
        ),
      }),
    ]);

    const isSourceCuti = Boolean(sourceDaySetting?.isLeave || sourceLeave);
    const sourceStatus = resolveSessionOperationalStatus({
      isClosedForLeave: isSourceCuti,
      availableSlots: session.availableSlots ?? 0,
      persistedStatus: session.status,
    });
    const isSourceClosed = sourceStatus === ScheduleOperationalStatus.CLOSED;

    let isSourceEligible = true;
    let rejectionReason: string | null = null;

    if (isSourceClosed) {
      isSourceEligible = false;
      rejectionReason =
        'Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi.';
    } else if (isSourceCuti) {
      isSourceEligible = false;
      rejectionReason =
        'Sesi berstatus Cuti. Cuti dokter tidak dapat di-reschedule.';
    }

    let roomName = 'Belum Ditentukan';
    if (session.clinicRoom) {
      roomName = `${session.clinicRoom.name}${session.clinicRoom.location ? `, ${session.clinicRoom.location}` : ''}`;
    } else if (session.roomId || practitioner.defaultRoomId) {
      const room = await this.db.query.clinicRooms.findFirst({
        where: eq(
          clinicRooms.id,
          (session.roomId || practitioner.defaultRoomId)!,
        ),
      });
      if (room) {
        roomName = `${room.name}${room.location ? `, ${room.location}` : ''}`;
      }
    }

    const sourceSessionInfo: RescheduleSourceSessionInfo = {
      id: session.id,
      scheduleDate: session.scheduleDate,
      startTime: session.startTime.slice(0, 5),
      endTime: session.endTime.slice(0, 5),
      timeRange: `${session.startTime.slice(0, 5)} - ${session.endTime.slice(0, 5)} WIB`,
      status: session.status,
      statusLabel: sourceStatus,
      sessionLabel: session.sessionLabel || 'Sesi Praktik',
      sessionShift: session.sessionShift || 'morning',
      roomName,
      activeAppointmentsCount: activeAppts.length,
      isSourceEligible,
      rejectionReason,
    };

    const targetValidation = {
      evaluated: false,
      targetDate: query.targetDate || null,
      targetStartTime: query.targetStartTime || null,
      projectedEndTime: null as string | null,
      targetRoomId: query.targetRoomId || null,
      targetRoomName: null as string | null,
      isTargetEligible: true,
      conflictCode: null as string | null,
      conflictMessage: null as string | null,
      conflictMetadata: null as Record<string, any> | null,
    };

    if (query.targetDate && query.targetStartTime) {
      targetValidation.evaluated = true;

      try {
        const targetContext = ScheduleSessionFactory.resolveShiftFromClockTime(
          query.targetStartTime,
        );
        const durationMinutes =
          practitioner.consultationDurationMinutes &&
          practitioner.consultationDurationMinutes > 0
            ? practitioner.consultationDurationMinutes
            : 30;

        const timing = ScheduleSessionFactory.calculateSessionTiming(
          targetContext,
          query.targetStartTime,
          { durationMinutes },
        );

        const targetEndTime = timing.endTime;
        targetValidation.projectedEndTime = targetEndTime;

        const targetRoomId =
          query.targetRoomId ||
          session.roomId ||
          practitioner.defaultRoomId ||
          null;
        targetValidation.targetRoomId = targetRoomId;

        if (targetRoomId) {
          const room = await this.db.query.clinicRooms.findFirst({
            where: eq(clinicRooms.id, targetRoomId),
          });
          if (room) {
            targetValidation.targetRoomName = `${room.name}${room.location ? `, ${room.location}` : ''}`;
          }
        }

        const [targetDaySetting, targetLeave] = await Promise.all([
          this.db.query.practitionerScheduleDaySettings.findFirst({
            where: and(
              eq(
                practitionerScheduleDaySettings.practitionerId,
                practitioner.id,
              ),
              eq(
                practitionerScheduleDaySettings.scheduleDate,
                query.targetDate,
              ),
            ),
          }),
          this.db.query.practitionerLeavePeriods.findFirst({
            where: and(
              eq(practitionerLeavePeriods.practitionerId, practitioner.id),
              lte(practitionerLeavePeriods.startDate, query.targetDate),
              gte(practitionerLeavePeriods.endDate, query.targetDate),
            ),
          }),
        ]);

        if (targetDaySetting?.isLeave || targetLeave) {
          targetValidation.isTargetEligible = false;
          targetValidation.conflictCode = 'DATE_CLOSED';
          targetValidation.conflictMessage =
            'Jadwal tidak dapat di-reschedule karena dokter tercatat sedang cuti pada tanggal target.';
          targetValidation.conflictMetadata = {
            targetDate: query.targetDate,
            closedReason: 'LEAVE',
          };
        } else {
          const targetStartSec =
            query.targetStartTime.length === 5
              ? `${query.targetStartTime}:00`
              : query.targetStartTime;
          const targetEndSec =
            targetEndTime.length === 5 ? `${targetEndTime}:00` : targetEndTime;

          const candidateSessions =
            await this.db.query.practitionerScheduleSessions.findMany({
              where: and(
                eq(
                  practitionerScheduleSessions.practitionerId,
                  practitioner.id,
                ),
                eq(practitionerScheduleSessions.scheduleDate, query.targetDate),
                eq(
                  practitionerScheduleSessions.status,
                  SchedulePersistenceStatus.OPEN,
                ),
              ),
            });

          const existingTargetSession = candidateSessions.find((s) => {
            const sStart =
              s.startTime.length === 5 ? `${s.startTime}:00` : s.startTime;
            const sEnd = s.endTime.length === 5 ? `${s.endTime}:00` : s.endTime;
            return sStart <= targetStartSec && sEnd >= targetEndSec;
          });

          if (existingTargetSession) {
            const targetSlotOccupied =
              await this.db.query.appointments.findFirst({
                where: and(
                  eq(appointments.practitionerId, practitioner.id),
                  eq(appointments.scheduledDate, query.targetDate),
                  eq(appointments.scheduledStartTime, targetStartSec),
                  inArray(appointments.status, [
                    ...ACTIVE_APPOINTMENT_STATUSES,
                  ]),
                ),
              });
            if (targetSlotOccupied) {
              targetValidation.isTargetEligible = false;
              targetValidation.conflictCode = 'SLOT_ALREADY_OCCUPIED';
              targetValidation.conflictMessage = `Slot waktu ${query.targetStartTime} sudah terisi oleh janji temu pasien lain.`;
            } else if (targetRoomId) {
              const otherDoctorInRoom =
                await this.db.query.practitionerScheduleSessions.findFirst({
                  where: and(
                    eq(practitionerScheduleSessions.roomId, targetRoomId),
                    eq(
                      practitionerScheduleSessions.scheduleDate,
                      query.targetDate,
                    ),
                    eq(
                      practitionerScheduleSessions.status,
                      SchedulePersistenceStatus.OPEN,
                    ),
                    not(
                      eq(
                        practitionerScheduleSessions.practitionerId,
                        practitioner.id,
                      ),
                    ),
                    lt(practitionerScheduleSessions.startTime, targetEndSec),
                    gt(practitionerScheduleSessions.endTime, targetStartSec),
                  ),
                  with: {
                    practitioner: { with: { staffProfile: true } },
                    clinicRoom: true,
                  },
                });
              if (otherDoctorInRoom) {
                const roomName =
                  otherDoctorInRoom.clinicRoom?.name || 'Ruangan';
                const docName =
                  otherDoctorInRoom.practitioner?.staffProfile?.fullName ||
                  otherDoctorInRoom.practitioner?.displayName ||
                  'Dokter lain';
                targetValidation.isTargetEligible = false;
                targetValidation.conflictCode = 'ROOM_ALREADY_OCCUPIED';
                targetValidation.conflictMessage = `${roomName} sudah dijadwalkan untuk ${docName} pada jam ${query.targetStartTime} - ${targetEndTime}.`;
              }
            }
          } else {
            await this.conflictQuery.checkConflicts(
              practitioner.id,
              query.targetDate,
              query.targetStartTime,
              targetEndTime,
              targetRoomId,
              sessionId,
            );
          }
        }
      } catch (err: any) {
        targetValidation.isTargetEligible = false;
        targetValidation.conflictCode =
          err.response?.code || err.code || 'CONFLICT';
        targetValidation.conflictMessage =
          err.response?.message || err.message || 'Konflik jadwal terdeteksi';
        targetValidation.conflictMetadata = err.response?.metadata || null;
      }
    }

    const isEligible =
      isSourceEligible &&
      (!targetValidation.evaluated || targetValidation.isTargetEligible);

    let actionableGuidance: string;
    if (!isSourceEligible) {
      actionableGuidance = rejectionReason!;
    } else if (
      targetValidation.evaluated &&
      !targetValidation.isTargetEligible
    ) {
      actionableGuidance = targetValidation.conflictMessage!;
    } else if (
      targetValidation.evaluated &&
      targetValidation.isTargetEligible
    ) {
      actionableGuidance =
        'Sesi dan target waktu memenuhi syarat untuk di-reschedule. Silakan lanjutkan konfirmasi.';
    } else {
      actionableGuidance =
        'Sesi memenuhi syarat untuk di-reschedule. Silakan tentukan tanggal dan jam target baru.';
    }

    const practitionerName =
      practitioner.staffProfile?.fullName ||
      practitioner.displayName ||
      'Dokter Amanah';

    return {
      sessionId: session.id,
      practitionerId: practitioner.id,
      practitionerName,
      isEligible,
      sourceSession: sourceSessionInfo,
      targetValidation,
      actionableGuidance,
    };
  }
}
