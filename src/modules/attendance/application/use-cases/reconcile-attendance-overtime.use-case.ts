import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import {
  PAYROLL_REPOSITORY,
  PayrollRepository,
} from '../../../payroll/domain/repositories/payroll.repository';
import { calculateSessionNetHours } from '../../../schedules/domain/services/shift-duration.helper';
import {
  ATTENDANCE_ACTIONS,
  RECONCILE_DECISION,
  type ReconcileDecision,
} from '../../domain/constants/attendance.constants';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';
import { AttendanceNotificationService } from '../services/attendance-notification.service';

export type { ReconcileDecision };

export interface ReconcileAttendanceOvertimeInput {
  attendanceId: string;
  decision: ReconcileDecision;
  overtimeHours?: number;
  adminNotes?: string;
  adminUserId: string;
}

export interface ReconcileAttendanceOvertimeResult {
  attendance: AttendanceEntity;
  decision: ReconcileDecision;
  overtimeHours: number;
  validatedDurationHours: number;
  overtimeAmount: number;
  reconciledAt: string;
}

@Injectable()
export class ReconcileAttendanceOvertimeUseCase {
  private readonly logger = new Logger(ReconcileAttendanceOvertimeUseCase.name);

  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
    private readonly notificationService: AttendanceNotificationService,
    private readonly clinicConfigService: ClinicConfigService,
    private readonly clinicTimeService: ClinicTimeService,
    @Optional()
    @Inject(PAYROLL_REPOSITORY)
    private readonly payrollRepo?: PayrollRepository,
  ) {}

  async execute(
    input: ReconcileAttendanceOvertimeInput,
  ): Promise<ReconcileAttendanceOvertimeResult> {
    const record = await this.repo.findById(input.attendanceId);
    if (!record) {
      throw new NotFoundException(
        `Catatan presensi dengan ID ${input.attendanceId} tidak ditemukan.`,
      );
    }

    if (!record.checkInAt) {
      throw new BadRequestException(
        'Catatan presensi belum memiliki waktu check-in sehingga tidak dapat direkonsiliasi durasi lemburnya.',
      );
    }

    // Resolve staff profile
    const staff = await this.repo.resolveStaffByIdOrCode(record.staffId);
    if (!staff) {
      throw new NotFoundException(
        `Profil staf untuk ID ${record.staffId} tidak ditemukan.`,
      );
    }

    // Resolve scheduled session parameters directly from DB
    const sessionDef = record.sessionId
      ? await this.repo.resolveSessionDefById(record.sessionId)
      : record.shift
        ? await this.repo.resolveSessionDefByCode(record.shift)
        : null;

    if (!sessionDef) {
      throw new NotFoundException(
        `Definisi sesi dinas untuk presensi ini (${record.shift || record.sessionId}) tidak ditemukan di database.`,
      );
    }

    const breakConfig = await this.clinicConfigService.getRosterBreakConfig();
    const scheduledShiftDurationHours = calculateSessionNetHours({
      startsAt: sessionDef.defaultStartsAt,
      endsAt: sessionDef.defaultEndsAt,
      breakMinutes: breakConfig.breakDurationMinutes,
      isBreakPaid: breakConfig.isBreakPaid,
    });

    const shiftEnd = this.clinicTimeService.parseClinicDateTime(
      record.attendanceDate,
      sessionDef.defaultEndsAt,
    );

    const now = this.clinicTimeService.nowDate();
    const nowIso = now.toISOString();

    const isApproved = input.decision === RECONCILE_DECISION.APPROVED_OVERTIME;
    const trimmedNotes = input.adminNotes?.trim() || null;

    let overtimeHours = 0;
    let validatedDurationHours = scheduledShiftDurationHours;
    let checkOutTimestamp = record.checkOutAt
      ? record.checkOutAt.toISOString()
      : nowIso;
    let overtimeAmount = 0;
    let noteSuffix = '';

    if (isApproved) {
      if (input.overtimeHours !== undefined && input.overtimeHours > 0) {
        overtimeHours = Number(input.overtimeHours.toFixed(2));
      } else {
        const actualOut = record.checkOutAt ?? now;
        if (actualOut.getTime() > shiftEnd.getTime()) {
          const diffMs = actualOut.getTime() - shiftEnd.getTime();
          overtimeHours = Number(
            Math.max(0, diffMs / (1000 * 60 * 60)).toFixed(2),
          );
        }
      }

      validatedDurationHours = Number(
        (scheduledShiftDurationHours + overtimeHours).toFixed(2),
      );
      noteSuffix = `[Rekonsiliasi: Lembur Disetujui ${overtimeHours} jam${trimmedNotes ? ` - ${trimmedNotes}` : ''}]`;
    } else {
      // Decision: rejected_overtime (Forgotten check-out adjusted to scheduled shift end)
      overtimeHours = 0;
      validatedDurationHours = scheduledShiftDurationHours;

      if (!record.checkOutAt) {
        if (record.checkInAt.getTime() > shiftEnd.getTime()) {
          throw new BadRequestException(
            'Waktu check-in tidak valid: check-in berada setelah jam akhir shift operasional berakhir.',
          );
        }
        checkOutTimestamp = shiftEnd.toISOString();
      }

      noteSuffix = `[Rekonsiliasi: Lupa Check-out - Disesuaikan Jam Normal${trimmedNotes ? ` - ${trimmedNotes}` : ''}]`;
    }

    const finalNotes = record.notes
      ? `${record.notes} | ${noteSuffix}`
      : noteSuffix;

    // 1. Persist updated attendance record
    const updatedRecord = await this.repo.updateAttendanceRecord(record.id, {
      checkOutAt: checkOutTimestamp,
      validatedDurationHours: validatedDurationHours.toFixed(2),
      notes: finalNotes,
      recordedBy: input.adminUserId,
      updatedAt: nowIso,
    });

    // 2. Synchronize Payroll Ledger
    if (this.payrollRepo) {
      try {
        await this.payrollRepo.recordAttendanceShift({
          attendanceRecordId: record.id,
          staffProfileId: staff.id,
          practitionerId: staff.practitionerId ?? null,
          attendanceDate: record.attendanceDate,
          validatedDurationHours: scheduledShiftDurationHours,
          isReplacement: record.isReplacement,
        });

        if (isApproved && overtimeHours > 0) {
          const entry = await this.payrollRepo.recordOvertimeAddition({
            attendanceRecordId: record.id,
            staffProfileId: staff.id,
            practitionerId: staff.practitionerId ?? null,
            attendanceDate: record.attendanceDate,
            overtimeHours,
            shiftLabel: sessionDef.label,
            notes: trimmedNotes || undefined,
          });
          overtimeAmount = Number(entry.amount || 0);
        } else {
          await this.payrollRepo.removeOvertimeAddition(record.id);
        }
      } catch (payrollErr) {
        this.logger.error(
          `Failed to synchronize payroll for attendance reconciliation: ${String(payrollErr)}`,
        );
      }
    }

    // 3. Dispatch targeted notification to staff
    updatedRecord.shiftLabel = sessionDef.label;
    void this.notificationService.dispatchNotification(
      updatedRecord,
      ATTENDANCE_ACTIONS.RECONCILED,
      {
        fullName: staff.fullName,
        staffCode: staff.staffCode,
        userId: staff.userId,
        roleId: staff.roleId,
        roleCode: staff.roleCode,
        roleName: staff.roleName,
        isClinical: staff.isClinical,
        positionTitle: staff.positionTitle,
        avatarUrl: staff.avatarUrl,
        earnedAmount: overtimeAmount,
        shiftLabel: sessionDef.label,
      },
    );

    return {
      attendance: updatedRecord,
      decision: input.decision,
      overtimeHours,
      validatedDurationHours,
      overtimeAmount,
      reconciledAt: nowIso,
    };
  }
}
