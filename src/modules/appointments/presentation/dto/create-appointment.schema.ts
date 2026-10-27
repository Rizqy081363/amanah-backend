import { z } from 'zod';
import {
  CANONICAL_STAFF_SHIFTS,
} from '../../../schedules/domain/constants/schedule-shift.constants';

export const CreateAppointmentSchema = z.object({
  patientId: z.string().uuid('patientId harus berformat UUID').optional(),
  poliklinikId: z
    .string({ message: 'poliklinikId wajib diisi' })
    .uuid('poliklinikId harus berformat UUID'),
  layananId: z
    .string({ message: 'layananId wajib diisi' })
    .uuid('layananId harus berformat UUID'),
  staffId: z.string().uuid('staffId harus berformat UUID').optional(),
  appointmentDate: z
    .string({ message: 'appointmentDate wajib diisi' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format appointmentDate harus YYYY-MM-DD'),
  session: z.enum(CANONICAL_STAFF_SHIFTS, {
    message:
      'Sesi jadwal harus salah satu dari: early_morning, morning, afternoon, night',
  }),
  visitType: z.enum(['new_visit', 'follow_up'], {
    message: 'Tipe kunjungan (visitType) harus new_visit atau follow_up',
  }),
  complaint: z
    .string()
    .max(1000, 'Keluhan maksimal 1000 karakter')
    .optional(),
  sourceIntakeId: z
    .string()
    .uuid('sourceIntakeId harus berformat UUID')
    .optional(),
});

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;
