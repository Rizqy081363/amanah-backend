import { z } from 'zod';

export const RestorePreviewSchema = z.object({
  format: z.string().min(1, 'Format file cadangan wajib ditentukan'),
  fileContent: z.string().min(1, 'Konten berkas tidak boleh kosong'),
});

export type RestorePreviewInput = z.infer<typeof RestorePreviewSchema>;

export const RestoreExecuteSchema = z.object({
  format: z.string().min(1, 'Format file cadangan wajib ditentukan'),
  fileContent: z.string().min(1, 'Konten berkas tidak boleh kosong'),
  duplicateStrategy: z.enum(['skip', 'update']).default('skip'),
});

export type RestoreExecuteInput = z.infer<typeof RestoreExecuteSchema>;

export const ExportUsersQuerySchema = z.object({
  format: z.string().default('json'),
});

export type ExportUsersQueryInput = z.infer<typeof ExportUsersQuerySchema>;
