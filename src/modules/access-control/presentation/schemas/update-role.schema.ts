import { z } from 'zod';

export const UpdateRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Nama peran minimal 2 karakter')
    .max(100, 'Nama peran maksimal 100 karakter')
    .optional(),
  description: z
    .string()
    .trim()
    .max(255, 'Deskripsi peran maksimal 255 karakter')
    .optional()
    .nullable(),
  parentRoleId: z
    .string()
    .uuid('ID peran induk harus berupa UUID yang valid')
    .optional()
    .nullable(),
  tier: z
    .enum(['macro', 'micro'], {
      message: 'Tingkatan peran harus berupa "macro" atau "micro"',
    })
    .optional(),
  audience: z
    .enum(['internal', 'external'], {
      message: 'Audiens peran harus berupa "internal" (staf klinik) atau "external" (pasien)',
    })
    .optional(),
  isClinical: z
    .boolean({ message: 'Status klinis peran harus berupa boolean' })
    .optional(),
});

export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
