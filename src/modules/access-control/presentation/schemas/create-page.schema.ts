import { z } from 'zod';

export const CreatePageSchema = z.object({
  slug: z
    .string()
    .min(2, 'Slug minimal 2 karakter')
    .max(100, 'Slug maksimal 100 karakter')
    .regex(
      /^[a-z][a-z0-9_.:-]*$/,
      'Slug harus diawali huruf kecil dan hanya boleh mengandung huruf kecil, angka, titik, minus, atau garis bawah',
    ),
  name: z
    .string()
    .min(2, 'Nama halaman/kategori minimal 2 karakter')
    .max(150, 'Nama halaman maksimal 150 karakter'),
  description: z.string().max(500).optional().nullable(),
  routePath: z.string().default('#'),
  parentPageId: z.string().uuid('ID folder induk harus berupa UUID valid').optional().nullable(),
  audience: z.enum(['internal', 'external']).default('internal'),
  customAlias: z
    .string()
    .max(255)
    .regex(
      /^\/[a-z0-9-_/]+$/,
      'Custom alias harus diawali dengan / dan menggunakan karakter URL yang valid',
    )
    .optional()
    .nullable(),
  icon: z.string().max(50).default('folder'),
  displayOrder: z.number().int().default(100),
});

export type CreatePageInput = z.infer<typeof CreatePageSchema>;
