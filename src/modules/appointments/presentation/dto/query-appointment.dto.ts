import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from '../../../../common/constants';

export class QueryAppointmentDto {
  @ApiPropertyOptional({
    description: 'Filter berdasarkan ID Poliklinik',
  })
  @IsString()
  @IsOptional()
  poliklinikId?: string;

  @ApiPropertyOptional({
    example: '2026-09-18',
    description: 'Filter tanggal kunjungan (YYYY-MM-DD)',
  })
  @IsString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({
    enum: ['PAGI', 'SIANG', 'MALAM'],
    description: 'Filter sesi giliran praktek',
  })
  @IsString()
  @IsOptional()
  session?: string;

  @ApiPropertyOptional({
    description: 'Filter status antrean/janji temu',
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter berdasarkan ID Pasien',
  })
  @IsString()
  @IsOptional()
  patientId?: string;

  @ApiPropertyOptional({
    description:
      'Opaque cursor base64url untuk keyset pagination (API-089, ARC-081). Mengambil data berikutnya secara $O(1)$.',
  })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    default: DEFAULT_PAGE_SIZE,
    minimum: MIN_PAGE_SIZE,
    maximum: MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PAGE_SIZE)
  @Max(MAX_PAGE_SIZE)
  @IsOptional()
  limit?: number = DEFAULT_PAGE_SIZE;
}
