import { z } from 'zod';

export const RotateQrSchema = z.object({
  sessionType: z.enum(['location_check_in', 'staff_identity']).optional(),
  shift: z.string().trim().min(1).optional(),
  rotationSeconds: z.number().int().positive().optional(),
  context: z.string().max(255).optional(),
});

export type RotateQrInput = z.infer<typeof RotateQrSchema>;
