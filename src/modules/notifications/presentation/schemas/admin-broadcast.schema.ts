import { z } from 'zod';
import {
  DEFAULT_NOTIFICATION_AUDIENCE,
  isNotificationAudience,
  NotificationAudience,
  NotificationAudienceTarget,
  NOTIFICATION_AUDIENCES,
} from '../../../../common/constants/notification-audience.constants';

export const ADMIN_BROADCAST_TARGET_SCOPES = [
  ...NOTIFICATION_AUDIENCES,
  'roles',
] as const;
export type AdminBroadcastTargetScope =
  (typeof ADMIN_BROADCAST_TARGET_SCOPES)[number];

export const resolveAudienceTarget = (
  targetScope: AdminBroadcastTargetScope,
  roleAudience?: NotificationAudience | null,
  singleRoleId?: string | null,
): NotificationAudienceTarget =>
  isNotificationAudience(targetScope)
    ? { audience: targetScope }
    : {
        audience: roleAudience ?? DEFAULT_NOTIFICATION_AUDIENCE,
        targetRoleId: singleRoleId ?? null,
      };

export const AdminBroadcastSchema = z
  .object({
    title: z
      .string({ message: 'Judul siaran notifikasi wajib diisi' })
      .trim()
      .min(3, 'Judul siaran minimal 3 karakter')
      .max(200, 'Judul siaran maksimal 200 karakter'),
    body: z
      .string({ message: 'Isi siaran notifikasi wajib diisi' })
      .trim()
      .min(3, 'Isi siaran minimal 3 karakter')
      .max(2000, 'Isi siaran maksimal 2000 karakter'),
    targetScope: z.enum(ADMIN_BROADCAST_TARGET_SCOPES, {
      message:
        'targetScope harus salah satu dari: all (seluruh pengguna), internal (seluruh staf), external (seluruh pasien/publik), roles (peran terpilih)',
    }),
    targetRoleIds: z
      .array(
        z
          .string()
          .uuid('Setiap targetRoleId harus berupa format UUID yang valid'),
      )
      .optional()
      .default([]),
    category: z
      .enum(['system', 'announcement', 'shift', 'clinical'])
      .optional()
      .default('announcement'),
    priority: z.enum(['high', 'normal', 'low']).optional().default('normal'),
    channels: z
      .array(z.enum(['in_app', 'push', 'email']))
      .optional()
      .default(['in_app', 'push']),
  })
  .superRefine((data, ctx) => {
    if (
      data.targetScope === 'roles' &&
      (!data.targetRoleIds || data.targetRoleIds.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetRoleIds'],
        message:
          'Daftar targetRoleIds wajib disertakan jika targetScope adalah "roles"',
      });
    }
  });

export type AdminBroadcastInput = z.infer<typeof AdminBroadcastSchema>;
