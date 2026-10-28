import { z } from 'zod';
import {
  ATTENDANCE_STATUS_VALUES,
  CANONICAL_STAFF_SHIFT_VALUES,
} from '../../domain/constants/attendance.constants';

export const ManualAttendanceSchema = z.object({
  staffIdOrCode: z
    .string({ message: 'staffIdOrCode wajib diisi' })
    .trim()
    .min(1, 'staffIdOrCode tidak boleh kosong'),
  shift: z.enum(CANONICAL_STAFF_SHIFT_VALUES).optional(),
  status: z.enum(ATTENDANCE_STATUS_VALUES).default('present'),
  attendanceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendanceDate harus YYYY-MM-DD')
    .optional(),
  notes: z.string().trim().max(500).optional(),
});

export type ManualAttendanceInput = z.infer<typeof ManualAttendanceSchema>;
