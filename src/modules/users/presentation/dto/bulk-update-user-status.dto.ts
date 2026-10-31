import { z } from 'zod';
import { USER_STATUSES } from '../../../../common/constants';

export const BulkUpdateUserStatusSchema = z.object({
  userIds: z
    .array(z.string().uuid('ID pengguna harus berupa format UUID yang valid'))
    .min(1, 'Minimal satu ID pengguna wajib disertakan'),
  status: z.enum(['pending_verification', 'active', 'inactive', 'suspended'], {
    message: 'Status harus salah satu dari: active, inactive, pending_verification, suspended',
  }),
});

export type BulkUpdateUserStatusInput = z.infer<
  typeof BulkUpdateUserStatusSchema
>;
