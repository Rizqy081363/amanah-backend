import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AdminDoctorSchedulesQueryDto {
  @ApiPropertyOptional({
    description: 'Halaman aktif (1-indexed)',
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Jumlah dokter per halaman (default 20 untuk infinite feed)',
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    description:
      'Filter sesi shift operasional (bisa koma jika multi, e.g. morning,afternoon)',
    example: 'morning',
  })
  @IsOptional()
  @IsString()
  session?: string;

  @ApiPropertyOptional({
    description:
      'Kata kunci pencarian (nama dokter, spesialisasi, atau ruangan)',
    example: 'Sarah',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter nama poli atau spesialisasi (bisa koma jika multi)',
    example: 'Penyakit Dalam',
  })
  @IsOptional()
  @IsString()
  poli?: string;

  @ApiPropertyOptional({
    description:
      'Filter status operasional atau lifecycle dokter (OPEN, CLOSED, PENDING, ON_LEAVE, ACTIVE, INACTIVE). Comma-separated values are allowed.',
    example: 'OPEN',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter bulan (format YYYY-MM)',
    example: '2026-09',
  })
  @IsOptional()
  @IsString()
  month?: string;

  @ApiPropertyOptional({
    description: 'Tanggal evaluasi jadwal dokter (format YYYY-MM-DD)',
    example: '2026-09-22',
  })
  @IsOptional()
  @IsString()
  date?: string;
}
