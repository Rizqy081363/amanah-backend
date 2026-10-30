import { z } from 'zod';
import {
  DEFAULT_ROLE_AUDIENCE,
  ROLE_AUDIENCES,
} from '../../../../common/constants/role-audience.constants';

export const CreateRoleSchema = z.object({
  code: z
    .string({ message: 'Kode peran wajib diisi' })
    .trim()
    .min(2, 'Kode peran minimal 2 karakter')
    .max(50, 'Kode peran maksimal 50 karakter')
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'Kode peran harus dalam format snake_case huruf kecil (contoh: receptionist_lead)',
    ),
  name: z
    .string({ message: 'Nama tampilan peran wajib diisi' })
    .trim()
    .min(2, 'Nama peran minimal 2 karakter')
    .max(100, 'Nama peran maksimal 100 karakter'),
  description: z
    .string()
    .trim()
    .max(255, 'Deskripsi maksimal 255 karakter')
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
    .enum(ROLE_AUDIENCES, {
      message: 'Audiens peran harus berupa "internal" (staf klinik) atau "external" (pasien)',
    })
    .optional()
    .default(DEFAULT_ROLE_AUDIENCE),
  isClinical: z
    .boolean({ message: 'Status klinis peran harus berupa boolean' })
    .optional()
    .default(false),
  permissionIds: z
    .array(z.string().uuid('Setiap ID perizinan harus berupa UUID yang valid'))
    .optional()
    .default([]),
});

export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
