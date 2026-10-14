import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from '../../../../common/constants';

export class PatientDirectoryQueryDto {
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

  @ApiPropertyOptional({
    description: 'Pencarian nama pasien, nomor RM, NIK, atau nomor telepon',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    enum: ['male', 'female', 'all'],
    description: 'Filter jenis kelamin pasien',
  })
  @IsIn(['male', 'female', 'all'])
  @IsOptional()
  gender?: 'male' | 'female' | 'all';

  @ApiPropertyOptional({
    enum: ['active', 'inactive', 'all'],
    description: 'Filter status akun pasien',
  })
  @IsIn(['active', 'inactive', 'all'])
  @IsOptional()
  status?: 'active' | 'inactive' | 'all' = 'active';

  @ApiPropertyOptional({
    description: 'Pengurutan data (contoh: name:asc, totalAppointments:desc)',
  })
  @IsString()
  @IsOptional()
  sort?: string;
}
