import { LayananPoliEntity, PoliklinikEntity } from '../entities/clinic.entity';

export const CLINIC_REPOSITORY = 'CLINIC_REPOSITORY';

export interface ClinicRepository {
  createPoliklinik(data: {
    namaPoli: string;
    kodePoli: string;
    deskripsi?: string | null;
    isActive?: boolean;
  }): Promise<PoliklinikEntity>;
  findAllPoliklinik(): Promise<PoliklinikEntity[]>;
  findPoliklinikById(id: string): Promise<PoliklinikEntity | null>;
  findPoliklinikByKode(kode: string): Promise<PoliklinikEntity | null>;
  updatePoliklinik(
    id: string,
    data: Partial<PoliklinikEntity>,
  ): Promise<PoliklinikEntity | null>;
  deletePoliklinik(id: string): Promise<boolean>;

  createLayanan(
    poliklinikId: string,
    data: {
      namaLayanan: string;
      deskripsi?: string | null;
      medicalFlow?: 'general' | 'pregnancy' | 'immunization';
    },
  ): Promise<LayananPoliEntity>;
  findLayananByPoliId(poliklinikId: string): Promise<LayananPoliEntity[]>;
  findLayananById(id: string): Promise<LayananPoliEntity | null>;
  updateLayanan(
    id: string,
    data: Partial<LayananPoliEntity>,
  ): Promise<LayananPoliEntity | null>;
  deleteLayanan(id: string): Promise<boolean>;
}
