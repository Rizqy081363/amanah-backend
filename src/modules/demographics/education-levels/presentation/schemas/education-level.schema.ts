import { z } from 'zod';

export const CreateEducationLevelSchema = z.object({
  name: z.string().min(1, 'Nama jenjang pendidikan wajib diisi').max(128),
  description: z.string().optional().nullable(),
  displayOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export type CreateEducationLevelInput = z.infer<typeof CreateEducationLevelSchema>;

export const UpdateEducationLevelSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateEducationLevelInput = z.infer<typeof UpdateEducationLevelSchema>;
