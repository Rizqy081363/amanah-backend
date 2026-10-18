import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class UpdateLeavePolicyDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Apakah persetujuan cuti memerlukan persetujuan admin',
  })
  @IsBoolean()
  @IsOptional()
  approvalRequired?: boolean;

  @ApiPropertyOptional({
    example: 'monthly_limit',
    enum: ['unlimited', 'monthly_limit'],
    description: 'Mode kuota izin bulanan',
  })
  @IsIn(['unlimited', 'monthly_limit'])
  @IsOptional()
  limitMode?: 'unlimited' | 'monthly_limit';

  @ApiPropertyOptional({
    example: 3,
    description: 'Batas maksimum hari cuti per bulan jika mode monthly_limit aktif',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  monthlyLimit?: number;

  @ApiPropertyOptional({
    example: 'per_request',
    enum: ['per_request', 'per_session'],
    description: 'Kebijakan penghitungan kuota cuti',
  })
  @IsIn(['per_request', 'per_session'])
  @IsOptional()
  quotaCountingPolicy?: 'per_request' | 'per_session';
}
