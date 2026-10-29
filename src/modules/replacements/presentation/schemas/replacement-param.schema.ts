import { z } from 'zod';

export const ReplacementParamSchema = z.object({
  id: z.string().uuid('ID peluang pengganti harus berupa format UUID yang valid'),
});

export type ReplacementParamInput = z.infer<typeof ReplacementParamSchema>;
