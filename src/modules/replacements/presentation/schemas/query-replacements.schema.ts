import { z } from 'zod';
import { REPLACEMENT_OPPORTUNITY_STATUSES } from '../../../../database/schema';

export const QueryReplacementsSchema = z.object({
  date: z
    .union([
      z.literal('all'),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD atau all'),
    ])
    .optional(),
  exactDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
    .optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
    .optional(),
  status: z
    .enum(['all', ...REPLACEMENT_OPPORTUNITY_STATUSES], {
      message: `Filter status harus salah satu dari: all, ${REPLACEMENT_OPPORTUNITY_STATUSES.join(', ')}`,
    })
    .optional(),
  staffProfileId: z
    .string()
    .uuid('ID profil staf harus berupa format UUID yang valid')
    .optional(),
});

export type QueryReplacementsInput = z.infer<typeof QueryReplacementsSchema>;
