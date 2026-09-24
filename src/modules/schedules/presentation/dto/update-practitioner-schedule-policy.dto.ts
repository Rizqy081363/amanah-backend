import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdatePractitionerSchedulePolicyDto {
  @ApiProperty({
    description:
      'Durasi konsultasi efektif per pasien dalam menit. Diubah oleh admin.',
    example: 30,
  })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(240)
  consultationDurationMinutes: number;

  @ApiPropertyOptional({
    description:
      'Presisi input menit yang diizinkan. Nilai 1 berarti arbitrary minute valid.',
    example: 1,
    default: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  @IsOptional()
  startPrecisionMinutes?: number;
}
