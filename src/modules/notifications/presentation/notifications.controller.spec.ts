import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { REALTIME_EVENTS } from '../notifications.constants';
import { NotificationsController } from './notifications.controller';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let mockNotificationRepo: any;
  let mockRealtimeGateway: any;

  beforeEach(() => {
    mockNotificationRepo = {
      findMyNotifications: mock().mockResolvedValue({
        data: [],
        total: 0,
        unreadCount: 3,
      }),
      markAsRead: mock().mockResolvedValue(true),
      markAllAsRead: mock().mockResolvedValue(4),
    };

    mockRealtimeGateway = {
      emitToUser: mock().mockResolvedValue(true),
      isUserOnline: mock().mockReturnValue(true),
      getConnectedUserCount: mock().mockReturnValue(1),
    };

    controller = new NotificationsController(
      mockNotificationRepo,
      mockRealtimeGateway,
    );
  });

  it('should return unread count for user', async () => {
    const result = await controller.getUnreadCount({ id: 'user-1' });

    expect(result).toEqual({ unreadCount: 3 });
    expect(mockNotificationRepo.findMyNotifications).toHaveBeenCalledWith(
      'user-1',
      { limit: 1, unreadOnly: true },
    );
  });

  it('should mark single notification as read and emit sync events', async () => {
    mockNotificationRepo.findMyNotifications.mockResolvedValueOnce({
      data: [],
      total: 0,
      unreadCount: 2,
    });

    const result = await controller.markAsRead('notif-1', { id: 'user-1' });

    expect(result).toEqual({ success: true });
    expect(mockNotificationRepo.markAsRead).toHaveBeenCalledWith(
      'notif-1',
      'user-1',
    );
    expect(mockRealtimeGateway.emitToUser).toHaveBeenCalledWith(
      'user-1',
      REALTIME_EVENTS.NOTIFICATION_READ,
      expect.objectContaining({ id: 'notif-1' }),
    );
    expect(mockRealtimeGateway.emitToUser).toHaveBeenCalledWith(
      'user-1',
      REALTIME_EVENTS.NOTIFICATION_UNREAD_COUNT,
      { unreadCount: 2 },
    );
  });

  it('should throw NotFoundException if markAsRead returns false', async () => {
    mockNotificationRepo.markAsRead.mockResolvedValue(false);

    expect(
      controller.markAsRead('invalid-notif', { id: 'user-1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should mark all notifications as read and emit sync events', async () => {
    const result = await controller.markAllAsRead({ id: 'user-1' });

    expect(result).toEqual({ success: true, updatedCount: 4 });
    expect(mockNotificationRepo.markAllAsRead).toHaveBeenCalledWith('user-1');
    expect(mockRealtimeGateway.emitToUser).toHaveBeenCalledWith(
      'user-1',
      REALTIME_EVENTS.NOTIFICATION_READ,
      expect.objectContaining({ all: true }),
    );
    expect(mockRealtimeGateway.emitToUser).toHaveBeenCalledWith(
      'user-1',
      REALTIME_EVENTS.NOTIFICATION_UNREAD_COUNT,
      { unreadCount: 0 },
    );
  });
});
