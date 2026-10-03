import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

export class ChildImmunizationEntryItemDto {
  @ApiProperty({
    example: 'HB_0',
    description: 'Kode vaksin dari master katalog',
  })
  @IsString()
  @IsNotEmpty()
  vaccineCode: string;

  @ApiProperty({
    enum: ['GIVEN', 'NOT_GIVEN', 'UNKNOWN'],
    example: 'GIVEN',
    description: 'Status pemberian vaksin',
  })
  @IsIn(['GIVEN', 'NOT_GIVEN', 'UNKNOWN'])
  @IsNotEmpty()
  status: 'GIVEN' | 'NOT_GIVEN' | 'UNKNOWN';

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsDateString()
  @IsOptional()
  givenDate?: string | null;

  @ApiPropertyOptional({ example: '2026-03' })
  @IsString()
  @IsOptional()
  givenMonth?: string | null;

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @IsOptional()
  ageEstimateMonths?: number | null;

  @ApiPropertyOptional({
    enum: ['EXACT', 'MONTH_YEAR', 'AGE_ESTIMATE', 'NONE'],
    example: 'EXACT',
  })
  @IsIn(['EXACT', 'MONTH_YEAR', 'AGE_ESTIMATE', 'NONE'])
  @IsOptional()
  datePrecision?: 'EXACT' | 'MONTH_YEAR' | 'AGE_ESTIMATE' | 'NONE' | null;

  @ApiPropertyOptional({ example: ['DATE_APPROXIMATE'] })
  @IsOptional()
  reviewReasons?: any;

  @ApiPropertyOptional({ example: 'Diberikan di Posyandu' })
  @IsString()
  @IsOptional()
  notes?: string | null;
}

export class CreateChildImmunizationIntakeDto {
  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @IsOptional()
  appointmentId?: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @ApiPropertyOptional({ example: 'Rayyan Al-Fatih' })
  @IsString()
  @IsOptional()
  childName?: string;

  @ApiPropertyOptional({ example: '3201234567890003' })
  @IsString()
  @Length(16, 16)
  @IsOptional()
  childNik?: string;

  @ApiPropertyOptional({ example: '2025-06-15' })
  @IsDateString()
  @IsOptional()
  childBirthDate?: string;

  @ApiPropertyOptional({
    enum: ['Laki-laki', 'Perempuan'],
    example: 'Laki-laki',
  })
  @IsIn(['Laki-laki', 'Perempuan'])
  @IsOptional()
  childSex?: 'Laki-laki' | 'Perempuan';

  @ApiPropertyOptional({ example: '1 tahun 3 bulan' })
  @IsString()
  @IsOptional()
  childAgeFormatted?: string;

  @ApiPropertyOptional({ example: '081234567890' })
  @IsString()
  @IsOptional()
  parentPhone?: string;

  @ApiPropertyOptional({ example: 'Ahmad Fauzi' })
  @IsString()
  @IsOptional()
  fatherName?: string;

  @ApiPropertyOptional({ example: 'Siti Aminah' })
  @IsString()
  @IsOptional()
  motherName?: string;

  @ApiPropertyOptional({ example: 'Jl. Anyelir 1 No. 243, Condongcatur' })
  @IsString()
  @IsOptional()
  childAddress?: string;

  @ApiPropertyOptional({
    example:
      'HB 0 sudah setelah lahir, BCG dan Polio 1 saat usia 1 bulan, DPT-HB-Hib 1-3 lengkap',
  })
  @IsString()
  @IsOptional()
  previousVaccineHistory?: string;

  @ApiPropertyOptional({
    example: 'Tidak ada riwayat alergi obat atau makanan',
  })
  @IsString()
  @IsOptional()
  childAllergyHistory?: string;

  @ApiPropertyOptional({
    example: 'Ya, pernah',
  })
  @IsString()
  @IsOptional()
  hasVaccineHistory?: string;

  @ApiPropertyOptional({
    example: 'Tidak ada alergi',
  })
  @IsString()
  @IsOptional()
  hasAllergyHistory?: string;

  @ApiPropertyOptional({ type: [ChildImmunizationEntryItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChildImmunizationEntryItemDto)
  @IsOptional()
  entries?: ChildImmunizationEntryItemDto[];
}
