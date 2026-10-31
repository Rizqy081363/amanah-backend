import { z } from 'zod';

export const CreateFacilityUnitTypeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nama tipe unit tidak boleh kosong')
    .max(100, 'Nama tipe unit maksimal 100 karakter'),
  code: z
    .string()
    .trim()
    .min(1, 'Kode tipe unit tidak boleh kosong')
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'Kode tipe unit harus diawali huruf kecil dan hanya berisi huruf, angka, atau underscore',
    )
    .max(64, 'Kode tipe unit maksimal 64 karakter'),
  description: z.string().trim().max(255).optional(),
  iconName: z.string().trim().max(64).default('building-2'),
  isActive: z.boolean().default(true),
});

export type CreateFacilityUnitTypeInput = z.infer<
  typeof CreateFacilityUnitTypeSchema
>;

export const UpdateFacilityUnitTypeSchema =
  CreateFacilityUnitTypeSchema.partial();
export type UpdateFacilityUnitTypeInput = z.infer<
  typeof UpdateFacilityUnitTypeSchema
>;

export const FacilityUnitTypeParamSchema = z.object({
  id: z.string().uuid('ID tipe unit harus berupa UUID yang valid'),
});
export type FacilityUnitTypeParamInput = z.infer<
  typeof FacilityUnitTypeParamSchema
>;
