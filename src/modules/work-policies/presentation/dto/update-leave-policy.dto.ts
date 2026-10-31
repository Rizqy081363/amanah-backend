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

  @ApiPropertyOptional({
    example: 'non_overlapping',
    enum: ['non_overlapping', 'previous_period_must_finish'],
    description: 'Kebijakan pengajuan periode cuti (fleksibel non-overlapping vs ketat periode sebelumnya harus selesai)',
  })
  @IsIn(['non_overlapping', 'previous_period_must_finish'])
  @IsOptional()
  periodPolicy?: 'non_overlapping' | 'previous_period_must_finish';

  @ApiPropertyOptional({
    example: 2,
    description: 'Batas minimal hari pengajuan di muka (lead time)',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  noticeDaysRequired?: number;
}
