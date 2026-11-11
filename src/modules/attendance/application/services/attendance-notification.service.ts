import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';
import { SocketIoRealtimeGateway } from '../../../notifications/infrastructure/realtime/socket-io-realtime.gateway';
import {
  NOTIFICATION_SOURCE_DOMAINS,
  REALTIME_GATEWAY_PORT,
  REALTIME_ROOMS,
} from '../../../notifications/notifications.constants';
import { PAYROLL_ENTRY_TYPE } from '../../../payroll/domain/constants/payroll.constants';
import {
  ATTENDANCE_ACTIONS,
  ATTENDANCE_STATUS,
  AttendanceAction,
} from '../../domain/constants/attendance.constants';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';

export interface AttendanceNotificationStaffInfo {
  fullName: string;
  staffCode: string;
  userId?: string | null;
  roleId?: string | null;
  roleCode?: string | null;
  roleName?: string | null;
  isClinical?: boolean | null;
  positionTitle?: string | null;
  avatarUrl?: string | null;
  earnedAmount?: number;
  shiftLabel?: string | null;
  skipAdminBroadcast?: boolean;
}

@Injectable()
export class AttendanceNotificationService {
  private readonly logger = new Logger(AttendanceNotificationService.name);

  constructor(
    private readonly clinicTimeService: ClinicTimeService,
    @Optional()
    private readonly notificationGateway?: NotificationGatewayService,
    @Optional()
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
    @Optional()
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo?: AttendanceRepository,
  ) {}

