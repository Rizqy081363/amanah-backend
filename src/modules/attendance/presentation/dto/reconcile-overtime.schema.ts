import { z } from 'zod';
import { RECONCILE_DECISION } from '../../domain/constants/attendance.constants';

export const ReconcileOvertimeSchema = z.object({
  attendanceId: z
    .string()
    .uuid('ID catatan presensi harus berformat UUID yang valid'),
  decision: z.enum(
    [
      RECONCILE_DECISION.APPROVED_OVERTIME,
      RECONCILE_DECISION.REJECTED_OVERTIME,
    ],
    {
      message:
        "Keputusan rekonsiliasi harus 'approved_overtime' atau 'rejected_overtime'",
    },
  ),
  overtimeHours: z
    .number()
    .min(0, 'Durasi lembur tidak boleh kurang dari 0')
    .max(24, 'Durasi lembur tidak boleh melebihi 24 jam')
    .optional(),
  adminNotes: z
    .string()
    .trim()
    .max(500, 'Catatan admin maksimal 500 karakter')
    .optional(),
});

export type ReconcileOvertimeInput = z.infer<typeof ReconcileOvertimeSchema>;
