import { z } from 'zod';
import { CANONICAL_LEAVE_STATUSES } from '../../domain/constants/leave.constants';

export const QueryLeavesSchema = z.object({
  status: z
    .enum(CANONICAL_LEAVE_STATUSES, {
      message: `Filter status harus salah satu dari: ${CANONICAL_LEAVE_STATUSES.join(', ')}`,
    })
    .optional(),
  roleId: z.string().uuid().optional(),
  roleCode: z.string().optional(),
});

export type QueryLeavesInput = z.infer<typeof QueryLeavesSchema>;
