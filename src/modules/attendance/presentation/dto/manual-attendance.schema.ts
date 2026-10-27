import { z } from 'zod';
import {
  ATTENDANCE_STATUSES,
  CANONICAL_STAFF_SHIFTS,
} from '../../domain/constants/attendance.constants';

export const ManualAttendanceSchema = z.object({
  staffIdOrCode: z
    .string({ message: 'staffIdOrCode wajib diisi' })
    .trim()
    .min(1, 'staffIdOrCode tidak boleh kosong'),
  shift: z.enum(CANONICAL_STAFF_SHIFTS as unknown as [string, ...string[]]).optional(),
  status: z.enum(ATTENDANCE_STATUSES as unknown as [string, ...string[]]).optional(),
  attendanceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendanceDate harus YYYY-MM-DD')
    .optional(),
  notes: z.string().trim().max(500).optional(),
});

export type ManualAttendanceInput = z.infer<typeof ManualAttendanceSchema>;
