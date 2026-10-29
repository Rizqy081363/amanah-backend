import { z } from 'zod';

export const CancelReplacementSchema = z.object({
  reason: z.string().optional(),
});

export type CancelReplacementInput = z.infer<typeof CancelReplacementSchema>;
