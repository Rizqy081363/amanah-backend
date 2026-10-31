import { z } from 'zod';

export const QueryUsersSchema = z.object({
  search: z.string().trim().optional(),
  roleId: z.string().trim().optional(),
  status: z.string().trim().optional(),
  audience: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().trim().optional(),
});

export type QueryUsersInput = z.infer<typeof QueryUsersSchema>;
