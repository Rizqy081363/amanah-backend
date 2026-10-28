import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';
import { SocketIoRealtimeGateway } from '../../../notifications/infrastructure/realtime/socket-io-realtime.gateway';
import {
  NOTIFICATION_SOURCE_DOMAINS,
  REALTIME_GATEWAY_PORT,
} from '../../../notifications/notifications.constants';
import {
  ATTENDANCE_ACTIONS,
  AttendanceAction,
} from '../../domain/constants/attendance.constants';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';

export interface AttendanceNotificationStaffInfo {
  fullName: string;
  staffCode: string;
  userId?: string | null;
  staffType?: string | null;
  positionTitle?: string | null;
  avatarUrl?: string | null;
  earnedAmount?: number;
}

@Injectable()
export class AttendanceNotificationService {
  private readonly logger = new Logger(AttendanceNotificationService.name);

  constructor(
    @Optional()
    private readonly notificationGateway?: NotificationGatewayService,
    @Optional()
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
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
      const staffType = staffInfo.staffType || '';
      const categoryLabel = staffInfo.positionTitle || staffType;

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
        if (this.clinicTimeService) {
          formattedTime = `${this.clinicTimeService.formatTime(eventDate)} ${this.clinicTimeService.getTimezoneAbbreviation(eventDate)}`;
        } else {
          const hours = String(eventDate.getHours()).padStart(2, '0');
          const minutes = String(eventDate.getMinutes()).padStart(2, '0');
          const seconds = String(eventDate.getSeconds()).padStart(2, '0');
          formattedTime = `${hours}:${minutes}:${seconds} WIB`;
        }
      }

      // Canonical domain event payload matching StaffAttendance SSOT
      const payload = {
        id: record.id,
        attendanceId: record.id,
        id_staf: staffCode,
        nama_staf: staffName,
        avatar: staffInfo.avatarUrl || undefined,
        kategori: categoryLabel,
        tanggal_presensi: record.attendanceDate || '',
        waktu_presensi: formattedTime,
        checkInAt: record.checkInAt ? record.checkInAt.toISOString() : null,
        checkOutAt: record.checkOutAt ? record.checkOutAt.toISOString() : null,
        status: record.status,
        shift: record.shift,
        validatedDurationHours: record.validatedDurationHours ? Number(record.validatedDurationHours) : 0,
        isReplacement: Boolean(record.isReplacement),
        isEarlyDeparture: Boolean(record.isEarlyDeparture),
        notes: record.notes || null,
        earnedAmount: staffInfo.earnedAmount || 0,
        action,
      };

