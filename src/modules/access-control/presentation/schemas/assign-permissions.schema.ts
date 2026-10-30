import { z } from 'zod';

export const AssignPermissionsSchema = z.object({
  permissionIds: z.array(
    z.string().uuid('Setiap ID perizinan harus berupa format UUID yang valid'),
    { message: 'Daftar permissionIds wajib berupa array UUID' },
  ),
});

export type AssignPermissionsInput = z.infer<typeof AssignPermissionsSchema>;
