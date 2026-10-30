export class PermissionEntity {
  id: string;
  code: string;
  description?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
