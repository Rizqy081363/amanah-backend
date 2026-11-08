import { z } from 'zod';
import { parseTimeToMinutes } from '../../domain/services/shift-duration.helper';

/**
 * Validasi deterministik murni untuk memastikan jam dinas berada dalam rentang
 * yang sah di satu hari kalender operasional (00:00 s/d 24:00).
 * Nilai 00:00 (atau 24:00) saat startsAt > 0 diakui sebagai penutup tengah malam (1440 menit).
 */
export function isStrictlyChronologicalTimeRange(
  startsAt?: string,
  endsAt?: string,
): boolean {
  if (!startsAt || !endsAt) return true;
  const sMin = parseTimeToMinutes(startsAt);
  let eMin = parseTimeToMinutes(endsAt);
  if (eMin === 0 && sMin > 0) {
    eMin = 1440;
  }
  return eMin > sMin;
}

export const CreateSessionDefSchema = z
  .object({
    label: z
      .string({ message: 'Label shift wajib diisi' })
      .trim()
      .min(1, 'Label shift tidak boleh kosong'),
    code: z.string().trim().optional(),
    codePrefix: z
      .string()
      .trim()
      .min(1, 'Singkatan minimal 1 karakter')
      .max(4, 'Singkatan maksimal 4 karakter')
      .regex(/^[A-Za-z0-9]{1,4}$/, 'codePrefix harus 1-4 karakter alfanumerik')
      .optional(),
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
  })
  .refine(
    (data) =>
      isStrictlyChronologicalTimeRange(
        data.defaultStartsAt,
        data.defaultEndsAt,
      ),
    {
      message:
        'Jam selesai harus lebih lambat dari jam mulai (maksimal 24:00 dalam hari kalender yang sama)',
      path: ['defaultEndsAt'],
    },
  );

export type CreateSessionDefInput = z.infer<typeof CreateSessionDefSchema>;

export const UpdateSingleSessionDefSchema = z
  .object({
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
      ),
    icon: z
      .string()
      .trim()
      .max(100, 'Icon maksimal 100 karakter')
      .nullable()
      .optional(),
    sortOrder: z.number().int().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      isStrictlyChronologicalTimeRange(
        data.defaultStartsAt,
        data.defaultEndsAt,
      ),
    {
      message:
        'Jam selesai harus lebih lambat dari jam mulai (maksimal 24:00 dalam hari kalender yang sama)',
      path: ['defaultEndsAt'],
    },
  );

export type UpdateSingleSessionDefInput = z.infer<
  typeof UpdateSingleSessionDefSchema
>;

export const UpdateSessionDefItemSchema = z
  .object({
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
  })
  .refine(
    (data) =>
      isStrictlyChronologicalTimeRange(
        data.defaultStartsAt,
        data.defaultEndsAt,
      ),
    {
      message:
        'Jam selesai harus lebih lambat dari jam mulai (maksimal 24:00 dalam hari kalender yang sama)',
      path: ['defaultEndsAt'],
    },
  );

export const UpdateSessionDefsBatchSchema = z.object({
  defs: z
    .array(UpdateSessionDefItemSchema)
    .min(1, 'Daftar shift tidak boleh kosong'),
});

export type UpdateSessionDefsBatchInput = z.infer<
  typeof UpdateSessionDefsBatchSchema
>;
