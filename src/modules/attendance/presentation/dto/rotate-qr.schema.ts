import { z } from 'zod';
import { CANONICAL_STAFF_SHIFT_VALUES } from '../../domain/constants/attendance.constants';

export const RotateQrSchema = z.object({
  sessionType: z.enum(['location_check_in', 'staff_identity']).optional(),
  shift: z.enum(CANONICAL_STAFF_SHIFT_VALUES).optional(),
  rotationSeconds: z.number().int().positive().optional(),
  context: z.string().max(255).optional(),
});

export type RotateQrInput = z.infer<typeof RotateQrSchema>;
