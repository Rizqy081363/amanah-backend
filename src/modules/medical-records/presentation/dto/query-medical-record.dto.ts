import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class QueryMedicalRecordDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter berdasarkan ID Pasien' })
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @ApiPropertyOptional({
    description: 'Filter berdasarkan ID Praktisi / Dokter',
  })
  @IsUUID()
  @IsOptional()
  practitionerId?: string;

  @ApiPropertyOptional({ description: 'Filter berdasarkan ID Layanan Klinis' })
  @IsUUID()
  @IsOptional()
  serviceId?: string;

  @ApiPropertyOptional({
    enum: ['planned', 'in_progress', 'completed', 'cancelled'],
    description: 'Filter status encounter',
  })
  @IsEnum(['planned', 'in_progress', 'completed', 'cancelled'])
  @IsOptional()
  status?: 'planned' | 'in_progress' | 'completed' | 'cancelled';

  @ApiPropertyOptional({
    enum: ['pregnancy', 'immunization', 'general'],
    description: 'Filter flow type medis',
  })
  @IsEnum(['pregnancy', 'immunization', 'general'])
  @IsOptional()
  flowType?: 'pregnancy' | 'immunization' | 'general';

  @ApiPropertyOptional({ description: 'Filter tanggal mulai (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter tanggal akhir (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Pencarian bebas di keluhan, diagnosis, atau tindakan',
  })
  @IsString()
  @IsOptional()
  search?: string;
}
