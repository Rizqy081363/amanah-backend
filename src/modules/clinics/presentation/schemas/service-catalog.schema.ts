import { z } from 'zod';

export const ServiceCatalogItemSchema = z.object({
  id: z.string().uuid('ID layanan harus berupa UUID v4'),
  code: z.string().min(1, 'Kode layanan wajib diisi'),
  name: z.string().min(1, 'Nama layanan wajib diisi'),
  prefix: z.string().min(1, 'Prefix layanan wajib diisi'),
  description: z.string().nullable().optional(),
  iconName: z.string().default('stethoscope'),
  imageUrl: z.string().nullable().optional(),
  specialtyCode: z.string().nullable().optional(),
  intakeFormId: z.string().uuid().nullable().optional(),
  intakeFormCode: z.string().nullable().optional(),
  intakeFormName: z.string().nullable().optional(),
  displayOrder: z.number().int().nonnegative().default(0),
  categoryId: z.string().uuid('ID kategori harus berupa UUID v4'),
  poliklinikId: z.string().uuid('ID poliklinik harus berupa UUID v4').nullable().optional(),
  poliklinikName: z.string().nullable().optional(),
  complaints: z.array(z.string()).default([]),
  isBookable: z.boolean().default(true),
});

export type ServiceCatalogItemInput = z.infer<typeof ServiceCatalogItemSchema>;

export const ServiceCategoryCatalogSchema = z.object({
  id: z.string().uuid('ID kategori harus berupa UUID v4'),
  code: z.string().min(1, 'Kode kategori wajib diisi'),
  name: z.string().min(1, 'Nama kategori wajib diisi'),
  iconName: z.string().default('folder'),
  description: z.string().nullable().optional(),
  displayOrder: z.number().int().nonnegative().default(0),
  poliklinikId: z.string().uuid('ID poliklinik harus berupa UUID v4').nullable().optional(),
  poliklinikName: z.string().nullable().optional(),
  unitIds: z.array(z.string().uuid()).default([]),
  units: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
      }),
    )
    .default([]),
  services: z.array(ServiceCatalogItemSchema).default([]),
});

export type ServiceCategoryCatalogInput = z.infer<
  typeof ServiceCategoryCatalogSchema
>;

export const ServiceCatalogResponseSchema = z.object({
  success: z.boolean().default(true),
  categories: z.array(ServiceCategoryCatalogSchema).default([]),
});

export type ServiceCatalogResponseInput = z.infer<
  typeof ServiceCatalogResponseSchema
>;
