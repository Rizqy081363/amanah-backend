import type { Catalog } from '../catalog.types';
import { patientsCatalog } from './patients.catalog';

export const registry: Record<string, Catalog> = {
  [patientsCatalog.key]: patientsCatalog,
};

export { patientsCatalog };
