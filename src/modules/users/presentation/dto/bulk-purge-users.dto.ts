import { z } from 'zod';

export const BulkPurgeUsersSchema = z.object({
  userIds: z
    .array(z.string().uuid('ID pengguna harus berupa format UUID yang valid'))
    .min(
      1,
      'Minimal satu ID pengguna wajib disertakan untuk penghapusan permanen',
    ),
});

export type BulkPurgeUsersInput = z.infer<typeof BulkPurgeUsersSchema>;
