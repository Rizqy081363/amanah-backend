import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ClinicalEntryInputDto {
  @ApiProperty({
    example: 0,
    description: 'Indeks baris milestone kanonikal (0 s/d 14)',
    minimum: 0,
    maximum: 14,
  })
  @IsInt()
  @Min(0)
  @Max(14)
  @IsNotEmpty()
  rowIndex: number;

  @ApiPropertyOptional({ example: 'HB 0' })
  @IsString()
  @IsOptional()
  vaccineName?: string;

  @ApiPropertyOptional({ example: 'HB_0' })
  @IsString()
  @IsOptional()
  vaccineCode?: string;

  @ApiProperty({
    enum: ['GIVEN', 'NOT_GIVEN', 'PENDING', 'POSTPONED', 'CONTRAINDICATED'],
    example: 'GIVEN',
  })
  @IsIn(['GIVEN', 'NOT_GIVEN', 'PENDING', 'POSTPONED', 'CONTRAINDICATED'])
  @IsNotEmpty()
  status: 'GIVEN' | 'NOT_GIVEN' | 'PENDING' | 'POSTPONED' | 'CONTRAINDICATED';

  @ApiPropertyOptional({ example: '2026-01-13' })
  @IsDateString()
  @IsOptional()
  injectionDate?: string | null;

  @ApiPropertyOptional({ example: '1 hari' })
  @IsString()
  @IsOptional()
  ageDisplay?: string | null;

  @ApiPropertyOptional({ example: 'Tidak', description: 'Gejala demam' })
  @IsString()
  @IsOptional()
  fever?: string | null;

  @ApiPropertyOptional({ example: 'Tidak', description: 'Gejala batuk' })
  @IsString()
  @IsOptional()
  cough?: string | null;

  @ApiPropertyOptional({ example: 'Tidak', description: 'Gejala pilek' })
  @IsString()
  @IsOptional()
  runnyNose?: string | null;

  @ApiPropertyOptional({
    example: 3.2,
    description: 'Berat Badan (BB) dalam kg',
  })
  @IsNumber()
  @Min(0.5)
  @Max(150)
  @IsOptional()
  weightKg?: number | null;

  @ApiPropertyOptional({
    example: 49.0,
    description: 'Panjang/Tinggi Badan (PB) dalam cm',
  })
  @IsNumber()
  @Min(20)
  @Max(250)
  @IsOptional()
  heightCm?: number | null;

  @ApiPropertyOptional({
    example: 34.0,
    description: 'Lingkar Kepala (LK) dalam cm',
  })
  @IsNumber()
  @Min(10)
  @Max(100)
  @IsOptional()
  headCircumferenceCm?: number | null;

  @ApiPropertyOptional({
    example: 36.7,
    description: 'Suhu Tubuh (S) dalam derajat Celsius',
  })
  @IsNumber()
  @Min(30)
  @Max(45)
  @IsOptional()
  temperatureCelsius?: number | null;

  @ApiPropertyOptional({ example: 'Kontrol BCG usia 1 bulan' })
  @IsString()
  @IsOptional()
  planning?: string | null;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @IsOptional()
  appointmentId?: string | null;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440002' })
  @IsUUID()
  @IsOptional()
  administeredBy?: string | null;

  @ApiPropertyOptional({ example: 'Catatan tambahan dokter/bidan' })
  @IsString()
  @IsOptional()
  notes?: string | null;
}

export class SaveClinicalEntriesDto {
  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @IsOptional()
  appointmentId?: string | null;

  @ApiProperty({ type: [ClinicalEntryInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClinicalEntryInputDto)
  entries: ClinicalEntryInputDto[];
}
