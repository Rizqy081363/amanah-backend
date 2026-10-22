import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { staffAttendanceRecords, staffProfiles } from '../../../../database/schema/amanah.schema';
import { ExportSource } from '../../domain/export-source.interface';
import {
  SHIFT_LABEL_MAP,
  STATUS_LABEL_MAP,
  normalizeShift,
  normalizeStatus,
} from '../../../attendance/domain/constants/attendance.constants';

@Injectable()
export class AttendanceExportSource implements ExportSource {
  readonly type = 'attendance';

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  getTitle(params: Record<string, any>): string {
    return 'Laporan Rekapitulasi Riwayat Presensi Pegawai';
  }

  getSubtitle(params: Record<string, any>): string {
    if (params.periodLabel) {
      return `Periode: ${params.periodLabel}`;
    }
    const start = params.startDate ? `Mulai: ${params.startDate}` : '';
    const end = params.endDate ? `Sampai: ${params.endDate}` : '';
    return [start, end].filter(Boolean).join(' | ') || 'Seluruh Arsip Presensi Terkalkulasi';
  }

  getHeaders(): string[] {
    return [
      'No',
      'Nama Pegawai',
      'Kode Pegawai',
      'Tanggal',
      'Shift Kerja',
      'Jam Masuk',
      'Jam Pulang',
      'Keterlambatan (Mnt)',
      'Durasi Efektif (Jam)',
      'Status Kehadiran',
      'Unit / Lokasi',
    ];
  }

  private async resolveStaffProfileId(userId: string, explicitStaffId?: string): Promise<string | null> {
    if (explicitStaffId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(explicitStaffId);
      if (isUuid) return explicitStaffId;

      const [found] = await this.db
        .select({ id: staffProfiles.id })
        .from(staffProfiles)
        .where(eq(staffProfiles.staffCode, explicitStaffId))
        .limit(1);
      return found?.id ?? explicitStaffId;
    }

    const [staff] = await this.db
      .select({ id: staffProfiles.id })
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, userId))
      .limit(1);

    return staff?.id ?? null;
  }

  async count(params: Record<string, any>, userId: string): Promise<number> {
    const staffId = await this.resolveStaffProfileId(userId, params.staffProfileId);

    const conditions = [];
    if (staffId) {
      conditions.push(eq(staffAttendanceRecords.staffProfileId, staffId));
    }
    if (params.startDate) {
      conditions.push(gte(staffAttendanceRecords.attendanceDate, params.startDate));
    }
    if (params.endDate) {
      conditions.push(lte(staffAttendanceRecords.attendanceDate, params.endDate));
    }

    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(staffAttendanceRecords)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return result?.count ?? 0;
  }

  async *read(
    params: Record<string, any>,
    userId: string,
    batchSize: number = 500,
  ): AsyncGenerator<any[]> {
    const staffId = await this.resolveStaffProfileId(userId, params.staffProfileId);

    let offset = 0;
    for (;;) {
      const conditions = [];
      if (staffId) {
        conditions.push(eq(staffAttendanceRecords.staffProfileId, staffId));
      }
      if (params.startDate) {
        conditions.push(gte(staffAttendanceRecords.attendanceDate, params.startDate));
      }
      if (params.endDate) {
        conditions.push(lte(staffAttendanceRecords.attendanceDate, params.endDate));
      }

      const rows = await this.db
        .select({
          id: staffAttendanceRecords.id,
          attendanceDate: staffAttendanceRecords.attendanceDate,
          shift: staffAttendanceRecords.shift,
          status: staffAttendanceRecords.status,
          checkInAt: staffAttendanceRecords.checkInAt,
          checkOutAt: staffAttendanceRecords.checkOutAt,
          lateMinutes: staffAttendanceRecords.lateMinutes,
          validatedDurationHours: staffAttendanceRecords.validatedDurationHours,
          locationLabel: staffAttendanceRecords.locationLabel,
          staffName: staffProfiles.fullName,
          staffCode: staffProfiles.staffCode,
        })
        .from(staffAttendanceRecords)
        .leftJoin(staffProfiles, eq(staffAttendanceRecords.staffProfileId, staffProfiles.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(staffAttendanceRecords.attendanceDate), asc(staffAttendanceRecords.id))
        .limit(batchSize)
        .offset(offset);

      if (rows.length === 0) return;
      yield rows;
      offset += rows.length;
    }
  }

  formatRow(row: any, index: number): (string | number | boolean | null)[] {
    const formatTime = (ts: string | null) => {
      if (!ts) return '-';
      const d = new Date(ts);
      return isNaN(d.getTime())
        ? '-'
        : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const shiftCode = normalizeShift(row.shift);
    const shiftLabel = SHIFT_LABEL_MAP[shiftCode] || row.shift || '-';

    const statusCode = normalizeStatus(row.status);
    const statusLabel = STATUS_LABEL_MAP[statusCode] || row.status || '-';

    return [
      index,
      row.staffName ?? 'Pegawai Klinik',
      row.staffCode ?? '-',
      row.attendanceDate,
      shiftLabel,
      formatTime(row.checkInAt),
      formatTime(row.checkOutAt),
      row.lateMinutes ?? 0,
      Number(row.validatedDurationHours ?? 0),
      statusLabel,
      row.locationLabel ?? 'Klinik Utama',
    ];
  }
}
