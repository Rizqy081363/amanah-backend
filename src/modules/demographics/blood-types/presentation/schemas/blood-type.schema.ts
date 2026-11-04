import { z } from 'zod';

export const CreateBloodTypeSchema = z.object({
  name: z.string().min(1, 'Simbol/Nama golongan darah wajib diisi').max(32),
  description: z.string().optional().nullable(),
  displayOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export type CreateBloodTypeInput = z.infer<typeof CreateBloodTypeSchema>;

export const UpdateBloodTypeSchema = z.object({
  name: z.string().min(1).max(32).optional(),
  description: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateBloodTypeInput = z.infer<typeof UpdateBloodTypeSchema>;
