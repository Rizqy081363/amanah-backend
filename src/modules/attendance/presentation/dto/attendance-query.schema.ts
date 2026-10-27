import { z } from 'zod';

export const AttendanceQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date harus YYYY-MM-DD')
    .optional(),
  shift: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  search: z.string().max(100).optional(),
});

export type AttendanceQueryInput = z.infer<typeof AttendanceQuerySchema>;
