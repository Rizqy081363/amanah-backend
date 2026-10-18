import { Injectable, Logger, Optional } from '@nestjs/common';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';
import { SocketIoRealtimeGateway } from '../../../notifications/infrastructure/realtime/socket-io-realtime.gateway';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';

@Injectable()
export class AttendanceNotificationService {
  private readonly logger = new Logger(AttendanceNotificationService.name);

  constructor(
    @Optional()
    private readonly notificationGateway?: NotificationGatewayService,
    @Optional()
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
  ) {}

  async dispatchNotification(
    record: AttendanceEntity,
    action: 'check_in' | 'manual_check_in' | 'check_out',
    staffInfo: { fullName: string; staffCode: string; userId?: string | null },
  ): Promise<void> {
    try {
      const staffName = staffInfo.fullName || 'Staf';
      const staffUserId = staffInfo.userId;

      // 1. Realtime WebSocket Broadcast
      if (this.realtimeGateway) {
        const payload = {
          attendanceId: record.id,
          staffId: record.staffId,
          staffName,
          staffCode: staffInfo.staffCode,
          status: record.status,
          action,
          date: record.attendanceDate,
          checkInAt: record.checkInAt ? record.checkInAt.toISOString() : null,
          checkOutAt: record.checkOutAt ? record.checkOutAt.toISOString() : null,
          duration: record.validatedDurationHours,
        };

        // Emit to both ADMIN role and role:admin room
        this.realtimeGateway.emitToRole('ADMIN', `attendance:${action}`, payload);
        this.realtimeGateway.emitToRole('ADMIN', 'attendance:recorded', payload);
        this.realtimeGateway.emitToRole('ADMIN', 'attendance:refresh', {
          date: record.attendanceDate,
        });

        this.realtimeGateway.emitToRoom('role:admin', `attendance:${action}`, payload);
        this.realtimeGateway.emitToRoom('role:admin', 'attendance:recorded', payload);
        this.realtimeGateway.emitToRoom('role:admin', 'attendance:refresh', {
          date: record.attendanceDate,
        });

        if (staffUserId) {
          this.realtimeGateway.emitToUser(
            staffUserId,
            `attendance:${action}`,
            payload,
          );
        }
      }

      // 2. In-App & Push Notifications (FCM / RabbitMQ)
      if (this.notificationGateway) {
        let title = 'Presensi Kehadiran';
        let body = `Presensi dinas ${staffName} berhasil dicatat.`;
        if (action === 'check_out') {
          title = 'Presensi Pulang Berhasil';
          body = `Presensi pulang dinas ${staffName} berhasil dicatat. Durasi kerja: ${record.validatedDurationHours || 0} jam.`;
        } else if (record.status === 'late') {
          title = 'Presensi Terlambat Dicatat';
          body = `Presensi dinas ${staffName} dicatat dengan status terlambat.`;
        }

        await this.notificationGateway.dispatch({
          commandId: `att-${action}-${record.id}-${Date.now()}`,
          sourceDomain: 'attendance',
          channels: ['in_app', 'push'],
          target: {
            type: staffUserId ? 'user' : 'role',
            recipientUserIds: staffUserId ? [staffUserId] : undefined,
            roles: ['admin', 'staf'],
          },
          category: 'shift',
          content: {
            title,
            body,
            actionUrl: `/dashboard/kehadiran-pegawai?highlight=${record.id}`,
            data: {
              attendanceId: record.id,
              staffId: record.staffId,
              status: record.status,
              action,
              checkInAt: record.checkInAt ? record.checkInAt.toISOString() : null,
              checkOutAt: record.checkOutAt ? record.checkOutAt.toISOString() : null,
            },
          },
          priority: 'normal',
        });
      }
    } catch (err) {
      this.logger.error(
        `Failed to dispatch attendance notification: ${String(err)}`,
      );
    }
  }
}
