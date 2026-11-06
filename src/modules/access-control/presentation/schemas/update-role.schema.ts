import { z } from 'zod';
import { ROLE_AUDIENCES } from '../../../../common/constants/role-audience.constants';

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
  audience: z
    .enum(ROLE_AUDIENCES, {
      message:
        'Audiens peran harus berupa "internal" (staf klinik) atau "external" (pasien)',
    })
    .optional(),
  isClinical: z
    .boolean({ message: 'Status klinis peran harus berupa boolean' })
    .optional(),
  isActive: z
    .boolean({ message: 'Status aktif peran harus berupa boolean' })
    .optional(),
  isDefault: z
    .boolean({ message: 'Status peran default harus berupa boolean' })
    .optional(),
});

export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
