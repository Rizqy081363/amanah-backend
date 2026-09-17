import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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
}
