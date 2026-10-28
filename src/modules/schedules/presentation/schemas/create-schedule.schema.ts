import { z } from 'zod';

export const CreateScheduleSchema = z.object({
  staffId: z.string().uuid('staffId harus berformat UUID').optional(),
  poliklinikId: z.string().uuid('poliklinikId harus berformat UUID').optional(),
  roomId: z.string().uuid('roomId harus berformat UUID').optional(),
  serviceId: z.string().uuid('serviceId harus berformat UUID').optional(),
  scheduleDate: z
    .string({ message: 'scheduleDate wajib diisi' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format scheduleDate harus YYYY-MM-DD'),
  session: z.string().min(1, 'Sesi wajib diisi'),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Format startTime harus HH:mm atau HH:mm:ss')
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Format endTime harus HH:mm atau HH:mm:ss')
    .optional(),
  isAvailable: z.boolean().default(true),
  notes: z.string().max(500, 'Catatan maksimal 500 karakter').optional(),
});

export type CreateScheduleInput = z.infer<typeof CreateScheduleSchema>;
