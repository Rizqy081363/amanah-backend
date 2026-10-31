import type { ServiceCategoryCatalogDto } from '../../presentation/dto/service-catalog.dto';
import { LayananPoliEntity, PoliklinikEntity } from '../entities/clinic.entity';

export const CLINIC_REPOSITORY = 'CLINIC_REPOSITORY';

export interface ClinicRepository {
  findAllPoliklinik(): Promise<PoliklinikEntity[]>;
  findPoliklinikById(id: string): Promise<PoliklinikEntity | null>;
  findPoliklinikByKode(kode: string): Promise<PoliklinikEntity | null>;
  findLayananByPoliId(poliklinikId: string): Promise<LayananPoliEntity[]>;
  findLayananById(id: string): Promise<LayananPoliEntity | null>;
  getCatalog(): Promise<ServiceCategoryCatalogDto[]>;
}
