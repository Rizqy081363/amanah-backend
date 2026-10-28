import { z } from 'zod';

export const UpdateScheduleSchema = z.object({
  session: z.string().optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Format startTime harus HH:mm atau HH:mm:ss')
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Format endTime harus HH:mm atau HH:mm:ss')
    .optional(),
  roomId: z.string().uuid('roomId harus berformat UUID').optional(),
  poliklinikId: z.string().uuid('poliklinikId harus berformat UUID').optional(),
  serviceId: z.string().uuid('serviceId harus berformat UUID').optional(),
  status: z.enum(['open', 'closed']).optional(),
  isAvailable: z.boolean().optional(),
  notes: z.string().max(500, 'Catatan maksimal 500 karakter').optional(),
});

export type UpdateScheduleInput = z.infer<typeof UpdateScheduleSchema>;
