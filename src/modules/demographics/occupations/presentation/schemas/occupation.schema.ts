import { z } from 'zod';

export const CreateOccupationSchema = z.object({
  name: z.string().min(1, 'Nama pekerjaan wajib diisi').max(128),
  description: z.string().optional().nullable(),
  displayOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export type CreateOccupationInput = z.infer<typeof CreateOccupationSchema>;

export const UpdateOccupationSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateOccupationInput = z.infer<typeof UpdateOccupationSchema>;
