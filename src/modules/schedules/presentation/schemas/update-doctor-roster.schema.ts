import { z } from 'zod';

export const UpdateDoctorRosterAssignmentItemSchema = z.object({
  dow: z.number().int().min(0).max(6),
  sessionId: z.string().uuid('sessionId harus berformat UUID'),
  isActive: z.boolean(),
  preferredRoomId: z.string().uuid().nullable().optional(),
});

export const UpdateDoctorRosterSchema = z.object({
  assignments: z
    .array(UpdateDoctorRosterAssignmentItemSchema)
    .min(1, 'Daftar assignments tidak boleh kosong'),
  reason: z.string().trim().max(500, 'Alasan maksimal 500 karakter').optional(),
});

export type UpdateDoctorRosterInput = z.infer<typeof UpdateDoctorRosterSchema>;
export type UpdateDoctorRosterAssignmentItemInput = z.infer<
  typeof UpdateDoctorRosterAssignmentItemSchema
>;