      // 1. Scoped Realtime WebSocket Dispatch (Strictly Isolated to Clinic Staff & Admin)
      if (this.realtimeGateway) {
        // A. Target clinic staff room (Terminal & Clinic Operational Room)
        void this.realtimeGateway.emitToRoom?.('room:clinic', 'attendance:recorded', payload);
        void this.realtimeGateway.emitToRoom?.('room:clinic', `attendance:${action}`, payload);
        if (record.isEarlyDeparture) {
          void this.realtimeGateway.emitToRoom?.('room:clinic', 'attendance:early_departure', payload);
        }
        void this.realtimeGateway.emitToRoom?.('room:clinic', 'attendance:refresh', { date: record.attendanceDate });

        // B. Target admin role room (Admin Web & Supervisors)
        void this.realtimeGateway.emitToRole('admin', 'attendance:recorded', payload);
        void this.realtimeGateway.emitToRole('admin', `attendance:${action}`, payload);
        if (record.isEarlyDeparture) {
          void this.realtimeGateway.emitToRole('admin', 'attendance:early_departure', payload);
        }
        void this.realtimeGateway.emitToRole('admin', 'attendance:refresh', { date: record.attendanceDate });

        // C. Target staff user personal room
        if (staffUserId) {
          void this.realtimeGateway.emitToUser(staffUserId, 'attendance:recorded', payload);
          void this.realtimeGateway.emitToUser(staffUserId, `attendance:${action}`, payload);
          if (record.isEarlyDeparture) {
            void this.realtimeGateway.emitToUser(staffUserId, 'attendance:early_departure', payload);
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
          tanggal: record.attendanceDate || '',
          earnedAmount: staffInfo.earnedAmount,
          validatedDurationHours: record.validatedDurationHours
            ? Number(record.validatedDurationHours)
            : 0,
          isReplacement: Boolean(record.isReplacement),
          type: record.isReplacement
            ? 'replacement_addition'
            : 'base_scheduled',
        };

        if (staffUserId) {
          void this.realtimeGateway.emitToUser(
            staffUserId,
            'payroll:shift_earnings_recorded',
            payrollPayload,
          );
        }
        void this.realtimeGateway.emitToRole(
          'admin',
          'payroll:shift_earnings_recorded',
          payrollPayload,
        );
        void this.realtimeGateway.emitToRole(
          'ADMIN',
          'payroll:shift_earnings_recorded',
          payrollPayload,
        );
        void this.realtimeGateway.emitToRoom?.('role:admin', 'payroll:refresh', {
          date: record.attendanceDate,
        });
        void this.realtimeGateway.emitToRoom?.('room:clinic', 'payroll:refresh', {
          date: record.attendanceDate,
        });

        this.logger.log(
          `[PayrollEDA] Dispatched realtime event: payroll:shift_earnings_recorded (staff=${staffName}, amount=${staffInfo.earnedAmount}, isReplacement=${Boolean(record.isReplacement)})`,
        );
      }

      // 3. In-App Notification (Admin Web Bell & Notification Center)
      if (this.notificationGateway) {
        let title = 'Presensi Masuk Berhasil';
        let body = `Presensi dinas ${staffName} (${categoryLabel}) berhasil dicatat.`;
        let priority: 'normal' | 'high' = 'normal';

        if (action === ATTENDANCE_ACTIONS.CHECK_OUT) {
          const durationText = ` Durasi kerja: ${record.validatedDurationHours || 0} jam.`;

          if (record.isEarlyDeparture) {
            title = 'Peringatan: Kepulangan Lebih Awal';
            body = `Presensi pulang dinas lebih awal dicatat untuk ${staffName} (${categoryLabel}). Alasan: ${record.notes || '-'}.${durationText}`;
            priority = 'high';
          } else {
            title = 'Presensi Pulang Berhasil';
            body = `Presensi pulang dinas ${staffName} berhasil dicatat.${durationText}`;
          }
        } else if (record.status === 'late') {
          title = 'Presensi Terlambat Dicatat';
          body = `Presensi dinas ${staffName} dicatat terlambat (${record.lateMinutes || 0} menit).`;
        }

        // Broadcast notification to clinic administration
        await this.notificationGateway.dispatch({
          commandId: `att-admin-${action}-${record.id}-${Date.now()}`,
          sourceDomain: NOTIFICATION_SOURCE_DOMAINS.ATTENDANCE,
          channels: ['in_app'],
          target: {
            type: 'role',
            roles: ['admin', 'staf'],
          },
          category: 'shift',
          content: {
            title,
            body,
            actionUrl: `/dashboard/kehadiran-pegawai?highlight=${record.id}`,
            data: payload,
          },
          priority,
        });

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
              actionUrl: `/dashboard/kehadiran-pegawai?highlight=${record.id}`,
              data: payload,
            },
            priority,
          });
        }

        // 4. Dedicated Shift Earnings Notification for Check-Out (Realtime Payroll Ledger)
        if (
          isCheckoutAction &&
          staffInfo.earnedAmount &&
          staffInfo.earnedAmount > 0 &&
          staffUserId
        ) {
          const isReplacement = Boolean(record.isReplacement);
          const payrollTitle = isReplacement
            ? 'Upah Pengganti Masuk'
            : 'Upah Hari Ini Masuk';
          const durationVal = record.validatedDurationHours || 0;
          const payrollBody = isReplacement
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
              actionUrl: '/dashboard/penggajian',
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
}
