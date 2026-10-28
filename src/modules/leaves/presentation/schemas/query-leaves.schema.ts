import { z } from 'zod';
import { CANONICAL_LEAVE_STATUSES } from '../../domain/constants/leave.constants';

export const QueryLeavesSchema = z.object({
  status: z
    .enum(CANONICAL_LEAVE_STATUSES, {
      message: `Filter status harus salah satu dari: ${CANONICAL_LEAVE_STATUSES.join(', ')}`,
    })
    .optional(),
  staffType: z
    .enum(['doctor', 'midwife', 'worker'], {
      message: "Filter jenis staf harus 'doctor', 'midwife', atau 'worker'",
    })
    .optional(),
});

export type QueryLeavesInput = z.infer<typeof QueryLeavesSchema>;
