import { z } from 'zod';

export const CreateSessionDefSchema = z.object({
  label: z
    .string({ message: 'Label shift wajib diisi' })
    .trim()
    .min(1, 'Label shift tidak boleh kosong'),
  code: z.string().trim().optional(),
  codePrefix: z
    .string({ message: 'Singkatan / kode huruf wajib diisi' })
    .trim()
    .min(1, 'Singkatan minimal 1 karakter')
    .max(4, 'Singkatan maksimal 4 karakter')
    .regex(/^[A-Za-z0-9]{1,4}$/, 'codePrefix harus 1-4 karakter alfanumerik'),
  defaultStartsAt: z
    .string({ message: 'Jam mulai wajib diisi' })
    .regex(
      /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
      'Format defaultStartsAt harus HH:mm atau HH:mm:ss',
    ),
  defaultEndsAt: z
    .string({ message: 'Jam selesai wajib diisi' })
    .regex(
      /^(([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?|24:00(:00)?)$/,
      'Format defaultEndsAt harus HH:mm atau HH:mm:ss',
    ),
  icon: z
    .string()
    .trim()
    .max(100, 'Icon maksimal 100 karakter')
    .nullable()
    .optional(),
  sortOrder: z.number().int().min(1).optional(),
  isActive: z.boolean().default(true).optional(),
});

export type CreateSessionDefInput = z.infer<typeof CreateSessionDefSchema>;

export const UpdateSingleSessionDefSchema = z.object({
  label: z.string().trim().min(1).optional(),
  codePrefix: z
    .string()
    .trim()
    .min(1)
    .max(4)
    .regex(/^[A-Za-z0-9]{1,4}$/, 'codePrefix harus 1-4 karakter alfanumerik')
    .optional(),
  defaultStartsAt: z
    .string()
    .regex(
      /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
      'Format defaultStartsAt harus HH:mm atau HH:mm:ss',
    ),
  defaultEndsAt: z
    .string()
    .regex(
      /^(([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?|24:00(:00)?)$/,
      'Format defaultEndsAt harus HH:mm atau HH:mm:ss',
    ),
  icon: z
    .string()
    .trim()
    .max(100, 'Icon maksimal 100 karakter')
    .nullable()
    .optional(),
  sortOrder: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateSingleSessionDefInput = z.infer<
  typeof UpdateSingleSessionDefSchema
>;

export const UpdateSessionDefItemSchema = z.object({
  id: z.string().uuid('id harus berformat UUID valid'),
  label: z.string().trim().min(1).optional(),
  codePrefix: z
    .string()
    .trim()
    .min(1)
    .max(4)
    .regex(/^[A-Za-z0-9]{1,4}$/, 'codePrefix harus 1-4 karakter alfanumerik')
    .optional(),
  defaultStartsAt: z
    .string()
    .regex(
      /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
      'Format defaultStartsAt harus HH:mm atau HH:mm:ss',
    )
    .optional(),
  defaultEndsAt: z
    .string()
    .regex(
      /^(([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?|24:00(:00)?)$/,
      'Format defaultEndsAt harus HH:mm atau HH:mm:ss',
    )
    .optional(),
  icon: z
    .string()
    .trim()
    .max(100, 'Icon maksimal 100 karakter')
    .nullable()
    .optional(),
  sortOrder: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

export const UpdateSessionDefsBatchSchema = z.object({
  defs: z
    .array(UpdateSessionDefItemSchema)
    .min(1, 'Daftar shift tidak boleh kosong'),
});

export type UpdateSessionDefsBatchInput = z.infer<
  typeof UpdateSessionDefsBatchSchema
>;
