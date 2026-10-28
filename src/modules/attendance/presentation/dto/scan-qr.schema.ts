import { z } from 'zod';
import {
  ATTENDANCE_METHODS,
} from '../../domain/constants/attendance.constants';

export const ScanQrSchema = z.object({
  qrToken: z
    .string({ message: 'Token QR wajib disertakan' })
    .trim()
    .min(1, 'Token QR tidak boleh kosong'),
  method: z.enum(ATTENDANCE_METHODS).optional(),
  shift: z.string().trim().min(1).optional(),
  deviceInfo: z.string().max(255).optional(),
  sessionId: z.string().uuid('sessionId harus berformat UUID').optional(),
});

export type ScanQrInput = z.infer<typeof ScanQrSchema>;
