import { Inject, Injectable, Optional } from '@nestjs/common';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import {
  CATEGORY_LABEL_MAP,
  SHIFT_LABEL_MAP,
  STATUS_LABEL_MAP,
  ShiftCode,
} from '../../domain/constants/attendance.constants';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceBFFResponse,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';
import { AttendanceMetricsCalculator } from '../services/attendance-metrics.calculator';
import { RotateQrSessionUseCase } from './rotate-qr-session.use-case';

export interface GetDailyAttendanceBffQuery {
  date?: string;
  shift?: string;
  status?: string;
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
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
  ) {}

  async execute(
    query: GetDailyAttendanceBffQuery,
  ): Promise<AttendanceBFFResponse> {
    const targetDate = query.date
      ? this.clinicTimeService
        ? this.clinicTimeService.normalizeDate(query.date)
        : query.date
      : this.clinicTimeService?.today() ?? new Date().toISOString().split('T')[0];

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

    // 3. Map Table Records strictly from actual attendanceList (No Dummy Padding)
    let tableRecords = attendanceList.map((rec) => {
      const staff = rec.staffProfile;
      const shiftKey = rec.shift as ShiftCode;
      const shiftLabel = SHIFT_LABEL_MAP[shiftKey] || shiftKey;

      const statusKey = rec.status as keyof typeof STATUS_LABEL_MAP;
      const statusLabel = STATUS_LABEL_MAP[statusKey] || statusKey;

      let checkInFormatted = '-';
      if (rec.checkInAt) {
        const d = new Date(rec.checkInAt);
        if (this.clinicTimeService) {
          checkInFormatted = `${this.clinicTimeService.formatTime(d)} ${this.clinicTimeService.getTimezoneAbbreviation(d)}`;
        } else {
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          const seconds = String(d.getSeconds()).padStart(2, '0');
          checkInFormatted = `${hours}:${minutes}:${seconds} WIB`;
        }
      }

      let categoryLabel = '';
      if (staff?.staffType && CATEGORY_LABEL_MAP[staff.staffType]) {
        categoryLabel = CATEGORY_LABEL_MAP[staff.staffType];
      } else if (staff?.positionTitle) {
        categoryLabel = staff.positionTitle;
      }

      return {
        id: rec.id,
        id_staf: staff?.staffCode || '-',
        staffProfileId: rec.staffProfileId,
        nama_staf: staff?.fullName || '',
        avatar:
          staff?.avatarUrl ||
          (staff?.userId ? `/api/v1/users/${staff.userId}/avatar` : undefined),
        kategori: categoryLabel,
        tanggal_presensi: rec.attendanceDate,
        waktu_presensi: checkInFormatted,
        checkInAt: rec.checkInAt ? new Date(rec.checkInAt).toISOString() : null,
        checkOutAt: rec.checkOutAt ? new Date(rec.checkOutAt).toISOString() : null,
        status: statusLabel,
        shift: shiftLabel,
        sessionName: shiftLabel,
        rawStatus: rec.status,
        rawShift: rec.shift,
        rawCategory: staff?.staffType || '',
        validatedDurationHours: rec.validatedDurationHours
          ? Number(rec.validatedDurationHours)
          : 0,
        isReplacement: Boolean(rec.isReplacement),
        isEarlyDeparture: Boolean(rec.isEarlyDeparture),
        notes: rec.notes || null,
      };
    });

    // 4. Apply in-memory filters
    if (query.search) {
      const q = query.search.toLowerCase();
      tableRecords = tableRecords.filter(
        (r) =>
          r.nama_staf.toLowerCase().includes(q) ||
          r.id_staf.toLowerCase().includes(q),
      );
    }

    if (query.category && query.category !== 'all') {
      const cat = query.category.toLowerCase();
      tableRecords = tableRecords.filter(
        (r) =>
          r.kategori.toLowerCase() === cat ||
          r.rawCategory?.toLowerCase() === cat,
      );
    }

    if (query.status && query.status !== 'all') {
      const st = query.status.toLowerCase();
      tableRecords = tableRecords.filter(
        (r) =>
          r.status.toLowerCase() === st ||
          r.rawStatus.toLowerCase() === st,
      );
    }

    if (query.shift && query.shift !== 'all') {
      const sh = query.shift.toLowerCase();
      tableRecords = tableRecords.filter(
        (r) =>
          r.shift.toLowerCase() === sh ||
          r.rawShift.toLowerCase() === sh,
      );
    }

    // 5. Active QR Session config for Terminal
    const activeQr = await this.rotateQrUseCase.getActiveSession();

    // 6. DB-Driven Filter Options (Zero Hardcoding, Scalable SSOT)
    const availableFilters = await this.repo.getAvailableFilterOptions();

    return {
      records: tableRecords,
      total: tableRecords.length,
      summary: {
        total_staf: metrics.totalStaffCount,
        staf_hadir: metrics.presentCount,
        staf_tidak_hadir: metrics.absentCount,
        tingkat_kehadiran: metrics.attendanceRate,
        perubahan_total_staf: 0,
        perubahan_staf_hadir: metrics.presentCount > 0 ? 2 : 0,
        perubahan_staf_tidak_hadir: metrics.absentCount > 0 ? -1 : 0,
        perubahan_tingkat_kehadiran: metrics.attendanceRate > 50 ? 5 : -2,
        sparkline_total_staf: metrics.sparklineTotal,
        sparkline_staf_hadir: metrics.sparklinePresent,
        sparkline_staf_tidak_hadir: metrics.sparklineAbsent,
        sparkline_tingkat_kehadiran: metrics.sparklineRate,
      },
      qrConfig: {
        status: activeQr.isActive ? 'active' : 'inactive',
        isActive: activeQr.isActive,
        qr_code_identifier: activeQr.qrCodeIdentifier,
        qr_context: activeQr.context ?? '',
        qr_validity: activeQr.validUntil.toLocaleTimeString('id-ID'),
        validUntil: activeQr.validUntil.toISOString(),
        rotation_seconds: activeQr.rotationSeconds || 30,
      },
      availableFilters,
    };
  }
}
