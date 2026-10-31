import { z } from 'zod';

export const RoleParamSchema = z.object({
  id: z.string().uuid('ID peran harus berupa format UUID yang valid'),
});

export type RoleParamInput = z.infer<typeof RoleParamSchema>;

export const RolePermissionParamSchema = z.object({
  id: z.string().uuid('ID peran harus berupa format UUID yang valid'),
  permissionId: z
    .string()
    .uuid('ID perizinan harus berupa format UUID yang valid'),
});

export type RolePermissionParamInput = z.infer<
  typeof RolePermissionParamSchema
>;
