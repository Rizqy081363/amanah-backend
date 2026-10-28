import { z } from 'zod';

export const ReviewLeaveSchema = z.object({
  status: z.enum(['approved', 'rejected'], {
    message: "Status keputusan cuti harus 'approved' atau 'rejected'",
  }),
  approvalNotes: z
    .string()
    .trim()
    .max(1000, 'Catatan persetujuan maksimal 1000 karakter')
    .optional()
    .nullable(),
});

export type ReviewLeaveInput = z.infer<typeof ReviewLeaveSchema>;
