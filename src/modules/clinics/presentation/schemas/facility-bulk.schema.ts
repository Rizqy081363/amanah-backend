import { z } from 'zod';

export const FACILITY_RESOURCES = [
  'unit-types',
  'units',
  'rooms',
  'categories',
  'services',
  'forms',
] as const;

export const FACILITY_ACTIONS = ['activate', 'deactivate', 'delete'] as const;

export const BulkFacilityActionSchema = z.object({
  resource: z.enum(FACILITY_RESOURCES, {
    message: 'Resource fasilitas tidak valid',
  }),
  action: z.enum(FACILITY_ACTIONS, {
    message: 'Aksi massal tidak valid (activate | deactivate | delete)',
  }),
  ids: z
    .array(z.string().uuid('Setiap ID harus berupa UUID v4 yang valid'))
    .min(1, 'Minimal satu ID harus dipilih untuk aksi massal')
    .max(100, 'Maksimal 100 ID dapat diproses dalam satu aksi massal'),
});

export type BulkFacilityActionInput = z.infer<typeof BulkFacilityActionSchema>;
