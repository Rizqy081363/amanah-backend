import { z } from 'zod';
import { ATTENDANCE_METHODS } from '../../domain/constants/attendance.constants';

export const CheckOutSchema = z.object({
  staffId: z
    .string()
    .trim()
    .min(1, 'staffId tidak boleh kosong')
    .optional(),
  attendanceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendanceDate harus YYYY-MM-DD')
    .optional(),
  qrToken: z.string().trim().min(1).optional(),
  method: z.enum(ATTENDANCE_METHODS as unknown as [string, ...string[]]).optional(),
  notes: z.string().trim().max(500).optional(),
  checkoutTicket: z.string().trim().min(1).optional(),
});

export type CheckOutInput = z.infer<typeof CheckOutSchema>;
