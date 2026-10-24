import { Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  roles,
  staffAttendanceRecords,
  staffProfiles,
  userRoles,
  users,
} from '../../../../database/schema/amanah.schema';
import { ExportColumnDef, ExportSource } from '../../domain/export-source.interface';
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

  async getTitle(params: Record<string, any>, userId?: string): Promise<string> {
    if (params.staffName) {
      return `Laporan Rekapitulasi Presensi: ${params.staffName}`;
    }
    if (userId) {
      const scope = await this.resolveActorScope(userId, params.staffProfileId);
      if (!scope.isClinicWide && scope.staffName) {
        return `Laporan Rekapitulasi Presensi: ${scope.staffName}`;
      }
    }
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

  async getDetailsTitle(params: Record<string, any>, userId?: string): Promise<string> {
    if (params.staffName) {
      return `RIWAYAT PRESENSI & KEHADIRAN: ${String(params.staffName).toUpperCase()}`;
    }
    if (userId) {
      const scope = await this.resolveActorScope(userId, params.staffProfileId);
      if (!scope.isClinicWide && scope.staffName) {
        return `RIWAYAT PRESENSI & KEHADIRAN: ${scope.staffName.toUpperCase()}`;
      }
    }
    return 'RIWAYAT PRESENSI & KEHADIRAN PEGAWAI';
  }

  getColumnDefs(): ExportColumnDef[] {
    return [
      { header: 'No', width: 'auto', align: 'center' },
      { header: 'Nama Pegawai', width: '*', align: 'left' },
      { header: 'Kode Pegawai', width: 'auto', align: 'center' },
      { header: 'Tanggal', width: 'auto', align: 'center' },
      { header: 'Shift Kerja', width: 'auto', align: 'center' },
      { header: 'Jam Masuk', width: 'auto', align: 'center' },
      { header: 'Jam Pulang', width: 'auto', align: 'center' },
      { header: 'Keterlambatan (Mnt)', width: 'auto', align: 'right', format: 'number' },
      { header: 'Durasi Efektif (Jam)', width: 'auto', align: 'right', format: 'decimal' },
      { header: 'Status Kehadiran', width: 'auto', align: 'center' },
      { header: 'Unit / Lokasi', width: 'auto', align: 'left' },
    ];
  }

  getHeaders(): string[] {
    return this.getColumnDefs().map((c) => c.header);
  }

  private async resolveActorScope(
    userId: string,
    explicitStaffId?: string,
  ): Promise<{ staffId: string | null; isClinicWide: boolean; staffName?: string }> {
    // 1. Check if actor has admin role
    const [actor] = await this.db
      .select({
        roleCode: roles.code,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(users.id, userId))
      .limit(1);

    const isAdmin = actor?.roleCode === 'admin';

    // 2. Lookup actor's own linked staff profile
    const [ownStaff] = await this.db
      .select({ id: staffProfiles.id, fullName: staffProfiles.fullName })
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, userId))
      .limit(1);

    // Non-admin (Doctor, Midwife, Worker on Flutter): strictly locked to own profile
    if (!isAdmin) {
      return {
        staffId: ownStaff?.id ?? null,
        isClinicWide: false,
        staffName: ownStaff?.fullName,
      };
    }

    // Admin (Web Portal): can target explicit staff or export clinic-wide
    if (explicitStaffId) {
      if (isUUID(explicitStaffId)) {
        const [targetStaff] = await this.db
          .select({ id: staffProfiles.id, fullName: staffProfiles.fullName })
          .from(staffProfiles)
          .where(eq(staffProfiles.id, explicitStaffId))
          .limit(1);
        return {
          staffId: explicitStaffId,
          isClinicWide: false,
          staffName: targetStaff?.fullName,
        };
      }

      const [found] = await this.db
        .select({ id: staffProfiles.id, fullName: staffProfiles.fullName })
        .from(staffProfiles)
        .where(eq(staffProfiles.staffCode, explicitStaffId))
        .limit(1);

      return {
        staffId: found?.id ?? explicitStaffId,
        isClinicWide: false,
        staffName: found?.fullName,
      };
    }

    // Admin without explicit staff: clinic-wide
    return { staffId: null, isClinicWide: true };
  }

  async count(params: Record<string, any>, userId: string): Promise<number> {
    const scope = await this.resolveActorScope(userId, params.staffProfileId);

    // If non-admin has no linked staff profile, they have no records to export
    if (!scope.isClinicWide && !scope.staffId) {
      return 0;
    }

    const conditions = [];
    if (scope.staffId) {
      conditions.push(eq(staffAttendanceRecords.staffProfileId, scope.staffId));
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
    const scope = await this.resolveActorScope(userId, params.staffProfileId);

    if (!scope.isClinicWide && !scope.staffId) {
      return;
    }

    let offset = 0;
    for (;;) {
      const conditions = [];
      if (scope.staffId) {
        conditions.push(eq(staffAttendanceRecords.staffProfileId, scope.staffId));
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
