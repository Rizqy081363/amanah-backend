import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class AdminDoctorScheduleDetailQueryDto {
  @ApiPropertyOptional({
    description:
      'Bulan yang diminta (bisa nomor 0-11, 1-12, atau format YYYY-MM)',
    example: '2026-09',
  })
  @IsOptional()
  @IsString()
  month?: string;

  @ApiPropertyOptional({
    description: 'Tahun kalender (contoh: 2026)',
    example: 2026,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @ApiPropertyOptional({
    description:
      'Tanggal spesifik untuk evaluasi sesi harian (format YYYY-MM-DD)',
    example: '2026-09-22',
  })
  @IsOptional()
  @IsString()
  date?: string;
}
