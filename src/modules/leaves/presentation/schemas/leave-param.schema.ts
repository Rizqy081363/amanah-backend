import { z } from 'zod';

export const LeaveParamSchema = z.object({
  id: z.string().uuid('ID permohonan cuti harus berformat UUID yang valid'),
});

export type LeaveParamInput = z.infer<typeof LeaveParamSchema>;
