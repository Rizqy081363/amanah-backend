import { z } from 'zod';

export const PAGE_BULK_ACTIONS = ['move', 'detach', 'toggle_status', 'restore', 'reorder'] as const;

export const BulkPageRestoreItemSchema = z.object({
  id: z.string().uuid('ID halaman harus berupa UUID valid'),
  parentPageId: z.string().uuid('ID folder induk harus berupa UUID valid').optional().nullable(),
  displayOrder: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
});

export const BulkPageActionSchema = z.object({
  action: z.enum(PAGE_BULK_ACTIONS, {
    message: 'Aksi massal halaman tidak valid (move | detach | toggle_status | restore | reorder)',
  }),
  pageIds: z
    .array(z.string().uuid('Setiap ID halaman harus berupa UUID valid'))
    .min(1, 'Minimal satu ID halaman harus dipilih')
    .max(100, 'Maksimal 100 ID halaman dalam satu permintaan'),
  targetParentId: z
    .string()
    .uuid('ID target folder induk harus berupa UUID valid')
    .optional()
    .nullable(),
  isEnabled: z.boolean().optional(),
  restoreStates: z.array(BulkPageRestoreItemSchema).optional(),
});

export type BulkPageActionInput = z.infer<typeof BulkPageActionSchema>;
export type BulkPageRestoreItem = z.infer<typeof BulkPageRestoreItemSchema>;
