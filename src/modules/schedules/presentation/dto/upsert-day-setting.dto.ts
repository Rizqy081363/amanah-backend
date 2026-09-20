import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class UpsertDaySettingDto {
  @ApiProperty({
    description: 'Tanggal spesifik jadwal (YYYY-MM-DD)',
    example: '2026-08-26',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Format tanggal harus YYYY-MM-DD',
  })
  date: string;

  @ApiPropertyOptional({
    description: 'Target kuota harian pasien dokter',
    example: 10,
    default: 8,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  targetQuota?: number;

  @ApiPropertyOptional({
    description: 'Status cuti dokter pada tanggal tersebut',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isCuti?: boolean;

  @ApiPropertyOptional({
    description: 'Alasan cuti dokter jika sedang cuti',
    example: 'Dokter Cuti Praktik: Simposium Medis',
  })
  @IsString()
  @IsOptional()
  cutiReason?: string | null;
}
