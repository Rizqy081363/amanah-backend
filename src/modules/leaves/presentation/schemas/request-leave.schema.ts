import { z } from 'zod';
import {
  CANONICAL_LEAVE_SCOPES,
  CANONICAL_LEAVE_TYPES,
} from '../../domain/constants/leave.constants';

export function createRequestLeaveSchema(minAllowedDate?: string) {
  return z
    .object({
      startDate: z
        .string({ message: 'Tanggal awal cuti/izin wajib diisi' })
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format startDate harus YYYY-MM-DD'),
      endDate: z
        .string({ message: 'Tanggal akhir cuti/izin wajib diisi' })
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format endDate harus YYYY-MM-DD'),
      scope: z
        .enum(CANONICAL_LEAVE_SCOPES, {
          message: 'Cakupan permohonan harus salah satu dari: session, full_day',
        })
        .default('full_day'),
      sessionIds: z
        .array(z.string().uuid('ID sesi dinas harus berformat UUID'))
        .optional(),
      reason: z
        .string({ message: 'Alasan permohonan cuti wajib diisi' })
        .trim()
        .min(1, 'Alasan permohonan cuti tidak boleh kosong'),
      type: z.enum(CANONICAL_LEAVE_TYPES, {
        message: `Tipe cuti harus salah satu dari: ${CANONICAL_LEAVE_TYPES.join(', ')}`,
      }),
      substituteStaffId: z
        .string()
        .uuid('ID staf pengganti harus berformat UUID')
        .optional()
        .nullable(),
      documentUrl: z
        .string()
        .url('Format URL dokumen pendukung tidak valid')
        .optional()
        .nullable()
        .or(z.literal('')),
    })
    .superRefine((data, ctx) => {
      if (minAllowedDate && data.startDate < minAllowedDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['startDate'],
          message: 'Tanggal permohonan izin tidak boleh di masa lalu (minimal hari ini)',
        });
      }

      if (data.endDate < data.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endDate'],
          message: 'Tanggal akhir cuti tidak boleh mendahului tanggal awal cuti',
        });
      }

      if (data.scope === 'session') {
        if (!data.sessionIds || data.sessionIds.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['sessionIds'],
            message: 'Sesi praktik harus dipilih untuk permohonan izin parsial',
          });
        }

        if (data.startDate !== data.endDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endDate'],
            message: 'Permohonan izin per sesi hanya berlaku untuk 1 hari kerja yang sama',
          });
        }
      }
    });
}

export const RequestLeaveSchema = createRequestLeaveSchema();
export type RequestLeaveInput = z.infer<typeof RequestLeaveSchema>;
