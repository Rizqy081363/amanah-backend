import { MaternityIntakeEntity } from '../entities/maternity-intake.entity';

export const MATERNITY_REPOSITORY = Symbol('MATERNITY_REPOSITORY');

export interface MaternityHistoryQuery {
  patientId?: string;
  patientIds?: string[];
  page?: number;
  limit?: number;
  search?: string;
}

export interface MaternityHistoryResult {
  data: MaternityIntakeEntity[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface MaternityRepository {
  create(dto: any, submittedByUserId?: string): Promise<MaternityIntakeEntity>;
  update(id: string, dto: any): Promise<MaternityIntakeEntity | null>;
  findById(id: string): Promise<MaternityIntakeEntity | null>;
  findByAppointmentId(appointmentId: string): Promise<MaternityIntakeEntity | null>;
  findLatestByPatientId(patientId: string): Promise<MaternityIntakeEntity | null>;
  findByPatientId(patientId: string): Promise<MaternityIntakeEntity[]>;
  findMaternalHistory(
    patientIds: string[],
    query: MaternityHistoryQuery,
  ): Promise<MaternityHistoryResult>;
}
