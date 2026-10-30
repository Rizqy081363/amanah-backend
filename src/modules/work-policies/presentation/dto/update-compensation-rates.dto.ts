import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class SingleRateDto {
  @ApiProperty({
    example: 'b39c7891-3918-441d-9ec6-8f4e9f280e07',
    description: 'ID Peran dari tabel roles di database',
  })
  @IsUUID('4')
  roleId: string;

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
