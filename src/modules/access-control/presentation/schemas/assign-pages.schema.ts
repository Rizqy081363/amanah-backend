import { isUUID } from 'class-validator';
import { z } from 'zod';

export const AssignPagesSchema = z.object({
  pageIds: z.array(
    z.string().refine((val) => isUUID(val), {
      message: 'Setiap ID halaman harus berupa UUID yang valid',
    }),
    { message: 'Daftar ID halaman wajib disertakan' },
  ),
});

export type AssignPagesInput = z.infer<typeof AssignPagesSchema>;
