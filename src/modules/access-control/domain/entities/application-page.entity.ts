import { RoleAudience } from '../../../../common/constants/role-audience.constants';

export class ApplicationPageEntity {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  routePath: string;
  parentPageId?: string | null;
  audience: RoleAudience;
  isEnabled: boolean;
  icon?: string | null;
  displayOrder: number;
  isSystem: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  children?: ApplicationPageEntity[];
  parentPage?: ApplicationPageEntity | null;
  effectiveEnabled?: boolean;
}
