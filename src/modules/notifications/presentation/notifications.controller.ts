import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import {
  NOTIFICATION_REPOSITORY,
  NotificationRepository,
} from '../domain/repositories/notification.repository';
import { QueryNotificationDto } from './dto/query-notification.dto';

@ApiTags('Notifications (Notifikasi Staf & Pasien)')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: NotificationRepository,
  ) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Melihat daftar notifikasi user yang sedang login (Mobile App)',
    description:
      'Mengambil daftar notifikasi klinis, jadwal, presensi, dan sistem untuk user (staf, dokter, atau pasien) beserta jumlah pesan belum dibaca.',
  })
  @ApiOkResponse({
    description: 'Daftar notifikasi berhasil diambil',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              category: { type: 'string', example: 'clinical' },
              title: {
                type: 'string',
                example: 'Panggilan Pasien Antrean #01',
              },
              body: {
                type: 'string',
                example:
                  'Pasien Budi Mulyono telah memasuki ruang periksa 101.',
              },
              isUrgent: { type: 'boolean', example: false },
              isRead: { type: 'boolean', example: false },
              createdAt: {
                type: 'string',
                example: '2026-09-17T12:00:00.000Z',
              },
            },
          },
        },
        total: { type: 'number', example: 5 },
        unreadCount: { type: 'number', example: 2 },
      },
    },
  })
  @ApiUnprocessableEntityResponse({
    description: 'Parameter query pagination tidak valid',
  })
  async getMyNotifications(
    @Query() query: QueryNotificationDto,
    @CurrentUser() user: any,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    return this.notificationRepo.findMyNotifications(user.id, {
      limit,
      offset,
      unreadOnly: query.unreadOnly,
    });
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Menandai seluruh notifikasi user telah dibaca (Mobile App)',
    description:
      'Memperbarui status readAt pada seluruh notifikasi yang belum dibaca untuk user yang sedang aktif.',
  })
  @ApiOkResponse({
    description: 'Seluruh notifikasi berhasil ditandai telah dibaca',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        updatedCount: { type: 'number', example: 4 },
      },
    },
  })
  async markAllAsRead(@CurrentUser() user: any) {
    const updatedCount = await this.notificationRepo.markAllAsRead(user.id);
    return {
      success: true,
      updatedCount,
    };
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Menandai satu notifikasi telah dibaca (Mobile App)',
    description:
      'Memperbarui status readAt pada satu notifikasi spesifik milik user.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik notifikasi',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Notifikasi berhasil ditandai telah dibaca',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Notifikasi tidak ditemukan atau bukan milik user ini',
  })
  async markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    const success = await this.notificationRepo.markAsRead(id, user.id);
    if (!success) {
      throw new NotFoundException(
        `Notifikasi dengan ID ${id} tidak ditemukan untuk user ini`,
      );
    }
    return { success: true };
  }
}
