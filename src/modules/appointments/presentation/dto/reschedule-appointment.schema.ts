import { isUUID } from 'class-validator';
import { z } from 'zod';

export const RescheduleAppointmentSchema = z
  .object({
    target_date: z
      .string()
      .min(1, 'target_date wajib diisi')
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format target_date harus YYYY-MM-DD'),
    session: z
      .string()
      .trim()
      .transform((val) => (val === '' ? undefined : val))
      .optional(),
    target_session_id: z
      .string()
      .trim()
      .refine((val) => val === '' || isUUID(val), {
        message: 'target_session_id harus berupa UUID valid',
      })
      .transform((val) => (val === '' ? undefined : val))
      .optional(),
    target_start_time: z
      .string()
      .regex(
        /^\d{2}:\d{2}(:\d{2})?$/,
        'Format target_start_time harus HH:MM atau HH:MM:SS',
      )
      .optional(),
    target_end_time: z
      .string()
      .regex(
        /^\d{2}:\d{2}(:\d{2})?$/,
        'Format target_end_time harus HH:MM atau HH:MM:SS',
      )
      .optional(),
    reason: z
      .string()
      .max(500, 'Alasan reschedule maksimal 500 karakter')
      .optional(),
  })
  .refine(
    (data) =>
      data.session !== undefined || data.target_session_id !== undefined,
    {
      message:
        'Salah satu dari session (shift) atau target_session_id (UUID) wajib disertakan.',
      path: ['session'],
    },
  );

export type RescheduleAppointmentInput = z.infer<
  typeof RescheduleAppointmentSchema
>;
