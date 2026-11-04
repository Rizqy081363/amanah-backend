import { z } from 'zod';

export const CreateReligionSchema = z.object({
  name: z.string().min(1, 'Nama agama wajib diisi').max(128),
  description: z.string().optional().nullable(),
  displayOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export type CreateReligionInput = z.infer<typeof CreateReligionSchema>;

export const UpdateReligionSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateReligionInput = z.infer<typeof UpdateReligionSchema>;
