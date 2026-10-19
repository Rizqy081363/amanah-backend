import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';
import { SocketIoRealtimeGateway } from '../../../notifications/infrastructure/realtime/socket-io-realtime.gateway';
import { REALTIME_GATEWAY_PORT } from '../../../notifications/notifications.constants';
import {
  SHIFT_LABEL_MAP,
  STATUS_LABEL_MAP,
  ShiftCode,
} from '../../domain/constants/attendance.constants';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';

export interface AttendanceNotificationStaffInfo {
  fullName: string;
  staffCode: string;
  userId?: string | null;
  staffType?: string | null;
  avatarUrl?: string | null;
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
    action: 'check_in' | 'manual_check_in' | 'check_out',
    staffInfo: AttendanceNotificationStaffInfo,
  ): Promise<void> {
    try {
      const staffName = staffInfo.fullName || 'Staf';
      const staffUserId = staffInfo.userId;
      const staffCode = staffInfo.staffCode || '-';
      const staffType = staffInfo.staffType || 'worker';

      const categoryLabel =
        staffType === 'doctor'
          ? 'Dokter'
          : staffType === 'midwife'
            ? 'Bidan'
            : 'Staf';

      const shiftKey = (record.shift || 'morning') as ShiftCode;
      const shiftLabel = SHIFT_LABEL_MAP[shiftKey] || 'Pagi';

      const statusKey = (record.status || 'present') as keyof typeof STATUS_LABEL_MAP;
      const statusLabel = STATUS_LABEL_MAP[statusKey] || 'Hadir';

      let formattedTime = '-';
      const checkInDate = record.checkInAt ? new Date(record.checkInAt) : null;
      if (checkInDate) {
        if (this.clinicTimeService) {
          formattedTime = `${this.clinicTimeService.formatTime(checkInDate)} ${this.clinicTimeService.getTimezoneAbbreviation(checkInDate)}`;
        } else {
          const hours = String(checkInDate.getHours()).padStart(2, '0');
          const minutes = String(checkInDate.getMinutes()).padStart(2, '0');
          const seconds = String(checkInDate.getSeconds()).padStart(2, '0');
          formattedTime = `${hours}:${minutes}:${seconds} WIB`;
        }
      }

      // Canonical domain event payload matching StaffAttendance SSOT
      const payload = {
        id: record.id,
        id_staf: staffCode,
        nama_staf: staffName,
        avatar: staffInfo.avatarUrl || undefined,
        kategori: categoryLabel,
        tanggal_presensi: record.attendanceDate || '',
        waktu_presensi: formattedTime,
        waktu: formattedTime,
        checkInAt: record.checkInAt ? record.checkInAt.toISOString() : null,
        checkOutAt: record.checkOutAt ? record.checkOutAt.toISOString() : null,
        status: statusLabel,
        shift: shiftLabel,
        validatedDurationHours: record.validatedDurationHours ? Number(record.validatedDurationHours) : 0,
        isReplacement: Boolean(record.isReplacement),
        action,
      };

      // 1. Direct Realtime WebSocket Broadcast (< 1ms In-Memory EDA)
      if (this.realtimeGateway) {
        // A. Global broadcast to entire clinic terminal namespace
        if (typeof (this.realtimeGateway as any).broadcast === 'function') {
          void (this.realtimeGateway as any).broadcast('attendance:recorded', payload);
          void (this.realtimeGateway as any).broadcast(`attendance:${action}`, payload);
          void (this.realtimeGateway as any).broadcast('attendance:refresh', { date: record.attendanceDate });
        } else if ((this.realtimeGateway as any).server?.emit) {
          (this.realtimeGateway as any).server.emit('attendance:recorded', payload);
          (this.realtimeGateway as any).server.emit(`attendance:${action}`, payload);
          (this.realtimeGateway as any).server.emit('attendance:refresh', { date: record.attendanceDate });
        }

        // B. Target role rooms (Admin Web & Clinic Supervisors)
        void this.realtimeGateway.emitToRole?.('admin', 'attendance:recorded', payload);
        void this.realtimeGateway.emitToRole?.('ADMIN', 'attendance:recorded', payload);
        void this.realtimeGateway.emitToRole?.('staff', 'attendance:recorded', payload);
        void this.realtimeGateway.emitToRole?.('STAF', 'attendance:recorded', payload);
        void this.realtimeGateway.emitToRoom?.('role:admin', 'attendance:recorded', payload);
        void this.realtimeGateway.emitToRoom?.('role:admin', `attendance:${action}`, payload);
        void this.realtimeGateway.emitToRoom?.('role:admin', 'attendance:refresh', { date: record.attendanceDate });

        // C. Target staff user personal room
        if (staffUserId) {
          void this.realtimeGateway.emitToUser(staffUserId, 'attendance:recorded', payload);
          void this.realtimeGateway.emitToUser(staffUserId, `attendance:${action}`, payload);
        }

        this.logger.log(
          `[AttendanceEDA] Dispatched realtime event: attendance:recorded (staff=${staffName}, action=${action}, status=${statusLabel})`,
        );
      }

      // 2. In-App Notification (Admin Web Bell & Notification Center)
      if (this.notificationGateway) {
        let title = 'Presensi Masuk Berhasil';
        let body = `Presensi dinas ${staffName} (${categoryLabel}) berhasil dicatat.`;
        if (action === 'check_out') {
          title = 'Presensi Pulang Berhasil';
          body = `Presensi pulang dinas ${staffName} berhasil dicatat. Durasi kerja: ${record.validatedDurationHours || 0} jam.`;
        } else if (record.status === 'late') {
          title = 'Presensi Terlambat Dicatat';
          body = `Presensi dinas ${staffName} dicatat terlambat (${record.lateMinutes || 0} menit).`;
        }

        // Broadcast notification to clinic administration
        await this.notificationGateway.dispatch({
          commandId: `att-admin-${action}-${record.id}-${Date.now()}`,
          sourceDomain: 'attendance',
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
          priority: 'normal',
        });

        // If staff user exists, dispatch personal notification
        if (staffUserId) {
          await this.notificationGateway.dispatch({
            commandId: `att-user-${action}-${record.id}-${Date.now()}`,
            sourceDomain: 'attendance',
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
            priority: 'normal',
          });
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to dispatch attendance notification: ${String(err)}`,
      );
    }
  }
}
