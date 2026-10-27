import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { ChildImmunizationEntryItemDto } from './create-child-immunization-intake.dto';

export class UpdateChildImmunizationIntakeDto {
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

  @ApiPropertyOptional({ example: {} })
  @IsObject()
  @IsOptional()
  answers?: Record<string, any>;
}
