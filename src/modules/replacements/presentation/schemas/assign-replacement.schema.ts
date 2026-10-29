import { z } from 'zod';

export const AssignReplacementSchema = z.object({
  staffProfileId: z
    .string()
    .uuid('ID profil staf pengganti harus berupa format UUID yang valid'),
  notes: z.string().optional(),
});

export type AssignReplacementInput = z.infer<typeof AssignReplacementSchema>;
