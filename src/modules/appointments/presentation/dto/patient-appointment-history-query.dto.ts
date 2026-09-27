import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class PatientAppointmentHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Filter status terminal janji temu',
    enum: ['completed', 'cancelled', 'no_show'],
  })
  @IsOptional()
  @IsIn(['completed', 'cancelled', 'no_show'])
  status?: 'completed' | 'cancelled' | 'no_show';

  @ApiPropertyOptional({
    description: 'Filter tanggal mulai riwayat (YYYY-MM-DD)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter tanggal akhir riwayat (YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
