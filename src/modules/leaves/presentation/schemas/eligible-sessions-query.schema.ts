import { z } from 'zod';

export const EligibleSessionsQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format parameter date harus YYYY-MM-DD')
    .optional(),
});

export type EligibleSessionsQueryInput = z.infer<
  typeof EligibleSessionsQuerySchema
>;
