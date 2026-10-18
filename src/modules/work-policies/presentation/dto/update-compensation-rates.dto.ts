import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class SingleRateDto {
  @ApiProperty({
    example: 'doctor',
    enum: ['doctor', 'midwife', 'worker'],
    description: 'Kategori profesi staf',
  })
  @IsIn(['doctor', 'midwife', 'worker'])
  category: 'doctor' | 'midwife' | 'worker';

  @ApiProperty({
    example: 150000,
    description: 'Tarif dasar kerja per jam (Rupiah)',
  })
  @IsNumber()
  @Min(0)
  hourlyRate: number;

  @ApiProperty({
    example: 200000,
    description: 'Tarif lembur / pengganti per jam (Rupiah)',
  })
  @IsNumber()
  @Min(0)
  overtimeHourlyRate: number;

  @ApiPropertyOptional({
    example: 'Tarif dokter spesialis / umum',
    description: 'Catatan tarif opsional',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateCompensationRatesDto {
  @ApiProperty({
    type: [SingleRateDto],
    description: 'Daftar tarif kompensasi untuk seluruh kategori',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SingleRateDto)
  rates: SingleRateDto[];
}
