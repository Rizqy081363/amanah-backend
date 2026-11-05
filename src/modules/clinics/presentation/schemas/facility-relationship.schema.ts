import { z } from 'zod';

export const CreateFacilityRelationshipSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nama relasi pasien tidak boleh kosong')
    .max(128, 'Nama relasi pasien maksimal 128 karakter')
    .regex(
      /^[a-zA-Z0-9\s-]+$/,
      'Nama relasi hanya boleh berisi huruf, angka, spasi, atau tanda hubung (-)',
    ),
  code: z
    .string()
    .trim()
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'Kode relasi harus diawali huruf kecil dan hanya berisi huruf, angka, atau underscore',
    )
    .max(64, 'Kode relasi maksimal 64 karakter')
    .optional(),
  description: z.string().trim().max(255).optional(),
  iconName: z.string().trim().max(64).default('user'),
  displayOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  isSystem: z.boolean().default(false).optional(),
  allowsMultiple: z.boolean().default(true).optional(),
});

export type CreateFacilityRelationshipInput = z.infer<
  typeof CreateFacilityRelationshipSchema
>;

export const UpdateFacilityRelationshipSchema =
  CreateFacilityRelationshipSchema.partial();
export type UpdateFacilityRelationshipInput = z.infer<
  typeof UpdateFacilityRelationshipSchema
>;

export const FacilityRelationshipParamSchema = z.object({
  id: z.string().uuid('ID relasi pasien harus berupa UUID yang valid'),
});
export type FacilityRelationshipParamInput = z.infer<
  typeof FacilityRelationshipParamSchema
>;
