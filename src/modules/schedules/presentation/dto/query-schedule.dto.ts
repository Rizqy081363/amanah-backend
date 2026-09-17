import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from '../../../../common/constants';

export class QueryScheduleDto {
  @ApiPropertyOptional({
    description: 'Filter berdasarkan ID Poliklinik',
  })
  @IsString()
  @IsOptional()
  poliklinikId?: string;

  @ApiPropertyOptional({
    description: 'Filter berdasarkan ID Staf Dokter',
  })
  @IsString()
  @IsOptional()
  staffId?: string;

  @ApiPropertyOptional({
    example: '2026-09-18',
    description: 'Filter tanggal jadwal (YYYY-MM-DD)',
  })
  @IsString()
  @IsOptional()
  date?: string;

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
