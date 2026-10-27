import { z } from 'zod';

export const QueryScheduleSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date harus YYYY-MM-DD')
    .optional(),
  poliklinikId: z.string().uuid('poliklinikId harus berformat UUID').optional(),
  staffId: z.string().uuid('staffId harus berformat UUID').optional(),
});

export type QueryScheduleInput = z.infer<typeof QueryScheduleSchema>;
