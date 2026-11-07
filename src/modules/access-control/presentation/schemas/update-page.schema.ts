import { z } from 'zod';

export const UpdatePageSchema = z.object({
  name: z
    .string()
    .min(2, 'Nama halaman/kategori minimal 2 karakter')
    .max(150, 'Nama halaman maksimal 150 karakter')
    .optional(),
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  displayOrder: z.number().int().optional(),
  parentPageId: z
    .string()
    .uuid('ID folder induk harus berupa UUID valid')
    .optional()
    .nullable(),
  routePath: z.string().max(255).optional(),
  customAlias: z
    .string()
    .max(255)
    .regex(
      /^\/[a-z0-9-_/]+$/,
      'Custom alias harus diawali dengan / dan menggunakan karakter URL yang valid',
    )
    .optional()
    .nullable(),
  isEnabled: z.boolean().optional(),
});

export type UpdatePageInput = z.infer<typeof UpdatePageSchema>;
