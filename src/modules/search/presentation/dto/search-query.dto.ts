import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchQueryDto {
  @ApiPropertyOptional({
    description: 'Kata kunci pencarian (nama, no RM, dsb.)',
  })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 30;

  @ApiPropertyOptional({
    description: 'Format pengurutan kolom: key:asc atau key:desc',
  })
  @IsString()
  @IsOptional()
  sort?: string;

  @ApiPropertyOptional({ description: 'Filter jenis kelamin' })
  @IsString()
  @IsOptional()
  gender?: string;

  @ApiPropertyOptional({ description: 'Filter status akun' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter golongan darah' })
  @IsString()
  @IsOptional()
  bloodType?: string;

  @ApiPropertyOptional({ description: 'Filter tanggal lahir awal (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  birthDateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter tanggal lahir akhir (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  birthDateTo?: string;

  @ApiPropertyOptional({ description: 'Filter tanggal registrasi awal' })
  @IsString()
  @IsOptional()
  registeredAtFrom?: string;

  @ApiPropertyOptional({ description: 'Filter tanggal registrasi akhir' })
  @IsString()
  @IsOptional()
  registeredAtTo?: string;
}
