import { z } from 'zod';
import { USER_STATUSES } from '../../../../common/constants';

export const UpdateUserStatusSchema = z.object({
  status: z.enum(['pending_verification', 'active', 'inactive', 'suspended'], {
    message:
      'Status harus salah satu dari: active, inactive, pending_verification, suspended',
  }),
});

export type UpdateUserStatusInput = z.infer<typeof UpdateUserStatusSchema>;

export const UserParamSchema = z.object({
  id: z.string().uuid('ID pengguna harus berupa format UUID yang valid'),
});

export type UserParamInput = z.infer<typeof UserParamSchema>;
