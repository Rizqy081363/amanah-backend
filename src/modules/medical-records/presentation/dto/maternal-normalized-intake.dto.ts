import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class HusbandProfileDto {
  @ApiProperty({ example: 'Ahmad Fauzi', description: 'Nama lengkap suami' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiPropertyOptional({
    example: '3201234567890002',
    description: 'NIK suami 16 digit',
  })
  @IsString()
  @Length(16, 16)
  @IsOptional()
  nik?: string;

  @ApiPropertyOptional({
    example: '1993-02-18',
    description: 'Tanggal lahir suami',
  })
  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @ApiPropertyOptional({ example: 31, description: 'Umur suami saat ini' })
  @IsInt()
  @IsOptional()
  age?: number;

  @ApiPropertyOptional({
    example: 'Karyawan Swasta',
    description: 'Pekerjaan suami',
  })
  @IsString()
  @IsOptional()
  job?: string;

  @ApiPropertyOptional({
    example: 'S1',
    description: 'Pendidikan terakhir suami',
  })
  @IsString()
  @IsOptional()
  education?: string;

  @ApiPropertyOptional({
    example: 'B',
    description: 'Golongan darah suami',
  })
  @IsString()
  @IsOptional()
  bloodType?: string;

  @ApiPropertyOptional({
    example: '081234567891',
    description: 'Nomor telepon suami',
  })
  @IsString()
  @IsOptional()
  phoneNumber?: string;
}

export class AnamnesisResponseDto {
  @ApiProperty({
    example: 'SMOKING_HABIT',
    description: 'Kode unik pertanyaan skrining',
  })
  @IsString()
  @IsNotEmpty()
  questionCode: string;

  @ApiPropertyOptional({
    example: 'tidak',
    description: 'Kode opsi pilihan yang dipilih pasien',
  })
  @IsString()
  @IsOptional()
  selectedOptionCode?: string;

  @ApiPropertyOptional({
    example: 'Tidak ada keluhan lingkungan',
    description: 'Jawaban isian teks bebas jika pertanyaan esai',
  })
  @IsString()
  @IsOptional()
  textResponse?: string;
}

export class HealthConditionResponseDto {
  @ApiProperty({
    example: 'HYPERTENSION',
    description: 'Kode unik penyakit/kondisi kesehatan',
  })
  @IsString()
  @IsNotEmpty()
  conditionCode: string;

  @ApiProperty({
    example: true,
    description: 'Apakah pasien memiliki atau pernah mengalami kondisi ini',
  })
  @IsBoolean()
  hasCondition: boolean;

  @ApiPropertyOptional({
    example: 2021,
    description: 'Tahun terdiagnosis',
  })
  @IsInt()
  @IsOptional()
  diagnosisYear?: number;

  @ApiPropertyOptional({
    example: 'Rutin kontrol dan minum amlodipin 5mg',
    description:
      'Catatan tambahan pengobatan atau nama penyakit jika kategori LAINNYA',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
