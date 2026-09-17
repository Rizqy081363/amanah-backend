import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from '../constants/pagination.constants';

export class CursorPaginationDto {
  @ApiPropertyOptional({
    description:
      'Opaque cursor base64url untuk keyset pagination (API-089, ARC-081). Client tidak boleh merekayasa token ini.',
    example: 'eyJ0IjoiMjAyNi0wOS0xOFQwMDowMDowMC4wMDBaIiwiaWQiOiIxMjMifQ',
  })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({
    default: DEFAULT_PAGE_SIZE,
    minimum: MIN_PAGE_SIZE,
    maximum: MAX_PAGE_SIZE,
    description: `Batas jumlah record per halaman (ARC-080). Default: ${DEFAULT_PAGE_SIZE}, Maksimum: ${MAX_PAGE_SIZE}.`,
  })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PAGE_SIZE)
  @Max(MAX_PAGE_SIZE)
  @IsOptional()
  limit?: number = DEFAULT_PAGE_SIZE;
}