  async dispatchNotification(
    record: AttendanceEntity,
    action: AttendanceAction,
    staffInfo: AttendanceNotificationStaffInfo,
  ): Promise<void> {
    try {
      const staffName = staffInfo.fullName || '';
      const staffUserId = staffInfo.userId;
      const staffCode = staffInfo.staffCode || '';
      const categoryLabel = staffInfo.positionTitle || staffInfo.roleCode || '';

      // Determine the canonical event timestamp based on the recorded action:
      // For checkout, the event timestamp is checkOutAt; for checkin, it is checkInAt.
      const isCheckoutAction = action === ATTENDANCE_ACTIONS.CHECK_OUT;
      const eventDate =
        isCheckoutAction && record.checkOutAt
          ? new Date(record.checkOutAt)
          : record.checkInAt
            ? new Date(record.checkInAt)
            : null;

      let formattedTime = '-';
      if (eventDate && !Number.isNaN(eventDate.getTime())) {
        formattedTime = `${this.clinicTimeService.formatTime(eventDate)} ${this.clinicTimeService.getTimezoneAbbreviation(eventDate)}`;
      }

      // Canonical domain event payload matching StaffAttendance SSOT
      const payload = {
        id: record.id,
        attendanceId: record.id,
        id_staf: staffCode,
        nama_staf: staffName,
        avatar: staffInfo.avatarUrl || undefined,
        roleId: staffInfo.roleId || null,
        roleCode: staffInfo.roleCode || null,
        roleName: staffInfo.roleName || null,
        isClinical: staffInfo.isClinical ?? false,
        kategori: staffInfo.roleName || categoryLabel,
        tanggal_presensi: record.attendanceDate,
        waktu_presensi: formattedTime,
        checkInAt: record.checkInAt ? record.checkInAt.toISOString() : null,
        checkOutAt: record.checkOutAt ? record.checkOutAt.toISOString() : null,
        status: record.status,
        shift: record.shift,
        validatedDurationHours: record.validatedDurationHours
          ? Number(record.validatedDurationHours)
          : 0,
        isReplacement: Boolean(record.isReplacement),
        isEarlyDeparture: Boolean(record.isEarlyDeparture),
        notes: record.notes || null,
        earnedAmount: staffInfo.earnedAmount || 0,
        action,
      };

      // 1. Scoped Realtime WebSocket Dispatch (Strictly Isolated to Clinic Staff & Admin)
      if (this.realtimeGateway) {
        // A. Target clinic staff room (Terminal & Clinic Operational Room - skipped during bulk sweep)
        if (!staffInfo.skipAdminBroadcast) {
          void this.realtimeGateway.emitToRoom?.(
            REALTIME_ROOMS.clinic,
            'attendance:recorded',
            payload,
          );
          void this.realtimeGateway.emitToRoom?.(
            REALTIME_ROOMS.clinic,
            `attendance:${action}`,
            payload,
          );
          if (record.isEarlyDeparture) {
            void this.realtimeGateway.emitToRoom?.(
              REALTIME_ROOMS.clinic,
              'attendance:early_departure',
              payload,
            );
          }
          void this.realtimeGateway.emitToRoom?.(
            REALTIME_ROOMS.clinic,
            'attendance:refresh',
            { date: record.attendanceDate },
          );
        }

        // B. Target staff user personal room
        if (staffUserId) {
          void this.realtimeGateway.emitToUser(
            staffUserId,
            'attendance:recorded',
            payload,
          );
          void this.realtimeGateway.emitToUser(
            staffUserId,
            `attendance:${action}`,
            payload,
          );
          if (record.isEarlyDeparture) {
            void this.realtimeGateway.emitToUser(
              staffUserId,
              'attendance:early_departure',
              payload,
            );
          }
        }

        this.logger.log(
          `[AttendanceEDA] Dispatched realtime event: attendance:recorded (staff=${staffName}, action=${action}, status=${record.status}${record.isEarlyDeparture ? ', earlyDeparture=true' : ''})`,
        );
      }

      // 2. Realtime Shift Earnings WebSocket Dispatch (Dedicated Financial Event)
      if (
        this.realtimeGateway &&
        isCheckoutAction &&
        staffInfo.earnedAmount &&
        staffInfo.earnedAmount > 0
      ) {
        const payrollPayload = {
          id: record.id,
          id_staf: staffCode,
          nama_staf: staffName,
          tanggal: record.attendanceDate,
          earnedAmount: staffInfo.earnedAmount,
          validatedDurationHours: record.validatedDurationHours
            ? Number(record.validatedDurationHours)
            : 0,
          isReplacement: Boolean(record.isReplacement),
          type: record.isReplacement
            ? PAYROLL_ENTRY_TYPE.REPLACEMENT_ADDITION
            : PAYROLL_ENTRY_TYPE.BASE_SCHEDULED,
        };

        if (staffUserId) {
          void this.realtimeGateway.emitToUser(
            staffUserId,
            'payroll:shift_earnings_recorded',
            payrollPayload,
          );
        }
        void this.realtimeGateway.emitToRoom?.(
          REALTIME_ROOMS.clinic,
          'payroll:shift_earnings_recorded',
          payrollPayload,
        );
        void this.realtimeGateway.emitToRoom?.(
          REALTIME_ROOMS.clinic,
          'payroll:refresh',
          {
            date: record.attendanceDate,
          },
        );

        this.logger.log(
          `[PayrollEDA] Dispatched realtime event: payroll:shift_earnings_recorded (staff=${staffName}, amount=${staffInfo.earnedAmount}, isReplacement=${Boolean(record.isReplacement)})`,
        );
      }

      // 3. In-App Notification (Admin Web Bell & Notification Center)
      if (this.notificationGateway) {
        let title = 'Presensi Masuk Berhasil';
        let body = `Presensi dinas ${staffName} (${categoryLabel}) berhasil dicatat.`;
        let priority: 'normal' | 'high' = 'normal';
        let shiftLabel = staffInfo.shiftLabel || record.shiftLabel;
        if (!shiftLabel && this.repo) {
          const sessionDef = record.sessionId
            ? await this.repo.resolveSessionDefById(record.sessionId)
            : record.shift
              ? await this.repo.resolveSessionDefByCode(record.shift)
              : null;
          if (sessionDef?.label) {
            shiftLabel = sessionDef.label;
          }
        }
        const shiftName = shiftLabel || record.shift;

        if (
          action === ATTENDANCE_ACTIONS.ABSENCE_FINALIZED ||
          record.status === ATTENDANCE_STATUS.ABSENT
        ) {
          title = 'Peringatan: Anda Tercatat Tidak Hadir';
          body = `Anda tercatat tidak hadir pada Shift ${shiftName} tanggal ${record.attendanceDate}. Honor dinas shift ini tidak dihitung.`;
          priority = 'high';
        } else if (action === ATTENDANCE_ACTIONS.RECONCILED) {
          const isOvertimeApproved =
            staffInfo.earnedAmount && staffInfo.earnedAmount > 0;
          if (isOvertimeApproved) {
            title = 'Rekonsiliasi Lembur Disetujui';
            body = `Lembur dinas Shift ${shiftName} Anda telah disetujui (${record.validatedDurationHours || 0} jam kerja). Tambahan upah lembur Rp ${staffInfo.earnedAmount?.toLocaleString('id-ID')} telah dicatat.`;
          } else {
            title = 'Rekonsiliasi Presensi Selesai';
            body = `Presensi dinas Shift ${shiftName} Anda telah direkonsiliasi ke jam akhir shift standar (${record.validatedDurationHours || 0} jam kerja).`;
          }
          priority = 'normal';
        } else if (action === ATTENDANCE_ACTIONS.CHECK_OUT) {
          const durationText = ` Durasi kerja: ${record.validatedDurationHours || 0} jam.`;

          if (record.isEarlyDeparture) {
            title = 'Peringatan: Kepulangan Lebih Awal';
            body = `Presensi pulang dinas lebih awal dicatat untuk ${staffName} (${categoryLabel}). Alasan: ${record.notes || '-'}.${durationText}`;
            priority = 'high';
          } else {
            title = 'Presensi Pulang Berhasil';
            body = `Presensi pulang dinas ${staffName} berhasil dicatat.${durationText}`;
          }
        } else if (record.status === ATTENDANCE_STATUS.LATE) {
          title = 'Presensi Terlambat Dicatat';
          body = `Presensi dinas ${staffName} dicatat terlambat (${record.lateMinutes || 0} menit).`;
        }

        const adminTitle =
          action === ATTENDANCE_ACTIONS.ABSENCE_FINALIZED ||
          record.status === ATTENDANCE_STATUS.ABSENT
            ? 'Peringatan Ketidakhadiran Staf'
            : action === ATTENDANCE_ACTIONS.RECONCILED
              ? `Rekonsiliasi Presensi: ${staffName}`
              : title;
        const adminBody =
          action === ATTENDANCE_ACTIONS.ABSENCE_FINALIZED ||
          record.status === ATTENDANCE_STATUS.ABSENT
            ? `Staf ${staffName} (${categoryLabel}) tercatat tidak hadir pada Shift ${shiftName} (${record.attendanceDate}).`
            : action === ATTENDANCE_ACTIONS.RECONCILED
              ? `Rekonsiliasi presensi ${staffName} (${categoryLabel}) pada Shift ${shiftName} berhasil diproses.`
              : body;

        // Broadcast notification to clinic administration (skipped during bulk sweep)
        if (!staffInfo.skipAdminBroadcast) {
          await this.notificationGateway.dispatch({
            commandId: `att-admin-${action}-${record.id}-${Date.now()}`,
            sourceDomain: NOTIFICATION_SOURCE_DOMAINS.ATTENDANCE,
            channels: ['in_app'],
            audience: 'internal',
            target: {
              type: 'broadcast',
            },
            category: 'shift',
            content: {
              title: adminTitle,
              body: adminBody,
              actionUrl: `/admin/kehadiran-pegawai?highlight=${record.id}`,
              data: payload,
            },
            priority,
          });
        }

        // If staff user exists, dispatch personal attendance notification
        if (staffUserId) {
          await this.notificationGateway.dispatch({
            commandId: `att-user-${action}-${record.id}-${Date.now()}`,
            sourceDomain: NOTIFICATION_SOURCE_DOMAINS.ATTENDANCE,
            channels: ['in_app', 'push'],
            target: {
              type: 'user',
              recipientUserIds: [staffUserId],
            },
            category: 'shift',
            content: {
              title,
              body,
              actionUrl: `/admin/kehadiran-pegawai?highlight=${record.id}`,
              data: payload,
            },
            priority,
          });
        }

        // 4. Dedicated Shift Earnings Notification for Check-Out or Approved Overtime (Realtime Payroll Ledger)
        if (
          (isCheckoutAction || action === ATTENDANCE_ACTIONS.RECONCILED) &&
          staffInfo.earnedAmount &&
          staffInfo.earnedAmount > 0 &&
          staffUserId
        ) {
          const isReplacement = Boolean(record.isReplacement);
          const payrollTitle =
            action === ATTENDANCE_ACTIONS.RECONCILED
              ? 'Tambahan Upah Lembur Masuk'
              : isReplacement
                ? 'Upah Pengganti Masuk'
                : 'Upah Hari Ini Masuk';
          const durationVal = record.validatedDurationHours || 0;
          const payrollBody =
            action === ATTENDANCE_ACTIONS.RECONCILED
              ? `Tambahan upah lembur sebesar Rp ${staffInfo.earnedAmount.toLocaleString('id-ID')} telah disetujui admin dan masuk ke rekap gaji bulan berjalan.`
              : isReplacement
                ? `Upah dinas pengganti sebesar Rp ${staffInfo.earnedAmount.toLocaleString('id-ID')} (${durationVal} jam dinas) telah masuk ke rekap gaji bulan berjalan.`
                : `Upah dinas sebesar Rp ${staffInfo.earnedAmount.toLocaleString('id-ID')} (${durationVal} jam kerja) telah masuk ke rekap gaji bulan berjalan.`;

          await this.notificationGateway.dispatch({
            commandId: `payroll-earn-${record.id}-${Date.now()}`,
            sourceDomain: NOTIFICATION_SOURCE_DOMAINS.PAYROLL,
            channels: ['in_app', 'push'],
            target: {
              type: 'user',
              recipientUserIds: [staffUserId],
            },
            category: 'shift',
            content: {
              title: payrollTitle,
              body: payrollBody,
              actionUrl: '/admin/payroll',
              data: {
                attendanceId: record.id,
                staffId: record.staffId,
                earnedAmount: staffInfo.earnedAmount,
                validatedDurationHours: record.validatedDurationHours
                  ? Number(record.validatedDurationHours)
                  : 0,
                isReplacement,
                date: record.attendanceDate,
              },
            },
            priority: 'normal',
          });

          this.logger.log(
            `[PayrollNotification] Dispatched shift earnings notification to user=${staffUserId} (title="${payrollTitle}", amount=${staffInfo.earnedAmount})`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to dispatch attendance notification: ${String(err)}`,
      );
    }
  }

  async dispatchAggregateShiftAbsence(params: {
    shiftLabel: string;
    shiftCode: string;
    attendanceDate: string;
    absentCount: number;
    absentStaffNames: string[];
  }): Promise<void> {
    if (params.absentCount <= 0) return;

    try {
      const namesPreview =
        params.absentStaffNames.length <= 3
          ? params.absentStaffNames.join(', ')
          : `${params.absentStaffNames.slice(0, 3).join(', ')} dan ${params.absentStaffNames.length - 3} lainnya`;

      const title = `Evaluasi Akhir Shift: ${params.shiftLabel}`;
      const body = `${params.absentCount} staf tercatat tidak hadir pada Shift ${params.shiftLabel} (${params.attendanceDate}): ${namesPreview}.`;

      // 1. Single aggregate broadcast to clinic administration
      if (this.notificationGateway) {
        await this.notificationGateway.dispatch({
          commandId: `att-admin-sweep-${params.shiftCode}-${params.attendanceDate}-${Date.now()}`,
          sourceDomain: NOTIFICATION_SOURCE_DOMAINS.ATTENDANCE,
          channels: ['in_app'],
          audience: 'internal',
          target: {
            type: 'broadcast',
          },
          category: 'shift',
          content: {
            title,
            body,
            actionUrl: `/admin/kehadiran-pegawai?date=${params.attendanceDate}&shift=${params.shiftCode}&status=${ATTENDANCE_STATUS.ABSENT}`,
            data: {
              shiftCode: params.shiftCode,
              shiftLabel: params.shiftLabel,
              attendanceDate: params.attendanceDate,
              absentCount: params.absentCount,
              absentStaffNames: params.absentStaffNames,
            },
          },
          priority: 'normal',
        });
      }

      // 2. Single realtime refresh event to clinic operational room
      if (this.realtimeGateway) {
        void this.realtimeGateway.emitToRoom?.(
          REALTIME_ROOMS.clinic,
          'attendance:refresh',
          {
            date: params.attendanceDate,
            shift: params.shiftCode,
            totalAbsent: params.absentCount,
          },
        );
      }

      this.logger.log(
        `[AttendanceEDA] Dispatched aggregate shift absence notification: shift=${params.shiftLabel}, absentCount=${params.absentCount}`,
      );
    } catch (err) {
      this.logger.error(
        `[AttendanceEDA] Failed to dispatch aggregate shift absence notification: ${String(err)}`,
      );
    }
  }
}
