import { z } from 'zod';

export const PermissionParamSchema = z.object({
  id: z.string().uuid('ID perizinan harus berupa format UUID yang valid'),
});

export type PermissionParamInput = z.infer<typeof PermissionParamSchema>;
