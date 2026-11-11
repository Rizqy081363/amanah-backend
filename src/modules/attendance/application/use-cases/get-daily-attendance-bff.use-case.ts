import { Inject, Injectable, Optional } from '@nestjs/common';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { ATTENDANCE_STATUS } from '../../domain/constants/attendance.constants';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceBFFResponse,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';
import type { StaffAttendanceMilestone } from '../../domain/types/attendance-milestone.type';
import { AttendanceMetricsCalculator } from '../services/attendance-metrics.calculator';
import { GetStaffAttendanceMilestonesUseCase } from './get-staff-attendance-milestones.use-case';
import { RotateQrSessionUseCase } from './rotate-qr-session.use-case';

export interface GetDailyAttendanceBffQuery {
  date?: string;
  shift?: string;
  status?: string;
  roleId?: string;
  category?: string;
  search?: string;
}

@Injectable()
export class GetDailyAttendanceBffUseCase {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
    private readonly metricsCalculator: AttendanceMetricsCalculator,
    private readonly rotateQrUseCase: RotateQrSessionUseCase,
    private readonly clinicTimeService: ClinicTimeService,
    @Optional()
    private readonly milestonesUseCase?: GetStaffAttendanceMilestonesUseCase,
  ) {}

  async execute(
    query: GetDailyAttendanceBffQuery,
  ): Promise<AttendanceBFFResponse> {
    const targetDate = query.date
      ? this.clinicTimeService
        ? this.clinicTimeService.normalizeDate(query.date)
        : query.date
      : (this.clinicTimeService?.today() ??
        new Date().toISOString().split('T')[0]);

    const targetDateObj = new Date(targetDate + 'T12:00:00Z');
    const dow = targetDateObj.getDay();

    // 1. Fetch real attendance records for targetDate with attached staff profiles
    const attendanceList = await this.repo.findDailyWithStaff(targetDate);

    // 2. Calculate Real-Data Metrics (Zero Fake Math, Zero Synthetic Days)
    const metrics = await this.metricsCalculator.calculateMetrics({
      targetDate,
      dow,
      attendanceList,
    });

    // 3. DB-Driven Filter Options & Authoritative Historical Shift Definitions (SSOT)
    const availableFilters = await this.repo.getAvailableFilterOptions();
    const shiftLabelMap = await this.repo.getAllShiftLabelsMap();
    const allSessions = await this.repo.findAllActiveSessions();
    const sessionEndsMap = new Map<string, string>();
    for (const s of allSessions) {
      if (s.defaultEndsAt) {
        sessionEndsMap.set(s.id, s.defaultEndsAt);
        if (s.code) sessionEndsMap.set(s.code, s.defaultEndsAt);
      }
    }

    const now = this.clinicTimeService?.nowDate() ?? new Date();
    const activeDef = await this.repo.resolveSessionDefByTime(now, 30);
    const currentShift = activeDef
      ? {
          id: activeDef.id,
          code: activeDef.code,
          label: activeDef.label,
          defaultStartsAt: activeDef.defaultStartsAt,
          defaultEndsAt: activeDef.defaultEndsAt,
        }
      : null;

    // 4. Map Table Records strictly from actual attendanceList (No Dummy Padding)
    let tableRecords = attendanceList.map((rec) => {
      const staff = rec.staffProfile;
      const shift = rec.shift;
      const status = rec.status;
      const canonicalShiftLabel =
        (rec.sessionId && shiftLabelMap.get(rec.sessionId)) ||
        (shift && shiftLabelMap.get(shift)) ||
        '-';

      let isOverdueCheckOut = false;
      let overdueMinutes = 0;
      let scheduledEndsAt: string | null = null;

      if (
        (status === ATTENDANCE_STATUS.PRESENT ||
          status === ATTENDANCE_STATUS.LATE) &&
        rec.checkInAt &&
        !rec.checkOutAt
      ) {
        const scheduledEndStr =
          (rec.sessionId && sessionEndsMap.get(rec.sessionId)) ||
          (shift && sessionEndsMap.get(shift)) ||
          null;

        if (scheduledEndStr && rec.attendanceDate) {
          scheduledEndsAt = scheduledEndStr;
          const shiftEnd = this.clinicTimeService.parseClinicDateTime(
            rec.attendanceDate,
            scheduledEndStr,
          );
          if (now.getTime() > shiftEnd.getTime()) {
            isOverdueCheckOut = true;
            overdueMinutes = Math.floor(
              (now.getTime() - shiftEnd.getTime()) / (1000 * 60),
            );
          }
        }
      }

      let checkInFormatted = '-';
      if (rec.checkInAt) {
        const d = new Date(rec.checkInAt);
        checkInFormatted = `${this.clinicTimeService.formatTime(d)} ${this.clinicTimeService.getTimezoneAbbreviation(d)}`;
      }

      const roleName = staff?.role?.name || null;
      const roleCode = staff?.role?.code || null;
      const roleId = staff?.roleId || staff?.role?.id || null;
      const isClinical = staff?.role?.isClinical ?? false;

      return {
        id: rec.id,
        id_staf: staff?.staffCode || '-',
        staffProfileId: rec.staffProfileId,
        nama_staf: staff?.fullName || '',
        avatar:
          staff?.avatarUrl ||
          (staff?.userId ? `/api/v1/users/${staff.userId}/avatar` : undefined),
        roleId,
        roleCode,
        roleName,
        isClinical,
        kategori: roleName || '',
        tanggal_presensi: rec.attendanceDate,
        waktu_presensi: checkInFormatted,
        checkInAt: rec.checkInAt ? new Date(rec.checkInAt).toISOString() : null,
        checkOutAt: rec.checkOutAt
          ? new Date(rec.checkOutAt).toISOString()
          : null,
        status: status,
        shift: shift,
        shiftLabel: canonicalShiftLabel,
        sessionName: canonicalShiftLabel,
        validatedDurationHours: rec.validatedDurationHours
          ? Number(rec.validatedDurationHours)
          : 0,
        lateMinutes: rec.lateMinutes ?? 0,
        isOverdueCheckOut,
        overdueMinutes,
        scheduledEndsAt,
        isReplacement: Boolean(rec.isReplacement),
        replacementOpportunityId: rec.replacementOpportunityId || null,
        replacedStaffName:
          rec.replacementOpportunity?.originalStaffProfile?.fullName || null,
        replacedStaffCode:
          rec.replacementOpportunity?.originalStaffProfile?.staffCode || null,
        isEarlyDeparture: Boolean(rec.isEarlyDeparture),
        notes: rec.notes || null,
      };
    });

    // 4b. Pre-calculate milestones for each staff member present on targetDate
    if (this.milestonesUseCase && tableRecords.length > 0) {
      const staffProfileIds = Array.from(
        new Set(
          tableRecords
            .map((r) => r.staffProfileId)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const staffMilestonesMap = new Map<string, StaffAttendanceMilestone[]>();
      await Promise.all(
        staffProfileIds.map(async (staffId) => {
          try {
            const m = await this.milestonesUseCase!.execute({
              staffProfileId: staffId,
              date: targetDate,
            });
            staffMilestonesMap.set(staffId, m);
          } catch {
            // ignore
          }
        }),
      );

      for (const r of tableRecords) {
        if (r.staffProfileId && staffMilestonesMap.has(r.staffProfileId)) {
          (r as any).milestones = staffMilestonesMap.get(r.staffProfileId);
        }
      }
    }

    // 5. Apply in-memory filters
    if (query.search) {
      const q = query.search.toLowerCase();
      tableRecords = tableRecords.filter(
        (r) =>
          r.nama_staf.toLowerCase().includes(q) ||
          r.id_staf.toLowerCase().includes(q),
      );
    }

    if (query.roleId && query.roleId !== 'all') {
      tableRecords = tableRecords.filter((r) => r.roleId === query.roleId);
    }

    if (query.category && query.category !== 'all') {
      const cat = query.category.toLowerCase();
      tableRecords = tableRecords.filter(
        (r) =>
          r.roleCode?.toLowerCase() === cat ||
          r.roleId === query.category ||
          r.roleName?.toLowerCase() === cat,
      );
    }

    if (query.status && query.status !== 'all') {
      const st = query.status.toLowerCase();
      tableRecords = tableRecords.filter((r) => r.status.toLowerCase() === st);
    }

    if (query.shift && query.shift !== 'all') {
      if (query.shift === 'current') {
        if (currentShift?.code) {
          const currentCode = currentShift.code.toLowerCase();
          tableRecords = tableRecords.filter(
            (r) => r.shift && r.shift.toLowerCase() === currentCode,
          );
        } else {
          // If outside operational shift hours, return honest empty records
          tableRecords = [];
        }
      } else {
        const sh = query.shift.toLowerCase();
        tableRecords = tableRecords.filter(
          (r) => r.shift && r.shift.toLowerCase() === sh,
        );
      }
    }

    // 6. Active QR Session config for Terminal (Decoupled read-model: outside shift hours returns dormant standby terminal)
    const activeQr = await this.rotateQrUseCase.getActiveSessionOrNull();

    return {
      records: tableRecords,
      total: tableRecords.length,
      currentShift,
      summary: {
        total_staf: metrics.totalStaffCount,
        staf_hadir: metrics.presentCount,
        staf_tidak_hadir: metrics.absentCount,
        tingkat_kehadiran: metrics.attendanceRate,
        perubahan_total_staf: 0,
        perubahan_staf_hadir: metrics.deltaPresent,
        perubahan_staf_tidak_hadir: metrics.deltaAbsent,
        perubahan_tingkat_kehadiran: metrics.deltaRate,
        sparkline_total_staf: metrics.sparklineTotal,
        sparkline_staf_hadir: metrics.sparklinePresent,
        sparkline_staf_tidak_hadir: metrics.sparklineAbsent,
        sparkline_tingkat_kehadiran: metrics.sparklineRate,
      },
      qrConfig: {
        status: activeQr && activeQr.isActive ? 'active' : 'inactive',
        isActive: Boolean(activeQr && activeQr.isActive),
        qr_code_identifier: activeQr?.qrCodeIdentifier ?? '',
        qr_context:
          activeQr?.context ?? 'Terminal Standby (Di Luar Jam Operasional)',
        qr_validity: activeQr?.validUntil
          ? activeQr.validUntil.toLocaleTimeString('id-ID')
          : '-',
        validUntil: activeQr?.validUntil
          ? activeQr.validUntil.toISOString()
          : undefined,
        rotation_seconds: activeQr?.rotationSeconds ?? 0,
      },
      availableFilters,
    };
  }
}
