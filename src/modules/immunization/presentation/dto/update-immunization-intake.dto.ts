import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { gender, type Gender } from '../../../../database/schema';
import { ClinicalEntryInputDto } from './save-clinical-entries.dto';

export class UpdateImmunizationIntakeDto {
  @ApiPropertyOptional({ example: 'Aisyah Putri Ramadhani' })
  @IsString()
  @IsOptional()
  childName?: string;

  @ApiPropertyOptional({ example: '3404075201260002' })
  @IsString()
  @Length(16, 16)
  @IsOptional()
  childNik?: string;

  @ApiPropertyOptional({ example: '2026-01-12' })
  @IsDateString()
  @IsOptional()
  childBirthDate?: string;

  @ApiPropertyOptional({
    enum: gender.enumValues,
    example: 'female',
  })
  @IsIn(gender.enumValues)
  @IsOptional()
  childSex?: Gender;

  @ApiPropertyOptional({ example: '1 bln' })
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

  @ApiPropertyOptional({ example: 'Dewi Lestari' })
  @IsString()
  @IsOptional()
  motherName?: string;

  @ApiPropertyOptional({
    example: 'Jl. Anyelir I No. 243, Condongcatur, Sleman',
  })
  @IsString()
  @IsOptional()
  childAddress?: string;

  @ApiPropertyOptional({ example: 'Jl. Anyelir I No. 243' })
  @IsString()
  @IsOptional()
  line1?: string;

  @ApiPropertyOptional({ example: '34' })
  @IsString()
  @IsOptional()
  provinceCode?: string;

  @ApiPropertyOptional({ example: 'DI YOGYAKARTA' })
  @IsString()
  @IsOptional()
  provinceName?: string;

  @ApiPropertyOptional({ example: '3404' })
  @IsString()
  @IsOptional()
  regencyCode?: string;

  @ApiPropertyOptional({ example: 'KABUPATEN SLEMAN' })
  @IsString()
  @IsOptional()
  regencyName?: string;

  @ApiPropertyOptional({ example: '340407' })
  @IsString()
  @IsOptional()
  districtCode?: string;

  @ApiPropertyOptional({ example: 'DEPOK' })
  @IsString()
  @IsOptional()
  districtName?: string;

  @ApiPropertyOptional({ example: '3404072001' })
  @IsString()
  @IsOptional()
  villageCode?: string;

  @ApiPropertyOptional({ example: 'CONDONGCATUR' })
  @IsString()
  @IsOptional()
  villageName?: string;

  @ApiPropertyOptional({ example: 'HB 0 sudah diberikan' })
  @IsString()
  @IsOptional()
  previousVaccineHistory?: string;

  @ApiPropertyOptional({ example: 'Tidak ada riwayat alergi' })
  @IsString()
  @IsOptional()
  childAllergyHistory?: string;

  @ApiPropertyOptional({ type: [ClinicalEntryInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClinicalEntryInputDto)
  @IsOptional()
  entries?: ClinicalEntryInputDto[];
}
