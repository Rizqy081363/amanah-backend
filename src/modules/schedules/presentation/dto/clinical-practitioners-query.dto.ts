import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ClinicalPractitionersQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter berdasarkan nama poliklinik atau layanan (contoh: Penyakit Dalam, Kebidanan & Kandungan)',
    example: 'Penyakit Dalam',
  })
  @IsOptional()
  @IsString()
  service?: string;

  @ApiPropertyOptional({
    description:
      'Filter tanggal praktik untuk mengecek ketersediaan dokter (format YYYY-MM-DD)',
    example: '2026-09-22',
  })
  @IsOptional()
  @IsString()
  date?: string;
}
