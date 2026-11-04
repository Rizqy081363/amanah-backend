export interface ReligionEntity {
  id: string;
  name: string;
  description?: string | null;
  displayOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}
