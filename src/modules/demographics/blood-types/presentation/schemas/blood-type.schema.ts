import { z } from 'zod';

export const CreateBloodTypeSchema = z.object({
  code: z.string().max(32).optional(),
  name: z.string().trim().min(1, 'Simbol/Nama golongan darah wajib diisi').max(16, 'Golongan darah maksimal 16 karakter'),
  description: z.string().optional().nullable(),
  displayOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export type CreateBloodTypeInput = z.infer<typeof CreateBloodTypeSchema>;

export const UpdateBloodTypeSchema = z.object({
  code: z.string().max(32).optional(),
  name: z.string().trim().min(1, 'Simbol/Nama golongan darah wajib diisi').max(16, 'Golongan darah maksimal 16 karakter').optional(),
  description: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateBloodTypeInput = z.infer<typeof UpdateBloodTypeSchema>;
