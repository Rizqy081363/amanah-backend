import { z } from 'zod';

export const CreateFacilityUnitSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nama unit tidak boleh kosong')
    .max(150, 'Nama unit maksimal 150 karakter'),
  code: z
    .string()
    .trim()
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'Kode unit harus diawali huruf kecil dan hanya berisi huruf, angka, atau underscore',
    )
    .max(64, 'Kode unit maksimal 64 karakter')
    .optional(),
  unitTypeId: z.string().uuid('ID tipe unit harus berupa UUID v4 yang valid'),
  queuePrefix: z
    .string()
    .trim()
    .max(8, 'Prefix antrean maksimal 8 karakter')
    .optional(),
  iconName: z.string().trim().max(64).default('building-2'),
  location: z.string().trim().max(255).optional(),
  floor: z.string().trim().max(20).optional(),
  isActive: z.boolean().default(true),
});

export type CreateFacilityUnitInput = z.infer<typeof CreateFacilityUnitSchema>;

export const UpdateFacilityUnitSchema = CreateFacilityUnitSchema.partial();
export type UpdateFacilityUnitInput = z.infer<typeof UpdateFacilityUnitSchema>;

export const FacilityUnitParamSchema = z.object({
  id: z.string().uuid('ID unit harus berupa UUID yang valid'),
});
export type FacilityUnitParamInput = z.infer<typeof FacilityUnitParamSchema>;
